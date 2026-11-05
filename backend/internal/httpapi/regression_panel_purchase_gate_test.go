package httpapi

import (
	"context"
	"example.com/cabinet/backend/internal/wire"
	"github.com/google/uuid"
	"testing"
)

func TestRegressionPanelPreparationCompatibility(t *testing.T) {
	s, e, p, actor, target, _ := accessActors(t)
	p.panelVersion = "3.7.0"
	before := count(t, e, "access_operations")
	if _, err := s.createAccessOperation(context.Background(), actor, target, uuid.New(), wire.AccessOperationInput{Kind: "compensate", Reason: "unsupported", Days: ptrInt(1)}); err == nil || count(t, e, "access_operations") != before {
		t.Fatal("unsupported mutation prepared")
	}
}

func TestRegressionPanelMetadataIntentOnUnsupported(t *testing.T) {
	s, e := fixture(t)
	p := panelFixture(t, s)
	ctx := context.Background()
	actor := verified(t, s, e, "metadata-operator@example.test")
	if err := s.changeOperatorRole(ctx, actor, true); err != nil {
		t.Fatal(err)
	}
	account := verified(t, s, e, "metadata-target@example.test")
	p.panelVersion = "3.7.0"
	op, err := s.createAccessOperation(ctx, actor, account, uuid.New(), wire.AccessOperationInput{Kind: "set_profile", Profile: profileInput("euru"), Reason: "future profile"})
	if err != nil || op.Status != "applied" || p.adds+p.updates+p.resets != 0 {
		t.Fatalf("metadata-only intent requires panel writes: %+v %v", op, err)
	}
}

func TestServerPoolAssignedPurchaseCompatibility(t *testing.T) {
	s, e, _, b, account, plan, order := poolPaid(t)
	ctx := context.Background()
	op := poolPrepared(t, s, account, order)
	if err := s.applyAccess(ctx, op); err != nil {
		t.Fatal(err)
	}
	input := purchaseInput(plan)
	input.Action = "renew"
	b.panelVersion = "3.7.0"
	if _, err := s.createPurchaseOrder(ctx, account, uuid.New(), input); !catalogueCode(err, "SERVICE_UNAVAILABLE") {
		t.Fatalf("unsupported checkout admitted: %v", err)
	}
	if count(t, e, "purchase_orders") != 1 || count(t, e, "purchase_receipts") != 1 {
		t.Fatal("failed checkout changed money")
	}
	b.panelVersion = "3.11.0"
	renew, err := s.createPurchaseOrder(ctx, account, uuid.New(), input)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.receiveYooMoney(ctx, purchaseNotice(s, renew.OrderId, "version-changed-paid", "90071992547409.00", "90071992547409.93")); err != nil {
		t.Fatal(err)
	}
	b.panelVersion = "3.7.0"
	if err = s.fulfillPurchase(ctx, renew.OrderId); err != nil {
		t.Fatal(err)
	}
	got, err := s.purchaseOrder(ctx, account, renew.OrderId)
	if err != nil || got.FulfillmentStatus != "needs_review" || count(t, e, "purchase_receipts") != 2 || b.adds != 1 {
		t.Fatalf("funding lost or unsupported fulfillment applied: %+v %v", got, err)
	}
}
