package vpn

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func compatibilityPanel(t *testing.T, handler http.HandlerFunc) *PanelClient {
	t.Helper()
	server := httptest.NewTLSServer(handler)
	t.Cleanup(server.Close)
	roots := x509.NewCertPool()
	roots.AddCert(server.Certificate())
	p := NewPanelClient(Config{PanelURL: server.URL + "/fixture", PanelToken: "fixture", PanelRootCAs: roots})
	t.Cleanup(p.Close)
	return p
}

func TestPanelMutationCompatibility(t *testing.T) {
	id := uuid.MustParse("11111111-1111-4111-8111-111111111111")
	target := ProvisionTarget{PanelKey: "acct_fixture", VPNID: id, SubID: "fixture", InboundIDs: []int64{1}}
	access := AccessTarget{PanelKey: target.PanelKey, VPNID: id, SubID: target.SubID}
	view := &PanelClientView{PanelKey: target.PanelKey, VPNID: id, SubID: target.SubID, Raw: map[string]json.RawMessage{"uuid": json.RawMessage(`"11111111-1111-4111-8111-111111111111"`)}}
	methods := map[string]func(*PanelClient) error{
		"add":     func(p *PanelClient) error { return p.AddClient(context.Background(), target) },
		"attach":  func(p *PanelClient) error { return p.Attach(context.Background(), target.PanelKey, []int64{1}) },
		"detach":  func(p *PanelClient) error { return p.Detach(context.Background(), target.PanelKey, []int64{1}) },
		"update":  func(p *PanelClient) error { return p.UpdateAccess(context.Background(), view, access) },
		"reset":   func(p *PanelClient) error { return p.ResetAccessTraffic(context.Background(), target.PanelKey) },
		"disable": func(p *PanelClient) error { return p.DisableAccess(context.Background(), target.PanelKey) },
	}
	for _, version := range []string{"3.7.0", "3.10.0", "3.11.1", ""} {
		for name, run := range methods {
			t.Run(version+"/"+name, func(t *testing.T) {
				writes := 0
				p := compatibilityPanel(t, func(w http.ResponseWriter, r *http.Request) {
					if r.Method == http.MethodPost {
						writes++
					}
					json.NewEncoder(w).Encode(map[string]any{"success": true, "obj": map[string]string{"panelVersion": version}})
				})
				err := run(p)
				if err == nil || !errors.Is(err, ErrPanel) || writes != 0 {
					t.Fatalf("unsupported mutation err=%v writes=%d", err, writes)
				}
			})
		}
	}
	t.Run("version changes within operation", func(t *testing.T) {
		probes, writes := 0, 0
		p := compatibilityPanel(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				writes++
			}
			probes++
			version := "3.10.2"
			if probes > 1 {
				version = "3.11.0"
			}
			json.NewEncoder(w).Encode(map[string]any{"success": true, "obj": map[string]string{"panelVersion": version}})
		})
		if err := p.RequireCompatible(context.Background()); err != nil {
			t.Fatal(err)
		}
		err := p.ResetAccessTraffic(context.Background(), target.PanelKey)
		var compatibility *PanelCompatibilityError
		if !errors.As(err, &compatibility) || compatibility.Compatibility.Reason != "version_changed" || writes != 0 {
			t.Fatalf("changed version allowed: %v writes=%d", err, writes)
		}
	})
}

func TestPanelCompatibilityRegistry(t *testing.T) {
	for _, version := range []string{"3.10.2", "3.11.0", "v3.11.0"} {
		release, ok := LookupPanelRelease(version)
		if !ok || release.Version != strings.TrimPrefix(version, "v") || !strings.HasPrefix(release.Image, "ghcr.io/mhsanaei/3x-ui:"+release.Version+"@sha256:") || release.TestedXray == "" {
			t.Errorf("missing pinned release %q", version)
		}
	}
	for _, version := range []string{"", "3.7.0", "3.10.0", "3.11.1", "3.11.0-dev", "dev-latest", "vv3.11.0", " 3.11.0"} {
		if _, ok := LookupPanelRelease(version); ok {
			t.Errorf("unexpected supported release %q", version)
		}
	}
}

