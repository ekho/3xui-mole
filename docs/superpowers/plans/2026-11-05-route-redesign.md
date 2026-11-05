# Route Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Apply the approved «Маршрут» identity and component behavior to the customer cabinet, Telegram Mini App and operator UI.

**Architecture:** Keep existing page components, React Router, session boundaries and React Admin. Shared CSS variables carry the visual roles; a scoped customer shell and a MUI theme adapt them to their respective surfaces. Restructure only the cabinet and operator client list where the approved composition requires it.

**Tech Stack:** React 19, TypeScript, React Router, React Admin/MUI, existing CSS, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-web-miniapp-redesign-design.md`

## Global Constraints

- Existing API, business actions, session/security checks, draft and payment context remain authoritative.
- Preserve RU/EN, Mini App theme/safe areas/Back button and strict CSP with Emotion nonce.
- No new dependency or backend/deployment changes.
- Graphite `#252B30`, work area `#F3F4F0`, white panels and accent `#B94116`; equivalent accessible dark/Telegram roles.
- Approved sketch is `.impeccable/mocks/decision/boarding.html`; static preview controls are not product functionality.

## Review Focus

- Mini App nested routes retain `/mini-app` and current locale; bottom navigation does not cover actions or keyboard-focused fields. Task 1 navigation tests and visual mobile checks.
- Long identities and translations fit without page-wide overflow; admin tables may scroll locally. Task 2 fixture and viewport checks.
- Ban/unknown/stale/unlimited states do not acquire misleading active/finite summaries. Task 1 existing subscription-profile/cabinet tests.
- Dark and Telegram themes remain legible without overriding CSP or exposing secrets. Task 2 contrast/CSP and Task 3 Mini App checks.
- Shared styles do not change operator control behavior or lose payment/draft state. Task 3 existing functional E2E coverage and independent review.

### Task 1: Customer shell and cabinet

**Files:** modify `web/src/main.tsx`, `web/src/Cabinet.tsx`, `web/src/Connection.tsx`, `web/src/style.css`; create `web/src/CustomerNavigation.tsx`; tests `web/tests/cabinet.spec.ts`, `web/tests/mini-app.spec.ts`.

**Interfaces:** `CustomerNavigation({lang, mini}: {lang: Lang; mini?: boolean})` consumes existing `link()` and location. It produces ordinary SPA links with active state, scoped navigation label and unique accessible short labels. Cabinet keeps its existing public props and query/action behavior.

- [x] Add a failing customer navigation test: navigate through the new primary navigation to catalogue, verify locale survives and current destination is announced; Mini App equivalent must retain its prefix and existing session.
- [x] Run only those new tests and inspect the expected missing-navigation failure.
- [x] Add the navigation and shared visual roles; preserve the existing header/footer links and session boundaries.
- [x] Recompose cabinet summary, subscription actions, connection and account area; keep notices/reminders/errors visible and every secondary workflow reachable. Keep current handlers and conditional access checks.
- [x] Run `npm run test:e2e -- cabinet.spec.ts mini-app.spec.ts navigation.spec.ts subscription-profile.spec.ts device-connection.spec.ts` from `web`; expect all pass. Pure styling uses rendered review rather than CSS-mirroring tests.

### Task 2: Operator theme and client table

**Files:** modify `web/src/Admin.tsx`, `web/src/style.css`, `web/tests/ui-ux.spec.ts`, `web/tests/operator-cabinet.spec.ts`; create `web/src/operatorTheme.ts` if keeping theme configuration separate improves readability.

**Interfaces:** exported light/dark `RaThemeOptions` are consumed by `<Admin theme darkTheme>`. Existing `ClientRows`, list provider, permissions and mutation handlers remain responsible for data/actions. Table consumes only `OperatorClient` fields already returned by the provider.

- [x] Add a failing table test using the existing operator fixture; assert labelled table, client fields, row action navigation, localized column headings and local scroll without page overflow at mobile width.
- [x] Run the new test and inspect the missing-table failure.
- [x] Apply MUI themes and full-width operator shell; replace the list cards with semantic rows, retaining search, 50-row pagination and all existing actions. Keep client heading links for discoverability.
- [x] Update the existing contrast test to inspect real table cells instead of removed card tiles, preserving its contrast assertion.
- [x] Run `npm run test:e2e -- operator-cabinet.spec.ts ui-ux.spec.ts account-restrictions.spec.ts server-management.spec.ts`; expect all pass.

### Task 3: Complete surface coverage and acceptance

**Files:** shared styles and only affected page markup; `DESIGN.md`, `.impeccable/design.json`, relevant surface brief. Focused additional tests only if behavior changes.

**Interfaces:** all existing class families (auth, catalogue, orders, support, forms, statistics, audit, notices) inherit the same tokens, spacing, focus and state vocabulary. No second design system or provider layer.

- [x] Audit representative screens and states in RU/EN, light/dark, desktop1440 and mobile390/375; repair incomplete coverage and focus/overflow regressions.
- [x] Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:bundle`, `npm run test:dev`; expect successful exits.
- [x] Run the full existing mocked web E2E suite once after focused groups pass; inspect every failure and rerun only the affected groups after fixes.
- [x] Run the Impeccable detector once over finished UI files; triage findings without global suppressions.
- [x] Capture screenshots for independent visual review against the chosen sketch and spec; independently review connected code. Fix material findings and verify affected behavior.
- [x] Document the built design in `DESIGN.md` and `.impeccable/design.json`. Report exact checks, remaining limits, and whether real Telegram/payment acceptance occurred.

## Execution record

Implement inline in the current isolated worktree; shared CSS and page composition benefit from one owner. User approval of the specification authorizes this implementation; no additional approval checkpoint is inserted for routine execution choices. Independent final code and visual reviews remain required. Preserve work locally; do not publish or deploy.

## Completion — 2026-11-05

Implemented and documented locally. Independent finish verdict: ship, F1–F7 resolved. DESIGN.md and .impeccable/design.json capture the implemented system. Verification details and acceptance limits: .impeccable/review/verification.md. Full original E2E683/685; both failures fixed and included in the106/106 passing related run. Real Telegram/payment acceptance and deployment remain outside this local delivery.

## PR preparation — 2026-11-05

User approved the resulting design and requested PR preparation and local checks only. Fresh complete browser suite:687/687 passed. Nine connected browser/Go scenarios passed with race detection on dedicated PostgreSQL/Redis and local external-service fixtures. Fresh build/typecheck/lint/bundle passed. Branch `codex/route-redesign` starts from current `origin/main` c8de8377cd1aaf2382687c3fc886ad9b221a80de. Merge, release, deployment and real Telegram/payment acceptance are outside the current authorization.
