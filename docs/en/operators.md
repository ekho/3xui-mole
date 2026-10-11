# Operator and administrator guide

[Русский](../ru/operators.md) · [Project](../../README.md) · [Engineering guide](engineering.md)

3xui-mole brings together a customer cabinet, Telegram, payments and 3X-UI
access management. The web interface supports English and Russian. Optional
channels and payment methods appear only when configured for the installation.

## Getting access

Customers register with email, accept the published terms and privacy policy,
and confirm their email. They can then sign in, reset a forgotten password
and manage their account in the cabinet.

Registration does not grant operator access. An administrator grants the
operator role to a confirmed account using the [engineering instructions](engineering.md#operator-access).
Operators open `/admin`. Managing servers additionally requires the
infrastructure permission. Adding a Telegram ID to the deployment settings
does not grant these web permissions.

In the cabinet's identity and security pages, a customer can link Telegram,
add or change an email, change a password and revoke sessions. Linking uses
a short-lived proof; matching names or email addresses does not merge accounts.
An operator can start account recovery from the client card when the normal
recovery route is unavailable. The customer must complete the recovery flow.

## What the customer sees

| Page | Purpose |
| --- | --- |
| Cabinet | Subscription status, expiry, traffic, devices and connection link or QR code. |
| Catalogue | Available plans and the payment methods that can sell them. |
| Renew / change plan | Extend the current plan or replace it with another plan. |
| Order / payment history | Payment progress and the separate result of applying access. |
| Referrals / promocodes | Invitation link, rewards and activation of a day-based promocode. |
| Support | Conversation with the operator, including attachments. |
| Identity / security | Email, Telegram link, password and active sessions. |

The connection link is a private credential. Share it only with its owner.
The client card temporarily reveals it and hides it again after a minute or
when the tab is hidden.

Renewal adds the purchased period to the later of the existing expiry or now
and resets traffic. Changing a plan starts a new period and resets counters;
unused days of the previous plan are not carried over. The customer sees the
conditions before confirming. Payment confirmation and access activation are
separate steps: a paid order can still await work on the panel.

## Clients and access

Open **Clients** in `/admin`, search by email, Telegram details or account ID,
and open the client card. It contains identity, trial requests, subscription,
payment history, support and audit events. A Telegram-only trial client can
also be created here with a Telegram ID, name and language.

- **Trial requests:** approve or reject with a reason. Reconsider a rejected
  request when appropriate. If panel work needs review, inspect its result
  before using the reconciliation action. Starter trial availability and
  one-trial restrictions still apply.
- **Access operations:** assign a plan, grant compensation days, reset traffic,
  change the traffic profile or ban/unban VPN access. Read the confirmation
  and supply a reason. An operation is complete when its result is applied;
  pending work or `needs_review` requires follow-up.
- **Restrictions:** account restriction, VPN ban and support ban are separate
  controls. Choose the one matching the problem. Operator accounts are
  protected against ordinary account restriction.

Profiles include regular, EURU and unlimited. Unlimited access has a scheduled
monthly traffic reset; the administrator chooses its timezone. An unavailable
panel or unknown observation does not prove that a subscription is inactive.
After an uncertain traffic reset, check the panel before confirming another
attempt: repeating it can reset traffic again.

## Plans and payments

In **Catalogue**, create or edit a plan's duration, device limit, traffic,
profile and prices. Prices are set independently in RUB, USD and Stars.
There is no automatic currency conversion. A method cannot sell a plan
without a price in its currency. Hide a plan to stop offering it or archive
it while retaining history. The system protects the last visible plan.

| Method | Currency | Operator action |
| --- | --- | --- |
| Manual transfer | RUB | In **Manual payments**, verify the actual full receipt, then confirm with its external reference or reject with a reason. |
| YooMoney / YooKassa | RUB | Follow the order and verified provider result; investigate discrepancies in the payment case. |
| Cryptomus / Heleket | USD | Follow the order and verified provider result; investigate discrepancies in the payment case. |
| Telegram Stars | XTR | Follow Telegram payment results and recurring subscription status. |

A customer's “I paid” report and returning from a payment page do not confirm
receipt. Use the recorded payment result and the provider's actual transaction.
An unknown amount or status must not be treated as zero or success.

Open the payment case from the client's history to review problems and refunds.
For external providers, recording a full refund records money already returned
outside the application; it does not transfer money. A Stars refund sends the
refund request through Telegram after confirmation. Check an uncertain result
before retrying. A refund retains already applied access but prevents unfunded
pending fulfilment from granting new access.

Stars recurring payments use a 30-day period. Cancelling future renewal keeps
the paid period. Resuming recurring renewal through Telegram does not itself
record another payment.

## Telegram and support

When enabled, the main bot provides the customer menu, connection instructions,
subscription actions, referrals and links to the cabinet/Mini App. Customers
can use `/start`, `/help`, `/support`, `/paysupport` and `/referrals`;
`/promocode CODE` activates a code. Telegram and the web use the same account
after linking. Operators can handle trial approval through the bot's controls.

The support bot is a separate bot connected to a forum supergroup. Customer
conversations are represented by topics. Operators reply in the matching topic
or from the client card, and can close/reopen a conversation or ban/unban
support. Account and VPN restrictions are unaffected by a support ban.

Topic commands include `/info`, `/pending`, `/close`, `/reopen`, `/ban`,
`/unban`, `/reset_traffic` and `/comp DAYS`. Access changes request confirmation;
follow the bot's reply and provide the reason requested. The command must come
from an authorized operator in the correct conversation.

Message delivery has its own state. Queued messages are still waiting; a failed
message needs attention. An unknown result can mean the message was delivered
without a recorded acknowledgement. Check Telegram before explicitly retrying
to avoid sending the same message twice. The cabinet retains conversation
history and stored attachments independently of delivery.

## Campaigns, rewards and notifications

- **Campaigns:** create an invitation link, activate or pause it and inspect
  visits, registrations and trial figures. Attribution happens at first
  registration, not a later login or account link. Visits are not unique people.
  Deleting a campaign retains its history.
- **Promocodes:** create a code granting 1–365 days. A code is used once;
  unused codes can be edited or deleted. Activation may wait for the panel,
  so check its outcome before promising access.
- **Referrals:** customers share a personal invitation link. Confirmed
  purchases can grant days to inviters at two levels; the default rewards
  are 10 and 3 days. Rewards and the invited customer's trial are configurable.
  Historical monetary rewards are not a withdrawable balance; payouts are
  not supported.
- **Notifications:** prepare a message for one client or an available broadcast
  audience, preview it and confirm sending. Check delivery results afterwards.
  The cabinet also shows subscription reminders.

## Servers

An operator with infrastructure permission can open **Servers**. Add a unique
name, an HTTPS panel address and a client limit (`0` means no limit). Registered
panels use the installation's configured authentication and CA. The server's
address and identity are not editable after creation.

Ping a server or synchronize the list to refresh observations. Offline means
unreachable, not empty. Deletion requires explicit confirmation and is refused
while the server has clients, reservations or unresolved work, or cannot be
safely checked. Deletion preserves history; it does not migrate clients or
rotate their connection keys.

The same operations are available in a private chat with the main bot for a
linked, confirmed operator with infrastructure permission:

```text
/servers
/server ID
/server_add name | https://panel.example.com | 100
/server_ping ID
/servers_sync
/server_delete ID confirm
```

## Maintenance, statistics and audit

**Maintenance** temporarily prevents new purchases, renewal, plan changes,
trials and Stars renewal resumption. Existing access, payment processing,
renewal cancellation, security and support remain available. Supply a reason
when changing the mode and turn it off after maintenance is complete.
An administrator can additionally close the web gateway during technical work;
that is a separate deployment setting.

**Statistics** shows accounts, trials, paying and repeat customers, access and
server observations. Trial and payer shares are separate measurements, not a
trial-to-paid conversion rate. Unknown panel data stays unknown.

**Audit** records actors, actions, reasons and outcomes. Use it together with
the payment case and access result when investigating an incident. Audit
retention is configurable and does not define financial history retention.
An optional Telegram mirror provides audit metadata; the stored journal
remains the primary record.
