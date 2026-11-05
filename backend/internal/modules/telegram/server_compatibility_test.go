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
		for reason, labels := range map[string][2]string{"auth_failed": {"ошибка авторизации", "authentication failed"}, "invalid_response": {"неверный ответ панели", "invalid panel response"}, "not_checked": {"ещё не проверено", "not checked yet"}} {
			card = serverCard(vpn.Server{ID: "fixture", Compatibility: vpn.PanelCompatibility{Status: "unknown", Reason: reason}}, lang)
			if !strings.Contains(card, clientText(lang, labels[0], labels[1])) {
				t.Fatal("server card hides actionable reason", reason, lang)
			}
		}
	}
}
