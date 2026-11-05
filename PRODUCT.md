# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Customers use the browser cabinet and Telegram Mini App to manage VPN access, subscriptions, payments, account details, and support.
- Operators manage customers, access, payments, plans, campaigns, promocodes, servers, notices, maintenance, statistics, and audit history in a separate administration interface.

## Product Purpose

The existing product connects VPN subscriptions and customer accounts with payment and operator workflows. The repository identifies the product as 3xui-mole; its checkout directory is named 3xui-shop.

## Operating Context

The browser cabinet and Telegram Mini App share customer page implementations. The administration interface uses React Admin and MUI. The existing frontend uses React, TypeScript, React Router, and TanStack Query.

Russian and English are implemented. Telegram supplies launch data, theme colors, viewport size, safe-area insets, and its Back button. Customer and operator sessions have separate authorization boundaries.

## Capabilities and Constraints

The user confirmed that the redesign covers all three surfaces: customer web cabinet, Telegram Mini App, and operator administration.

The user identified the current problems as a non-distinctive design, styling, spacing, and component behavior. Success requires a recognizable visual identity and consistent layout and interaction behavior across these surfaces.

Existing product functions, factual content, permissions, payment flows, session boundaries, localization, and Telegram integration are constraints for the redesign. No new commercial claims or backend capabilities have been requested.

## Evidence on Hand

- `web/src/main.tsx`: application shell and customer routes.
- `web/src/Cabinet.tsx`: customer subscription overview and actions.
- `web/src/MiniApp.tsx`, `web/src/telegramSDK.ts`: Telegram session, theme, viewport, and navigation integration.
- `web/src/Admin.tsx`: operator shell and resources.
- `web/src/style.css`: incumbent styles.
- `web/public/brand/3xui-mole-logo.png`: existing logo asset; a replacement has not been requested.
- `web/tests/`: automated behavioral fixtures; these do not establish current visual or real Telegram acceptance.

## Open Decisions

- Replacement visual direction and its expression across the three surfaces.
- Specific component interactions to change, after inspecting the existing rendered UI.
- Any desired changes to the existing name or logo, if the user requests them.