func TestPanelCompatibilityStatus(t *testing.T) {
	for _, tc := range []struct {
		name, body, status, reason string
		code                       int
	}{
		{"supported", `{"success":true,"obj":{"panelVersion":"3.11.0","xray":{"version":"26.10.21"}}}`, "supported", "", 200},
		{"old-supported", `{"success":true,"obj":{"panelVersion":"v3.10.2","xray":{"version":"26.10.10"}}}`, "supported", "", 200},
		{"core-is-not-panel", `{"success":true,"obj":{"panelVersion":"3.7.0","xray":{"version":"3.11.0"}}}`, "unsupported", "unsupported_version", 200},
		{"missing-core", `{"success":true,"obj":{"panelVersion":"3.11.0"}}`, "supported", "", 200},
		{"missing-panel", `{"success":true,"obj":{"xray":{"version":"3.11.0"}}}`, "unknown", "invalid_response", 200},
		{"null-panel", `{"success":true,"obj":{"panelVersion":null}}`, "unknown", "invalid_response", 200},
		{"numeric-panel", `{"success":true,"obj":{"panelVersion":311}}`, "unknown", "invalid_response", 200},
		{"unsafe-panel", `{"success":true,"obj":{"panelVersion":"3.11.0\nsecret"}}`, "unknown", "invalid_response", 200},
		{"long-panel", `{"success":true,"obj":{"panelVersion":"` + strings.Repeat("x", 65) + `"}}`, "unknown", "invalid_response", 200},
		{"rejected", `{"success":false}`, "unknown", "invalid_response", 200},
		{"malformed", `broken`, "unknown", "invalid_response", 200},
		{"oversized", strings.Repeat("x", 1024*1024+1), "unknown", "invalid_response", 200},
		{"unauthorized", `{}`, "unknown", "auth_failed", 401},
		{"forbidden", `{}`, "unknown", "auth_failed", 403},
		{"wrong-path", `{}`, "unknown", "invalid_response", 404},
		{"server-error", `{}`, "unknown", "unreachable", 500},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := compatibilityPanel(t, func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "GET" || r.URL.Path != "/fixture/panel/api/server/status" || r.Header.Get("Authorization") != "Bearer fixture" {
					t.Error("unexpected compatibility request")
				}
				w.WriteHeader(tc.code)
				_, _ = w.Write([]byte(tc.body))
			})
			got, err := p.Compatibility(context.Background())
			if got.Status != tc.status || got.Reason != tc.reason {
				t.Fatalf("compatibility=%+v err=%v", got, err)
			}
			if (err == nil) != (tc.status == "supported") || err != nil && !errors.Is(err, ErrPanel) {
				t.Fatalf("unsafe compatibility error %v", err)
			}
			if len(got.PanelVersion) > 64 || strings.ContainsAny(got.PanelVersion, "\r\n\t") {
				t.Fatal("unsafe version exposed")
			}
		})
	}
	t.Run("cancelled", func(t *testing.T) {
		p := compatibilityPanel(t, func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() })
		ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
		defer cancel()
		got, err := p.Compatibility(ctx)
		if got.Status != "unknown" || err == nil {
			t.Fatal("cancelled probe admitted panel")
		}
	})
	t.Run("TLS", func(t *testing.T) {
		server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(map[string]any{"success": true})
		}))
		defer server.Close()
		p := NewPanelClient(Config{PanelURL: server.URL, PanelToken: "fixture"})
		defer p.Close()
		got, err := p.Compatibility(context.Background())
		if got.Status != "unknown" || err == nil {
			t.Fatal("untrusted TLS admitted panel")
		}
	})
}
