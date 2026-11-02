package telegram

import (
	"example.com/cabinet/backend/internal/modules/vpn"
	"strings"
	"testing"
)

func TestServerCardCompatibility(t *testing.T) {
	for _, lang := range []string{"ru", "en"} {
		card := serverCard(vpn.Server{ID: "fixture", Compatibility: vpn.PanelCompatibility{PanelVersion: "3.7.0", XrayVersion: "26.10.21", Status: "unsupported", Reason: "unsupported_version"}}, lang)
		if !strings.Contains(card, "3.7.0") || !strings.Contains(card, "26.10.21") || !strings.Contains(card, clientText(lang, "не поддерживается", "unsupported")) {
			t.Fatal("server card hides incompatibility")
		}
	}
}
