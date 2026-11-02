package app

import "testing"

func TestPanelCompatibilityConfig(t *testing.T) {
	for _, tc := range []struct {
		value  string
		reject bool
	}{{"", false}, {"false", false}, {"true", true}, {"invalid", true}} {
		t.Run(tc.value, func(t *testing.T) {
			t.Setenv("PANEL_DUPLICATE_GUARD_VERIFIED", tc.value)
			if err := validatePanelRetryConfig(); (err != nil) != tc.reject {
				t.Fatalf("unsafe legacy retry setting: %v", err)
			}
		})
	}
}
