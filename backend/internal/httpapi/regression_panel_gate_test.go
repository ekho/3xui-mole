package httpapi

import (
	"context"
	"example.com/cabinet/backend/internal/wire"
	"github.com/google/uuid"
	"testing"
)

func TestRegressionProvisionCompatibilityBeforeLease(t *testing.T) {
	for _, unsupported := range []bool{false, true} {
		t.Run(map[bool]string{false: "unknown", true: "unsupported"}[unsupported], func(t *testing.T) {
			s, e := fixture(t)
			p := panelFixture(t, s)
			if err := s.vpn.SyncServers(context.Background()); err != nil {
				t.Fatal(err)
			}
			_, id := approved(t, s, e, "panel-gate@example.test")
			// This operation already selected its panel before its version changed.
			if _, err := e.Pool.Exec(context.Background(), "UPDATE trial_operations SET panel_id=$2 WHERE id=$1", id, s.cfg.Subscriptions.PanelID); err != nil {
				t.Fatal(err)
			}
			if unsupported {
				p.panelVersion = "3.7.0"
			} else {
				p.statusFailure = 503
			}
			err := s.provision(context.Background(), id)
			op, readErr := testProvisionRow(context.Background(), e.Pool, id)
			if readErr != nil || op.WriteStarted || p.adds != 0 {
				t.Fatalf("compatibility failure wrote panel: %+v %v", op, readErr)
			}
			if unsupported {
				if op.Status != "needs_review" {
					t.Fatal("unsupported operation not reviewed")
				}
			} else if err == nil || op.Status != "pending" || op.Attempts != 0 || op.FirstStartedAt.Valid {
				t.Fatalf("unknown probe consumed attempt: %+v %v", op, err)
			}
			assertPanelGateObservation(t, s, unsupported)
		})
	}
}

func TestRegressionAccessCompatibilityBeforeLease(t *testing.T) {
	for _, unsupported := range []bool{false, true} {
		t.Run(map[bool]string{false: "unknown", true: "unsupported"}[unsupported], func(t *testing.T) {
			s, e, p, actor, account, _ := accessActors(t)
			if err := s.vpn.SyncServers(context.Background()); err != nil {
				t.Fatal(err)
			}
			op, err := s.createAccessOperation(context.Background(), actor, account, uuid.New(), wire.AccessOperationInput{Kind: "compensate", Reason: "panel gate", Days: ptrInt(1)})
			if err != nil {
				t.Fatal(err)
			}
			if unsupported {
				p.panelVersion = "3.7.0"
			} else {
				p.statusFailure = 503
			}
			err = s.applyAccess(context.Background(), op.OperationId)
			var status string
			var attempts int
			var write, reset bool
			if e := e.Pool.QueryRow(context.Background(), "SELECT status,attempts,write_started,reset_started FROM access_operations WHERE id=$1", op.OperationId).Scan(&status, &attempts, &write, &reset); e != nil {
				t.Fatal(e)
			}
			if write || reset || p.updates != 0 {
				t.Fatal("compatibility failure marked a write")
			}
			if unsupported {
				if status != "needs_review" {
					t.Fatal("unsupported operation not reviewed")
				}
			} else if err == nil || status != "pending" || attempts != 0 {
				t.Fatal("unknown probe consumed access attempt")
			}
			assertPanelGateObservation(t, s, unsupported)
		})
	}
}

func assertPanelGateObservation(t *testing.T, s *regressionFixture, unsupported bool) {
	t.Helper()
	var status, version, reason string
	if err := s.pool.QueryRow(context.Background(), "SELECT panel_compatibility,panel_version,panel_compatibility_reason FROM vpn_servers WHERE id=$1", s.cfg.Subscriptions.PanelID).Scan(&status, &version, &reason); err != nil {
		t.Fatal(err)
	}
	if unsupported {
		if status != "unsupported" || version != "3.7.0" || reason != "unsupported_version" {
			t.Fatal("worker lost unsupported diagnostic", status, version, reason)
		}
	} else if status != "unknown" || reason != "unreachable" {
		t.Fatal("worker lost unknown diagnostic", status, reason)
	}
}

func TestRegressionPanelLastGateBeforeMarkers(t *testing.T) {
	for _, unsupported := range []bool{false, true} {
		for _, kind := range []string{"trial_add", "reset_traffic"} {
			t.Run(kind+map[bool]string{false: "_unknown", true: "_unsupported"}[unsupported], func(t *testing.T) {
				if kind == "trial_add" {
					s, e := fixture(t)
					p := panelFixture(t, s)
					_, id := approved(t, s, e, "last-gate@example.test")
					if _, err := e.Pool.Exec(context.Background(), "UPDATE trial_operations SET panel_id=$2 WHERE id=$1", id, s.cfg.Subscriptions.PanelID); err != nil {
						t.Fatal(err)
					}
					checkLastPanelGate(t, s, p, id, true, unsupported)
					return
				}
				s, _, p, actor, account, _ := accessActors(t)
				op, err := s.createAccessOperation(context.Background(), actor, account, uuid.New(), wire.AccessOperationInput{Kind: "reset_traffic", Reason: "last gate"})
				if err != nil {
					t.Fatal(err)
				}
				checkLastPanelGate(t, s, p, op.OperationId, false, unsupported)
			})
		}
	}
}

func checkLastPanelGate(t *testing.T, s *regressionFixture, p *fakePanel, id uuid.UUID, trial, unsupported bool) {
	t.Helper()
	if err := s.vpn.SyncServers(context.Background()); err != nil {
		t.Fatal(err)
	}
	beforeAdds := p.adds
	reads := 0
	p.statusHook = func(p *fakePanel) {
		reads++
		if reads == 2 {
			if unsupported {
				p.panelVersion = "3.7.0"
			} else {
				p.statusFailure = 503
			}
		}
	}
	if trial {
		s.provision(context.Background(), id)
	} else {
		s.applyAccess(context.Background(), id)
	}
	var write, reset bool
	query := "SELECT write_started,false FROM trial_operations WHERE id=$1"
	if !trial {
		query = "SELECT write_started,reset_started FROM access_operations WHERE id=$1"
	}
	if err := s.pool.QueryRow(context.Background(), query, id).Scan(&write, &reset); err != nil {
		t.Fatal(err)
	}
	if write || reset || p.adds != beforeAdds || p.resets != 0 {
		t.Fatal("last gate left false mutation markers", write, reset, p.adds, p.resets)
	}
	assertPanelGateObservation(t, s, unsupported)
}

func TestRegressionPanelPreservesPriorMutationMarkers(t *testing.T) {
	s, e, p, actor, account, _ := accessActors(t)
	op, err := s.createAccessOperation(context.Background(), actor, account, uuid.New(), wire.AccessOperationInput{Kind: "reset_traffic", Reason: "prior ambiguous reset"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = e.Pool.Exec(context.Background(), "UPDATE access_operations SET write_started=true,reset_started=true WHERE id=$1", op.OperationId); err != nil {
		t.Fatal(err)
	}
	p.panelVersion = "3.7.0"
	s.applyAccess(context.Background(), op.OperationId)
	var write, reset bool
	if err = e.Pool.QueryRow(context.Background(), "SELECT write_started,reset_started FROM access_operations WHERE id=$1", op.OperationId).Scan(&write, &reset); err != nil || !write || !reset || p.resets != 0 {
		t.Fatal("prior uncertainty markers lost", err, write, reset)
	}
}
