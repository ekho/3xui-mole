package vpn

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestServerPoolCompatibility(t *testing.T) {
	e, s, _, _, b := poolFixture(t)
	ctx := context.Background()
	registerPoolServer(t, e, s, ServerInput{ID: "b", Name: "secondary", Host: b.URL})
	var status, reason string
	if err := e.Pool.QueryRow(ctx, "SELECT panel_compatibility,panel_compatibility_reason FROM vpn_servers WHERE id='b'").Scan(&status, &reason); err != nil || status != "unknown" || reason != "not_checked" {
		t.Fatalf("new server defaults %s %s: %v", status, reason, err)
	}
	if err := s.SyncServers(ctx); err != nil {
		t.Fatal(err)
	}
	rows, err := s.servers(ctx, s.pool)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.Compatibility.Status != "supported" || r.Compatibility.PanelVersion != "3.11.0" {
			t.Fatalf("missing compatibility: %+v", r)
		}
	}
	rows[0].Compatibility = PanelCompatibility{PanelVersion: "3.7.0", Status: "supported"}
	got, err := chooseServer(rows)
	if err != nil || got.ID != "b" {
		t.Fatalf("unsupported stored success selected: %+v %v", got, err)
	}
	rows[1].Compatibility = PanelCompatibility{Status: "unknown"}
	if _, err = chooseServer(rows); !errors.Is(err, ErrPanel) {
		t.Fatal("unknown server selected")
	}
	rows[1].Compatibility = PanelCompatibility{PanelVersion: "3.10.2", Status: "supported"}
	if got, err = chooseServer(rows); err != nil || got.ID != "b" {
		t.Fatal("mixed supported release rejected")
	}
}

func TestServerManagementLegacyCompatibilityReplay(t *testing.T) {
	var old managedStoredServer
	if err := json.Unmarshal([]byte(`{"ID":"old","Online":true,"Host":"https://old.example.test"}`), &old); err != nil {
		t.Fatal(err)
	}
	got := old.server()
	if got.Compatibility.Status != "unknown" || got.Compatibility.Reason != "not_checked" {
		t.Fatal("legacy action implied compatibility")
	}
	old = managedSnapshot(Server{ID: "new", Compatibility: PanelCompatibility{PanelVersion: "3.11.0", Status: "supported"}})
	if old.server().Compatibility.PanelVersion != "3.11.0" {
		t.Fatal("action replay lost compatibility")
	}
}
