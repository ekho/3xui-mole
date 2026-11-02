package tests

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"example.com/cabinet/backend/internal/modules/vpn"
	"github.com/google/uuid"
)

func TestNativePanelUpgrade(t *testing.T) {
	state := os.Getenv("PANEL_UPGRADE_STATE")
	if state == "" {
		t.Skip("requires owned panel-upgrade fixture")
	}
	read := func(name string) []byte {
		t.Helper()
		b, err := os.ReadFile(filepath.Join(state, name))
		if err != nil {
			t.Fatal("owned upgrade prerequisite missing")
		}
		return b
	}
	var metadata struct{ Purpose, Target string }
	if json.Unmarshal(read("runtime.json"), &metadata) != nil || metadata.Purpose != "panel-upgrade" {
		t.Fatal("unowned upgrade fixture")
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(read("cert.pem")) {
		t.Fatal("owned upgrade CA missing")
	}
	p := vpn.NewPanelClient(vpn.Config{PanelURL: "https://localhost:62444", PanelUsername: "local-operator", PanelPassword: strings.TrimSpace(string(read("panel-password"))), PanelRootCAs: roots})
	defer p.Close()
	ctx := context.Background()
	compatibility, err := p.Compatibility(ctx)
	if err != nil && compatibility.Status != "unsupported" {
		t.Fatal("upgrade status unavailable")
	}
	var expected []struct {
		Client struct {
			Email, UUID, SubID string
			ExpiryTime         int64
			LimitIP            int64 `json:"limitIp"`
			TotalGB            int64
			Enable             bool
		}
		InboundIDs []int64 `json:"inboundIds"`
	}
	if json.Unmarshal(read("expected.json"), &expected) != nil || len(expected) != 3 {
		t.Fatal("owned upgrade identities missing")
	}
	for _, original := range expected {
		view, e := p.GetClient(ctx, original.Client.Email)
		if e != nil || view == nil || view.VPNID.String() != original.Client.UUID || view.SubID != original.Client.SubID {
			t.Fatal("upgrade identity readback failed")
		}
		target := vpn.AccessTarget{PanelKey: view.PanelKey, VPNID: uuid.MustParse(original.Client.UUID), SubID: view.SubID, DeviceCount: original.Client.LimitIP - 1, TrafficLimitBytes: original.Client.TotalGB, ExpiryTimeMS: original.Client.ExpiryTime + 60000, Banned: !original.Client.Enable}
		if os.Getenv("PANEL_UPGRADE_PHASE") == "restored" {
			if compatibility.Status != "unsupported" || compatibility.PanelVersion != "3.10.0" || !errors.Is(p.UpdateAccess(ctx, view, target), vpn.ErrPanel) {
				t.Fatal("restored source was admitted for writes")
			}
			continue
		}
		if compatibility.Status != "supported" || compatibility.PanelVersion != metadata.Target {
			t.Fatal("upgraded panel not admitted")
		}
		if e = p.UpdateAccess(ctx, view, target); e != nil {
			t.Fatal("upgrade renewal failed")
		}
		updated, e := p.GetClient(ctx, view.PanelKey)
		if e != nil || updated == nil || updated.ExpiryTimeMS != target.ExpiryTimeMS || updated.Enabled != original.Client.Enable {
			t.Fatal("upgrade renewal changed state")
		}
		if e = p.ResetAccessTraffic(ctx, view.PanelKey); e != nil {
			t.Fatal("upgrade reset failed")
		}
		// A quota reset may re-enable a client; preserve the explicit source ban.
		if !original.Client.Enable && p.DisableAccess(ctx, view.PanelKey) != nil {
			t.Fatal("upgrade ban restore failed")
		}
		up, down, e := p.Traffic(ctx, view.PanelKey, view.VPNID, view.SubID)
		if e != nil || up != 0 || down != 0 {
			t.Fatal("upgrade traffic reset unconfirmed")
		}
	}
	t.Logf("PASS upgrade adapter phase=%s panel=%s xray=%s", os.Getenv("PANEL_UPGRADE_PHASE"), compatibility.PanelVersion, compatibility.XrayVersion)
}
