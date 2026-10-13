package tests

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func serveBrowserAsset(w http.ResponseWriter, r *http.Request, path string) {
	if filepath.Base(path) != "index.html" || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
		http.ServeFile(w, r, path)
		return
	}
	document, err := os.ReadFile(path)
	if err != nil || !bytes.HasPrefix(document, []byte("{{ $cspNonce :=")) {
		http.ServeFile(w, r, path)
		return
	}
	// These fixtures serve owned build output without Caddy. Render only its
	// document nonce; never evaluate templates from API responses or assets.
	start := bytes.Index(document, []byte("<!doctype html>"))
	if start < 0 {
		http.Error(w, "invalid fixture browser document", http.StatusInternalServerError)
		return
	}
	var secret [24]byte
	if _, err := rand.Read(secret[:]); err != nil {
		http.Error(w, "fixture browser nonce unavailable", http.StatusInternalServerError)
		return
	}
	nonce := base64.StdEncoding.EncodeToString(secret[:])
	document = bytes.ReplaceAll(document[start:], []byte("{{ $cspNonce }}"), []byte(nonce))
	policy := regexp.MustCompile(`http-equiv="Content-Security-Policy" content="([^"]+)"`).FindSubmatch(document)
	if len(policy) != 2 {
		http.Error(w, "fixture browser policy unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Security-Policy", string(policy[1])+"; frame-ancestors 'none'")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodHead {
		_, _ = w.Write(document)
	}
}

func TestBrowserDocumentRendersFreshNonce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "index.html")
	document := `{{ $cspNonce := randAlphaNum 32 -}}{{ .RespHeader.Set "Content-Security-Policy" "owned template" -}}<!doctype html>
<html><head><meta property="csp-nonce" nonce="{{ $cspNonce }}"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'nonce-{{ $cspNonce }}'; object-src 'none'"></head><body>Account</body></html>`
	if err := os.WriteFile(path, []byte(document), 0600); err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, method := range []string{http.MethodGet, http.MethodGet, http.MethodHead} {
		w := httptest.NewRecorder()
		serveBrowserAsset(w, httptest.NewRequest(method, "/cabinet", nil), path)
		if w.Code != http.StatusOK {
			t.Fatalf("document status: %d", w.Code)
		}
		policy := w.Header().Get("Content-Security-Policy")
		match := regexp.MustCompile(`style-src 'self' 'nonce-([^']+)'`).FindStringSubmatch(policy)
		if len(match) != 2 {
			t.Fatal("browser document lacks a rendered style nonce")
		}
		nonce := match[1]
		decoded, err := base64.StdEncoding.DecodeString(nonce)
		if err != nil || len(decoded) < 24 || seen[nonce] {
			t.Fatal("document nonce must be fresh and cryptographically sized")
		}
		seen[nonce] = true
		if !strings.Contains(policy, "frame-ancestors 'none'") || strings.Contains(policy, "unsafe-inline") || strings.Contains(policy, "unsafe-eval") {
			t.Fatal("ordinary browser policy must retain strict framing and script boundaries")
		}
		if w.Header().Get("Cache-Control") != "no-store" || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/html") {
			t.Fatal("nonce-bearing HTML must not be cached")
		}
		if method == http.MethodHead {
			if w.Body.Len() != 0 {
				t.Fatal("HEAD must retain headers without returning the document")
			}
			continue
		}
		body := w.Body.Bytes()
		if !bytes.HasPrefix(body, []byte("<!doctype html>")) || bytes.Contains(body, []byte("{{")) || !bytes.Contains(body, []byte(`nonce="`+nonce+`"`)) || !bytes.Contains(body, []byte("'nonce-"+nonce+"'")) {
			t.Fatal("owned HTML template must render with matching header and meta nonces")
		}
	}
}

func TestBrowserAssetsKeepMiniAndDataUntemplated(t *testing.T) {
	for _, name := range []string{"mini-app.html", "config.json", "app.js"} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), name)
			body := []byte(`owned asset with literal {{ $cspNonce }}`)
			if err := os.WriteFile(path, body, 0600); err != nil {
				t.Fatal(err)
			}
			w := httptest.NewRecorder()
			serveBrowserAsset(w, httptest.NewRequest(http.MethodGet, "/"+name, nil), path)
			if w.Code != http.StatusOK || !bytes.Equal(w.Body.Bytes(), body) || w.Header().Get("Content-Security-Policy") != "" {
				t.Fatal("Mini App and non-document assets must retain their own bytes and policy")
			}
		})
	}
}
