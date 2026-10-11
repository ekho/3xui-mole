# 3xui-mole

![3xui-mole](docs/assets/3xui-mole-banner.png)

3xui-mole manages subscription access to VPN servers running 3X-UI. Customers
use a web cabinet or Telegram; operators manage clients, plans, payments and
support in one system. Both interfaces use the same backend and data.

- **Customers:** registration, subscription purchase and renewal, connection
  links, payment history, referrals, promocodes and support.
- **Operators:** trial approval, access management, catalogue, payment review,
  campaigns, notifications, statistics and audit.
- **Administrators:** server management, deployment, configuration and backups.

Available payment methods are manual transfers, YooMoney, YooKassa, Cryptomus,
Heleket and Telegram Stars. Each method and the Telegram channels are enabled
separately by the administrator.

| Documentation | Guide |
| --- | --- |
| Operators and administrators | [User guide](docs/en/operators.md) |
| Architecture, deployment and configuration | [Engineering guide](docs/en/engineering.md) |

The backend is Go with PostgreSQL, Redis and River background jobs. The web
application is React, served through Caddy. The machine-readable
[API contract](docs/api/openapi.yaml) is kept alongside the source.

This project was inspired by [3xui-shop](https://github.com/snoups/3xui-shop).
