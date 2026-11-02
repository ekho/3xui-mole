package tests

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"example.com/cabinet/backend/internal/modules/subscriptions"
	"example.com/cabinet/backend/internal/modules/vpn"
	"github.com/google/uuid"
)

func TestNativePanelAccessOperations(t *testing.T) {
	if os.Getenv("NATIVE_DOCKER_STATE") == "" {
		t.Skip("requires owned native panel")
	}
	f, bot, _, plan := nativeStarsFixture(t)
	_, stop := launchNative(t, f, bot, true, true, true)
	defer stop()
	ctx := context.Background()
	unlimited := uuid.New()
	if _, err := f.env.Pool.Exec(ctx, `INSERT INTO catalogue_plans(id,current_revision,current_devices,current_profile,current_hidden) VALUES($1,1,1000,'unlimited',true);
 `, unlimited); err != nil {
		t.Fatal("owned unlimited catalogue unavailable")
	}
	if _, err := f.env.Pool.Exec(ctx, `INSERT INTO catalogue_revisions(plan_id,revision,terms,archived,source,changed_at) SELECT $1::uuid,1,terms || jsonb_build_object('plan_id',$1::text,'profile','unlimited','hidden',true,'devices',1000),false,'legacy_import',now() FROM catalogue_revisions WHERE plan_id=$2`, unlimited, plan); err != nil {
		t.Fatal("owned unlimited terms unavailable", err)
	}

	actor, csrf, account := f.signupAccount(t, nativeEmail("panel-access"))
	if f.svc.Accounts.ChangeOperatorRole(ctx, account, true) != nil {
		t.Fatal("owned operator unavailable")
	}
	p := vpn.NewPanelClient(f.cfg.VPN.Panel)
	defer p.Close()
	identity, err := f.svc.Accounts.Lookup(ctx, account)
	if err != nil {
		t.Fatal("owned identity unavailable")
	}
	read := func() *vpn.PanelClientView {
		t.Helper()
		v, e := p.GetClient(ctx, identity.PanelKey)
		if e != nil || v == nil || v.VPNID != identity.VpnID || v.SubID != identity.SubID {
			t.Fatal("native operation changed identity")
		}
		return v
	}
	execute := func(body map[string]any) uuid.UUID {
		t.Helper()
		body["reason"] = "Owned native panel compatibility"
		status, raw, _ := f.send(t, actor, "POST", "/api/v1/operator/clients/"+account.String()+"/access-operations", body, csrf, uuid.NewString(), false)
		var op subscriptions.AccessOperation
		if status != 202 || json.Unmarshal(raw, &op) != nil {
			t.Fatalf("native operation %s rejected HTTP %d", body["kind"], status)
		}
		wait(t, func() bool {
			var status string
			return f.env.Pool.QueryRow(ctx, "SELECT status FROM access_operations WHERE id=$1", op.OperationId).Scan(&status) == nil && status == "applied"
		})
		read()
		return op.OperationId
	}
	execute(map[string]any{"kind": "assign_plan", "plan_id": plan, "revision": 1, "period_days": 30})
	before := read()
	execute(map[string]any{"kind": "compensate", "days": 1})
	if read().ExpiryTimeMS != before.ExpiryTimeMS+86400000 {
		t.Fatal("native renewal did not preserve/add exact period")
	}
	execute(map[string]any{"kind": "assign_plan", "plan_id": plan, "revision": 1, "period_days": 30})
	execute(map[string]any{"kind": "set_vpn_ban", "vpn_banned": true})
	if read().Enabled {
		t.Fatal("native VPN ban not applied")
	}
	execute(map[string]any{"kind": "reset_traffic"})
	if read().Enabled {
		t.Fatal("native reset undid VPN ban")
	}
	execute(map[string]any{"kind": "set_vpn_ban", "vpn_banned": false})
	if !read().Enabled {
		t.Fatal("native unban did not restore access")
	}
	execute(map[string]any{"kind": "set_profile", "profile": "unlimited"})
	period := time.Now().UTC().Format("2006-01")
	if _, err = f.env.Pool.Exec(ctx, "INSERT INTO monthly_reset_periods(account_id,local_period,timezone,status,created_at,updated_at) VALUES($1,$2,'UTC','waiting',now(),now())", account, period); err != nil {
		t.Fatal("owned monthly claim unavailable")
	}
	if err = f.svc.VPN.ApplyMonthlyReset(ctx, account, period); err != nil {
		t.Fatal("native monthly reset preparation failed")
	}
	wait(t, func() bool {
		var state string
		return f.env.Pool.QueryRow(ctx, "SELECT o.status FROM monthly_reset_periods p JOIN access_operations o ON o.id=p.operation_id WHERE p.account_id=$1 AND p.local_period=$2", account, period).Scan(&state) == nil && state == "applied"
	})
	if !read().Enabled {
		t.Fatal("native monthly reset lost access")
	}
	t.Log("PASS real-panel operator assignment/renewal/plan/profile/ban/reset/unban/monthly reset with stable identity")
}
