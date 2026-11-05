# Route redesign evidence — 2026-11-05

Real compiled frontend, synthetic account/API and Telegram SDK fixtures only. No live account, Telegram host, provider payment or deployment acceptance. Browser CUA captures from document top, full page; JPEG is the browser's native output. The fixed Mini App navigation appears at viewport bottom within full-page captures (normal fixed-position screenshot behavior). Primary viewport images also saved separately.

Required captures:
- desktop.jpg: customer RU 1440×900.
- desktop-en.jpg: customer EN 1440×900.
- mobile.jpg: Mini App RU, light Telegram theme, 390×844; document width390; primary key action bottom616, nav top765, no overlap.
- mobile-dark-en.jpg: Mini App EN, dark Telegram theme, 375×812.
- admin-light.jpg: operator RU, light theme, 1440×900.
- admin-dark-en.jpg: operator EN, dark theme, 1440×900.
- admin-mobile.jpg: operator RU dark, 375×812; document width375, only table scrolls horizontally.
- admin-menu-mobile.jpg: opened menu, 375×812, viewport only.

All required capture files opened and validated. Earlier malformed mobile operator capture was replaced after settling responsive navigation. All data is illustrative, names and emails synthetic.

Behavior: focused132 tests initially127pass/5fail (anchor rounding + operator table overflow); affected14 rerun12pass/2overflow, final overflow2 rerun2pass. Full685 mock-backed E2E completed683pass/2fail; both failures repaired and included in the106/106 passing fix-round run below. Typecheck/lint/bundle/test:dev passed. Production build uses the current worktree; final extra1px quotation separator adjustment followed source detector (no functional change).

Source detector: implementation-detector.json; sole finding old 3px quotation border, reduced to1px. No new production ignores. Decision mock ignores remain scoped to those files; see sketch-triage.md.

Initial observations sent for independent classification: selected RU hover became white-on-white; Telegram dark primary kept an orange border rather than host blue. Both became reviewer findings and were fixed in round1; current captures show the corrected states. Original findings remain in finish-review.md.

Composition reference: .impeccable/mocks/decision/boarding.html is the user-selected code-led sketch, not a generated comp. Real API resources/page size50 and native disclosure controls take precedence over synthetic sketch fields/page size25. Existing brand image preserved. External quality boards returned403, not viewed; do not claim visual equality to them.

## Review fix round 1

F1–F7 implemented. Exact visible expiry restored inside semantic time; fixed light semantic notice foreground on Telegram dark; stable literal Mini defaults break the fallback cycle; coherent language hover foreground/background; host primary border including hover; operator client card28px/16px padding; actual operator-dark presence now themes outer shell/footer via :has.
RED checks: dark notice failed before fix; empty host theme failed; language hover contrast with reduced-motion measured1.10:1 and failed in both operator modes. After fixes:106/106 focused scenarios passed (cabinet, Mini App, operator, profile, promo activation, ui-ux) including all full-run failures and new regressions. Full original suite683/685, both failures repaired and retested; this is not a second whole-suite run. Final build/bundle/lint run after last host-link hover rule.
Additional scope capture pairs: {catalogue,payment,identity,support}-{mobile,desktop}.jpg, admin-card-{mobile,desktop,viewport}.jpg. Mobile375×812RU, desktop1440×900EN; no horizontal page overflow. No actions submitted to external services.

Fix-round1 recapture: original21 image paths replaced from final built frontend at same viewports, re-opened/validated. Added mini-notice-dark.jpg and admin-light-language-hover.jpg. Computed evidence: exact expiry text includes time in RU/EN; host primary border rgb(36,129,204); dark notice body/date rgb(37,43,48) on rgb(236,245,237); selected hovered RU foreground white on rgb(65,72,76), :hover=true; admin card padding28px desktop/16px mobile; operator dark shell rgb(29,35,40), footer links rgb(241,165,130). Final production build, bundle check and lint all exit0 (typecheck included in build). No second detector.

F7 clarification requested by verdict reviewer: a light strip below the footer in the long fullPage capture was outside the document. At the actual page end, body/root/app/footer all end at811.8515625px in an812px viewport; body/app background rgb(29,35,40). Added admin-card-mobile-bottom-final.jpg (375×812), reopened from its saved bytes via native image display: dark footer reaches the viewport edge. No product change was needed. The main admin-card-mobile.jpg was recaptured from the top. The intermediary bottom filename is superseded by the -final capture.
