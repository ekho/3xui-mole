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
		})
	}
}

func TestRegressionAccessCompatibilityBeforeLease(t *testing.T) {
	for _, unsupported := range []bool{false, true} {
		t.Run(map[bool]string{false: "unknown", true: "unsupported"}[unsupported], func(t *testing.T) {
			s, e, p, actor, account, _ := accessActors(t)
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
		})
	}
}
