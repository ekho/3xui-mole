package tests

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"example.com/cabinet/backend/internal/modules/vpn"
	"github.com/google/uuid"
)

func TestNativePanelCompatibility(t *testing.T) {
	if os.Getenv("NATIVE_DOCKER_STATE") == "" {
		t.Skip("requires owned native panel; synthetic execution is not compatibility evidence")
	}
	f := openMode(t, true)
	ctx := context.Background()
	jar, _ := cookiejar.New(nil)
	setup := &http.Client{Jar: jar, Timeout: 10 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: f.cfg.VPN.Panel.PanelRootCAs, MinVersion: tls.VersionTLS12}}}
	t.Cleanup(setup.CloseIdleConnections)
	csrf := ""
	call := func(path string, body any) json.RawMessage {
		t.Helper()
		var data []byte
		method := "GET"
		if body != nil {
			var err error
			data, err = json.Marshal(body)
			if err != nil {
				t.Fatal("invalid owned panel fixture")
			}
			method = "POST"
		}
		req, err := http.NewRequestWithContext(ctx, method, f.cfg.VPN.Panel.PanelURL+"/"+path, bytes.NewReader(data))
		if err != nil {
			t.Fatal("invalid owned panel request")
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept-Language", "en-US")
		req.Header.Set("X-CSRF-Token", csrf)
		response, err := setup.Do(req)
		if err != nil {
			t.Fatal("owned TLS panel unavailable")
		}
		defer response.Body.Close()
		var result struct {
			Success bool            `json:"success"`
			Obj     json.RawMessage `json:"obj"`
		}
		if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result) != nil || !result.Success {
			t.Fatalf("owned panel API rejected %s (HTTP %d)", path, response.StatusCode)
		}
		return result.Obj
	}
	if json.Unmarshal(call("csrf-token", nil), &csrf) != nil || csrf == "" {
		t.Fatal("owned panel CSRF missing")
	}
	call("login", map[string]string{"username": f.cfg.VPN.Panel.PanelUsername, "password": f.cfg.VPN.Panel.PanelPassword})
	createToken := func(scope string) string {
		t.Helper()
		var token struct {
			ID    int    `json:"id"`
			Token string `json:"token"`
		}
		if json.Unmarshal(call("panel/api/setting/apiTokens/create", map[string]any{"name": "compat-" + uuid.NewString(), "scope": scope, "expiresAt": 0}), &token) != nil || token.ID <= 0 || token.Token == "" {
			t.Fatal("owned API token unavailable")
		}
		t.Cleanup(func() {
			call("panel/api/setting/apiTokens/delete/"+strconv.Itoa(token.ID), map[string]string{"expectedScope": scope})
		})
		return token.Token
	}
	config := f.cfg.VPN.Panel
	config.PanelUsername, config.PanelPassword = "", ""
	config.PanelToken = createToken("admin")
	p := vpn.NewPanelClient(config)
	defer p.Close()
	compatibility, err := p.Compatibility(ctx)
	if err != nil || compatibility.Status != "supported" {
		t.Fatal("native panel release is not admitted")
	}
	for _, tc := range []struct {
		token  string
		status int
	}{{"owned-invalid-token", 401}, {createToken("monitor"), 403}} {
		client := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: config.PanelRootCAs, MinVersion: tls.VersionTLS12}}}
		req, _ := http.NewRequest("GET", config.PanelURL+"/panel/api/clients/list", nil)
		req.Header.Set("Authorization", "Bearer "+tc.token)
		response, e := client.Do(req)
		if e != nil {
			t.Fatal("owned authorization probe unavailable")
		}
		response.Body.Close()
		client.CloseIdleConnections()
		if response.StatusCode != tc.status {
			t.Fatalf("native token boundary HTTP %d, want %d", response.StatusCode, tc.status)
		}
	}
	ids, err := p.RegularInboundIDs(ctx)
	if err != nil || len(ids) == 0 {
		t.Fatal("owned regular inbound unavailable")
	}
	var inbounds []struct {
		ID  int64  `json:"id"`
		Tag string `json:"tag"`
	}
	if json.Unmarshal(call("panel/api/inbounds/list", nil), &inbounds) != nil {
		t.Fatal("invalid owned inbound list")
	}
	probe := int64(0)
	for _, v := range inbounds {
		if v.Tag == "local-probe-vless" {
			probe = v.ID
		}
	}
	if probe == 0 {
		t.Fatal("owned preflight probe inbound missing")
	}
	target := vpn.ProvisionTarget{PanelKey: "compat_" + strings.ReplaceAll(uuid.NewString(), "-", ""), VPNID: uuid.New(), SubID: strings.ReplaceAll(uuid.NewString(), "-", "")[:16], InboundIDs: []int64{ids[0]}, ExpiryTimeMS: time.Now().Add(time.Hour).UnixMilli(), DeviceCount: 2, TrafficLimitBytes: 1 << 30}
	if err = p.AddClient(ctx, target); err != nil {
		t.Fatal("native add failed")
	}
	t.Cleanup(func() {
		call("panel/api/clients/del/"+url.PathEscape(target.PanelKey), map[string]any{})
	})
	view, err := p.GetClient(ctx, target.PanelKey)
	if err != nil || view == nil || !vpn.Matches(view, target, time.Now()) {
		t.Fatal("native add readback mismatch")
	}
	if err = p.Attach(ctx, target.PanelKey, []int64{probe}); err != nil {
		t.Fatal("native attach failed")
	}
	if err = p.Detach(ctx, target.PanelKey, []int64{probe}); err != nil {
		t.Fatal("native detach failed")
	}
	var bindings []int64
	if compatibility.PanelVersion == "3.11.0" {
		groupID := strings.ReplaceAll(uuid.NewString(), "-", "")[:16]
		call("panel/api/hosts/add", map[string]any{"groupId": groupID, "inboundIds": []int64{ids[0]}, "hosts": []string{"localhost", "excluded.example.test"}, "remark": "compat-" + target.PanelKey, "security": "same", "randomCount": 1, "cipherSuites": "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256", "fingerprint": "unsafe"})
		t.Cleanup(func() {
			call("panel/api/hosts/del/"+url.PathEscape(groupID), map[string]any{})
		})
		var hosts []struct {
			ID      int64  `json:"id"`
			Group   string `json:"groupId"`
			Address string `json:"address"`
		}
		if json.Unmarshal(call("panel/api/hosts/raw", nil), &hosts) != nil {
			t.Fatal("owned host records unavailable")
		}
		for _, host := range hosts {
			if host.Group == groupID && host.Address == "localhost" {
				bindings = append(bindings, host.ID)
			}
		}
		if len(bindings) != 1 {
			t.Fatal("owned selected host identity missing")
		}
		view.Raw["clientHostRuleIds"], _ = json.Marshal(bindings)
	}
	access := vpn.AccessTarget{PanelKey: target.PanelKey, VPNID: target.VPNID, SubID: target.SubID, DeviceCount: target.DeviceCount, TrafficLimitBytes: target.TrafficLimitBytes, ExpiryTimeMS: target.ExpiryTimeMS + 60000}
	if err = p.UpdateAccess(ctx, view, access); err != nil {
		t.Fatal("native update failed")
	}
	updated, err := p.GetClient(ctx, target.PanelKey)
	if err != nil || updated == nil || updated.VPNID != target.VPNID || updated.SubID != target.SubID || updated.LimitIP != 3 || updated.ExpiryTimeMS != access.ExpiryTimeMS || !reflect.DeepEqual(updated.InboundIDs, target.InboundIDs) {
		t.Fatal("native update changed identity, units or memberships")
	}
	if compatibility.PanelVersion == "3.11.0" {
		var got []int64
		if json.Unmarshal(updated.Raw["clientHostRuleIds"], &got) != nil || !reflect.DeepEqual(got, bindings) {
			t.Fatal("native update lost host binding")
		}
		var settings struct {
			JSONPath  string `json:"subJsonPath"`
			ClashPath string `json:"subClashPath"`
		}
		if json.Unmarshal(call("panel/api/setting/all", map[string]any{}), &settings) != nil {
			t.Fatal("owned subscription settings unavailable")
		}
		base, _ := url.Parse(f.cfg.Subscriptions.SubscriptionBaseURL)
		for i, path := range []string{base.Path, settings.JSONPath, settings.ClashPath} {
			if path == "" {
				t.Fatal("owned subscription format disabled")
			}
			address := *base
			address.Path = strings.TrimRight(path, "/") + "/" + target.SubID
			response, e := setup.Get(address.String())
			if e != nil {
				t.Fatal("owned subscription unavailable")
			}
			body, e := io.ReadAll(io.LimitReader(response.Body, 1<<20))
			response.Body.Close()
			if e != nil || response.StatusCode != 200 || !strings.Contains(response.Header.Get("Cache-Control"), "no-store") {
				t.Fatalf("subscription response/cache boundary failed format=%d HTTP=%d cache=%q", i, response.StatusCode, response.Header.Get("Cache-Control"))
			}
			if i == 0 {
				body, e = base64.StdEncoding.DecodeString(string(body))
				if e != nil {
					t.Fatal("invalid raw subscription")
				}
				if !bytes.Contains(body, []byte("cs=")) {
					t.Fatal("cipher suites lost in raw link")
				}
			}
			if !bytes.Contains(body, []byte("localhost")) || bytes.Contains(body, []byte("excluded.example.test")) {
				t.Fatal("subscription ignored selected host binding")
			}
		}
	}
	if compatibility.PanelVersion == "3.11.0" {
		key, e := ecdh.X25519().GenerateKey(rand.Reader)
		if e != nil {
			t.Fatal("owned AmneziaWG key generation failed")
		}
		var inbound struct{ ID int64 }
		if json.Unmarshal(call("panel/api/inbounds/add", map[string]any{"enable": false, "listen": "0.0.0.0", "port": 24450, "protocol": "amneziawg", "tag": "compat-awg-" + uuid.NewString(), "remark": "Owned keepAlive preservation", "settings": map[string]any{"server": map[string]any{"privateKey": base64.StdEncoding.EncodeToString(key.Bytes()), "publicKey": base64.StdEncoding.EncodeToString(key.PublicKey().Bytes()), "subnetIp": "10.8.23.0", "subnetCidr": 24}, "clients": []any{}}, "streamSettings": map[string]any{}, "sniffing": map[string]any{"enabled": false}}), &inbound) != nil || inbound.ID == 0 {
			t.Fatal("owned disabled AmneziaWG inbound missing")
		}
		t.Cleanup(func() { call("panel/api/inbounds/del/"+strconv.FormatInt(inbound.ID, 10), map[string]any{}) })
		keyID, subID := "compat_range_"+strings.ReplaceAll(uuid.NewString(), "-", ""), strings.ReplaceAll(uuid.NewString(), "-", "")[:16]
		id := uuid.New()
		call("panel/api/clients/add", map[string]any{"client": map[string]any{"email": keyID, "id": id, "subId": subID, "enable": true, "expiryTime": target.ExpiryTimeMS, "totalGB": target.TrafficLimitBytes, "limitIp": 3, "keepAlive": "15-25"}, "inboundIds": []int64{ids[0], inbound.ID}})
		t.Cleanup(func() { call("panel/api/clients/del/"+keyID, map[string]any{}) })
		before, e := p.GetClient(ctx, keyID)
		if e != nil || before == nil || string(before.Raw["keepAlive"]) != `"15-25"` {
			t.Fatal("owned AmneziaWG range not persisted")
		}
		if e = p.UpdateAccess(ctx, before, vpn.AccessTarget{PanelKey: keyID, VPNID: id, SubID: subID, DeviceCount: 2, TrafficLimitBytes: target.TrafficLimitBytes, ExpiryTimeMS: target.ExpiryTimeMS + 60000}); e != nil {
			t.Fatal("shared AmneziaWG update failed")
		}
		after, e := p.GetClient(ctx, keyID)
		if e != nil || after == nil || string(after.Raw["keepAlive"]) != `"15-25"` {
			t.Fatal("shared update lost AmneziaWG range")
		}
	}

	if err = p.ResetAccessTraffic(ctx, target.PanelKey); err != nil {
		t.Fatal("native reset failed")
	}
	up, down, err := p.Traffic(ctx, target.PanelKey, target.VPNID, target.SubID)
	if err != nil || up != 0 || down != 0 {
		t.Fatal("native traffic reset not confirmed")
	}
	if err = p.DisableAccess(ctx, target.PanelKey); err != nil {
		t.Fatal("native bulk disable failed")
	}
	disabled, err := p.GetClient(ctx, target.PanelKey)
	if err != nil || disabled == nil || disabled.Enabled {
		t.Fatal("native disable not confirmed")
	}
	t.Logf("PASS native panel=%s xray=%s Bearer/session+CSRF CRUD/membership/traffic/subscriptions", compatibility.PanelVersion, compatibility.XrayVersion)
}
