package vpn

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"strings"
	"unicode"
)

//go:embed panel_versions.json
var panelVersionsJSON []byte

type PanelRelease struct {
	Version    string `json:"version"`
	Image      string `json:"image"`
	TestedXray string `json:"tested_xray"`
}

var panelReleases = func() []PanelRelease {
	var registry struct {
		Supported []PanelRelease `json:"supported"`
	}
	if err := json.Unmarshal(panelVersionsJSON, &registry); err != nil {
		panic(err)
	}
	return registry.Supported
}()

func LookupPanelRelease(version string) (PanelRelease, bool) {
	for _, r := range panelReleases {
		if r.Version == strings.TrimPrefix(version, "v") {
			return r, true
		}
	}
	return PanelRelease{}, false
}

type PanelCompatibility struct {
	PanelVersion string
	XrayVersion  string
	Status       string
	Reason       string
}

func (c PanelCompatibility) normalized() PanelCompatibility {
	if c.Status == "" {
		c.Status, c.Reason = "unknown", "not_checked"
	}
	return c
}

type PanelCompatibilityError struct{ Compatibility PanelCompatibility }

func (e *PanelCompatibilityError) Error() string {
	return "panel compatibility: " + e.Compatibility.Reason
}
func (e *PanelCompatibilityError) Unwrap() error { return ErrPanel }

func compatibilityReviewReason(err error) string {
	var failure *PanelCompatibilityError
	if !errors.As(err, &failure) {
		return ""
	}
	switch failure.Compatibility.Reason {
	case "unsupported_version":
		return "panel_version_unsupported"
	case "version_changed":
		return "panel_version_changed"
	default:
		return "panel_version_unconfirmed"
	}
}

type panelCallError struct{ reason string }

func (e *panelCallError) Error() string { return "panel request: " + e.reason }
func (e *panelCallError) Unwrap() error { return ErrPanel }

func safePanelVersion(v string) bool {
	return v != "" && len(v) <= 64 && strings.IndexFunc(v, unicode.IsControl) < 0 && strings.TrimSpace(v) == v
}

func (p *PanelClient) Compatibility(ctx context.Context) (PanelCompatibility, error) {
	c := PanelCompatibility{Status: "unknown"}
	fail := func(reason string) (PanelCompatibility, error) {
		c.Reason = reason
		return c, &PanelCompatibilityError{Compatibility: c}
	}
	if err := p.auth(ctx); err != nil {
		return fail("auth_failed")
	}
	out, err := p.call(ctx, "GET", "panel/api/server/status", nil)
	if err != nil {
		var requestErr *panelCallError
		if errors.As(err, &requestErr) {
			return fail(requestErr.reason)
		}
		return fail("unreachable")
	}
	var status struct {
		PanelVersion string `json:"panelVersion"`
		Xray         struct {
			Version string `json:"version"`
		} `json:"xray"`
	}
	if !*out.Success || json.Unmarshal(out.Obj, &status) != nil || !safePanelVersion(status.PanelVersion) {
		return fail("invalid_response")
	}
	c.PanelVersion = strings.TrimPrefix(status.PanelVersion, "v")
	if safePanelVersion(status.Xray.Version) {
		c.XrayVersion = status.Xray.Version
	}
	if _, ok := LookupPanelRelease(status.PanelVersion); !ok {
		c.Status = "unsupported"
		return fail("unsupported_version")
	}
	c.Status = "supported"
	return c, nil
}

func (p *PanelClient) RequireCompatible(ctx context.Context) error {
	c, err := p.Compatibility(ctx)
	if err != nil {
		return err
	}
	p.compatMu.Lock()
	defer p.compatMu.Unlock()
	if p.panelVersion != "" && p.panelVersion != c.PanelVersion {
		c.Status, c.Reason = "unknown", "version_changed"
		return &PanelCompatibilityError{Compatibility: c}
	}
	p.panelVersion = c.PanelVersion
	return nil
}

func (p *PanelClient) mutate(ctx context.Context, path string, body any) (panelEnvelope, error) {
	if err := p.RequireCompatible(ctx); err != nil {
		return panelEnvelope{}, err
	}
	return p.call(ctx, "POST", path, body)
}

// Authenticate once before independent reads; session logins must not race.
func (p *PanelClient) probe(ctx context.Context) (PanelCompatibility, bool) {
	if err := p.auth(ctx); err != nil {
		return PanelCompatibility{Status: "unknown", Reason: "auth_failed"}, false
	}
	result := make(chan PanelCompatibility, 1)
	go func() { c, _ := p.Compatibility(ctx); result <- c }()
	_, err := p.RegularInboundIDs(ctx)
	c := <-result
	if err != nil && c.Status == "supported" {
		c.Status, c.Reason = "unknown", "unreachable"
		var callErr *panelCallError
		if errors.As(err, &callErr) {
			c.Reason = callErr.reason
		}
	}
	return c, err == nil
}
