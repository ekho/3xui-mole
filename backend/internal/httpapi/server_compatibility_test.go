package httpapi

import (
	"encoding/json"
	"example.com/cabinet/backend/internal/modules/vpn"
	"testing"
)

func TestManagedServerCompatibilityContract(t *testing.T) {
	for _, c := range []vpn.PanelCompatibility{{PanelVersion: "3.11.0", XrayVersion: "26.10.21", Status: "supported"}, {PanelVersion: "3.7.0", Status: "unsupported", Reason: "unsupported_version"}, {}} {
		v := vpn.Server{ID: "fixture", Compatibility: c}
		for _, value := range []any{serverSummary(v), serverDetail(v)} {
			raw, _ := json.Marshal(value)
			var fields map[string]any
			if err := json.Unmarshal(raw, &fields); err != nil {
				t.Fatal(err)
			}
			want := c.Status
			if want == "" {
				want = "unknown"
			}
			if fields["compatibility"] != want {
				t.Fatalf("missing status: %s", raw)
			}
			for _, key := range []string{"panel_version", "xray_version", "compatibility_reason"} {
				if _, ok := fields[key]; !ok {
					t.Fatalf("missing required nullable field %s", key)
				}
			}
			if c.PanelVersion != "" && fields["panel_version"] != c.PanelVersion {
				t.Fatal("version lost")
			}
			if c.Status == "supported" && fields["compatibility_reason"] != nil {
				t.Fatal("success has failure reason")
			}
			if c.Status == "" && fields["compatibility_reason"] != "not_checked" {
				t.Fatal("legacy snapshot implied successful probe")
			}
		}
	}
}
