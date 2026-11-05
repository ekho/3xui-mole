# Multi-version 3X-UI Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** обеспечить один адаптер mole для проверенных 3X-UI 3.10.2 и 3.11.0, смешанный пул серверов, безопасный отказ от неподдерживаемой версии и воспроизводимую матрицу приёмки.

**Architecture:** сохранить `vpn.PanelClient`, domain targets, owner locks и существующие workers. Добавить встроенный реестр релизов, чтение фактической версии через status, наблюдения совместимости в реестре серверов и общий запрет клиентских мутаций без допуска. Не разносить версионные ветвления по коммерческому коду.

**Tech Stack:** Go stdlib/`go:embed`, PostgreSQL/goose/sqlc, River, OpenAPI/oapi-codegen, React/Playwright, Python stdlib, Docker Compose, GitHub Actions. Новых зависимостей не требуется.

**Spec:** [2026-11-02-panel-multiversion-design.md](../specs/2026-11-02-panel-multiversion-design.md). Исследованный SHA: `515d5255b3902015f9fa8603201556592f0ed201`. План заменяет прежний план #128, который сохранял 3.7.0.

## Global Constraints

- Supported: **3.10.2 и 3.11.0**; default: **3.11.0**. 3.7.0 — отрицательный тест. 3.10.0 — только upgrade source.
- Проверенные Xray-пары: 3.10.2 / 26.10.10 и 3.11.0 / 26.10.21; версия Xray хранится отдельно и не подменяет panelVersion.
- UUID/subId/panel key, frozen target JSON, назначения серверов и financial receipts сохраняются.
- TLS/CSRF, авторизация, блокировки аккаунтов, owner session и readback обязательны. Не выполнять fallback другим форматом записи после timeout.
- Не поднимать write/reset markers при одном лишь неподтверждённом допуске. Не сбрасывать markers после возможной записи.
- При недоступной версии до lease — snooze 1 minute без domain attempts; при подтверждённо неподдерживаемой версии подготовленной операции — review без потери target/денег.
- Не редактировать generated Go/TS/sqlc вручную: менять SQL/OpenAPI и запускать генераторы.
- Secrets и subscription URLs остаются в private state; в отчётах — только безопасные версии, digest, команды и результаты.
- В этом этапе готовится план; выполнение product changes и rollout требуют следующего поручения.

## Review Focus

1. Смена версии после выбора/оплаты или между preflight и записью: запрет новых неподтверждённых мутаций, сохранённые receipts/target, review после возможной записи — Tasks 4, 5, 7.
2. Неверный токен, missing status, TLS error, malformed/oversized response: unknown/error, ноль клиентских мутаций, клиент не считается отсутствующим — Tasks 1, 4.
3. Старое наблюдение и старый action replay: не воскрешают retired/unsupported сервер, не получают новые факты из сети при replay — Tasks 3, 6.
4. Новые необслуживаемые поля и omitted/empty/zero: не теряются при продлении, не очищают host binding и не снимают ban — Tasks 4, 7.
5. Повторный bootstrap/upgrade: не ротирует существующий пароль, не меняет DB/image неявно; откат восстанавливает исходную БД — Tasks 2, 7.

---

## Task 1: Один реестр релизов и чтение фактической версии

**Files:** создать `backend/internal/modules/vpn/panel_versions.json`, `panel_compatibility.go`, `panel_compatibility_test.go`. Изменять `panel.go` только для необходимых полей/методов. Обновить shared fakes в `backend/internal/httpapi/regression_provision_test.go`, `backend/tests/web_trial_integration_test.go`; локальные TLS handlers в `vpn/panel_test.go`, `server_pool_test.go`, `server_management_test.go`, `group_reconciliation_test.go` — по фактическим новым запросам.

**Interfaces:**

- `PanelRelease { Version, Image, TestedXray string }`, `LookupPanelRelease(version string) (PanelRelease, bool)` — только supported entries.
- `PanelCompatibility { PanelVersion, XrayVersion string; Status, Reason string }`; Status: `supported|unsupported|unknown`; Reason: `""|not_checked|unsupported_version|unreachable|auth_failed|invalid_response|version_changed`.
- `(*PanelClient).Compatibility(ctx context.Context) (PanelCompatibility, error)` — свежий status read, без мутаций и DB-зависимостей. Ошибка не возвращает supported.
- `(*PanelClient).RequireCompatible(ctx context.Context) error` — используется callers и будущей границей мутаций; typed `PanelCompatibilityError` различает unsupported, unconfirmed и version_changed, совместим с `errors.Is(err, ErrPanel)`.

- [x] **1.1. Добавить table tests** `TestPanelCompatibilityRegistry` и `TestPanelCompatibilityStatus`: допускаются только 3.10.2/3.11.0 (и ровно ведущий `v`); 3.7.0, 3.10.0, 3.11.1, dev/prerelease — не допускаются; status берёт panelVersion, а не xray.version. Отдельно null/missing/нестроковый panelVersion, 401/403/404/500, timeout/TLS и oversized response; unknown не смешивается с unsupported.
- [x] **1.2. Проверить RED:** `go -C backend test ./internal/modules/vpn -run '^TestPanelCompatibility' -count=1`; до реализации новые тесты не проходят.
- [x] **1.3. Добавить JSON реестр** с `default`, `supported`, `upgrade_sources`. Supported image refs берутся из таблицы digest в Spec, по OCI index; upgrade source — существующий pinned 3.10.0. Go использует `//go:embed panel_versions.json`; runtime lookup не читает upgrade_sources. Не добавлять semver-библиотеку или автоматический диапазон `>=`.
- [x] **1.4. Реализовать status read** через существующие auth/call, endpoint `GET panel/api/server/status`, поля `obj.panelVersion` и `obj.xray.version`. Не обращаться к GitHub из runtime и не использовать `getPanelUpdateInfo`. Ограничить длину отображаемых версий 64 символами, запретить control chars; HTTP body limit сохраняется. Xray может быть неизвестен без автоматического отрицания известного panel API.
- [x] **1.5. Проверить GREEN** той же командой и в `TestPanelAuthenticationFailureIsNotAbsence`. Fakes по умолчанию явно объявляют поддерживаемую версию; тесты unsupported не получают скрытого default success.
- [x] **1.6. Commit:** `feat(vpn): define supported panel releases and status inspection`, Conventional Commit с Co-Authored-By.

## Task 2: Поддерживаемые образы и повторяемый bootstrap

**Files:** создать `deploy/acceptance/panel_versions.py`; изменить `deploy/acceptance/local.py`, `compose.local.yml`, `compose.native.yml`, `deploy/server-management/local.py`, `deploy/server-management/compose.yml`, `tests/test_paid_recovery_acceptance.py`; создать `tests/test_panel_bootstrap.py`.

**Interfaces:** Python `panel_release(version, *, upgrade_source=False)` читает тот же JSON; возвращает запись релиза либо отвергает неподдерживаемую версию. Обычные helpers не допускают upgrade_source. `LOCAL_PANEL_IMAGE` и `LOCAL_SECOND_PANEL_IMAGE` — только официальные refs из реестра; второй по умолчанию равен первому. `panel-runtime.json` содержит версии и refs обеих панелей, без ключей.

- [x] **2.1. Добавить tests** выбора обоих image refs: правильный digest, запрещённые latest/unpinned/foreign/3.7.0, разные версии двух панелей, vpn-client использует образ своей панели. `upgrade_source=True` разрешён только выделенному upgrade runner.
- [x] **2.2. Добавить bootstrap tests** через command mocks: пустой owned state инициализируется один раз; повтор использует прежний секрет; legacy owned state с известным паролем сначала проверяет login; неизвестная непустая БД не сбрасывается; crash между CLI и marker лечится проверкой сохранённого логина. Не проверять только наличие marker.
- [x] **2.3. RED:** `python -m unittest discover -s tests -p 'test_panel*.py' -v` и `python -m unittest discover -s tests -p 'test_paid_recovery_acceptance.py' -v`.
- [x] **2.4. Заменить admin/admin** в обоих helpers: для принадлежащей стенду новой DB вызвать штатный `/app/x-ui setting -username local-operator -password …` в одноразовом контейнере до основного процесса. Секрет передавать из mounted secret внутри контейнера; не включать его в host command line, вывод или shell tracing. Marker — только после успешного API login. Действовать тем же UID и без параллельного изменения DB работающей панелью.
- [x] **2.5. Убрать второй источник версий из Compose.** Helpers передают выбранные refs через private env file; image в Compose требует выбранного значения. При возобновлении state не менять image/DB неявно: несовместимую предыдущую версию отклонить с инструкцией выбрать новый state или upgrade runner.
- [x] **2.6. GREEN:** обе Python selections и `docker compose ... config` в тестах; затем fresh/repeated startup на обоих релизах. Проверить runtime panel/core versions, непривилегированный контейнер, права state `0700`/secret `0600`.
- [x] **2.7. Commit:** `test(acceptance): bootstrap pinned supported panel versions` с Co-Authored-By.

## Task 3: Совместимость в реестре, наблюдениях и выборе сервера

**Files:** создать `backend/db/migrations/00045_panel_compatibility.sql` (на момент исследования следующая после 00044; при параллельных миграциях взять следующий свободный номер). Изменить `vpn/internal/queries/servers.sql`, `vpn/server_pool.go`, `vpn/server_management.go`, `vpn/server_pool_test.go`, `vpn/server_management_test.go`, `vpn/server_pool_upgrade_test.go`; regenerated `vpn/internal/store/*`.

**Interfaces:** `Server.Compatibility PanelCompatibility`. В `vpn_servers` добавить `panel_version`, `xray_version` (text default ''), `panel_compatibility` (text default 'unknown', CHECK трёх статусов), `panel_compatibility_reason` (text default 'not_checked', bounded safe code). Существующий observed_at — время общей пробы, новой TTL-конфигурации нет.

- [x] **3.1. Добавить DB/integration tests:** migration сохраняет серверы/нагрузки/reservations и выставляет unknown; selection пропускает online-but-unsupported/unknown; 3.10.2 и 3.11.0 могут сосуществовать. Известная версия без успешного обязательного чтения не делает сервер ready.
- [x] **3.2. Добавить concurrency/replay tests:** медленная старая supported-проба не перезаписывает новую unsupported; revision/retired guards действуют на все поля; старый `vpn_server_actions.result` без новых полей читается как unknown. Повтор ключа не обращается к панели.
- [x] **3.3. RED:** `go -C backend test ./internal/modules/vpn -run 'TestServerPool|TestServerManagement|TestPanelSubscriptionBase' -count=1` при подготовленной test DB.
- [x] **3.4. Расширить ObservePoolServer** единым UPDATE с прежними guards, `ServersTx`/legacy fallback, `managedProbe`, `managedStoredServer`, `managedSnapshot`/`server()`, ping/sync. Не менять хост/ID, input hash и смысл существующих actions. При сетевой/форматной ошибке сохранить последние известные версии как диагностику, но статус сделать unknown с новой причиной.
- [x] **3.5. Допуск chooseServer:** online, !retired, valid URL, compatibility=supported и `LookupPanelRelease(PanelVersion)` по текущему executable. Исторический stored supported не должен обходить исключение версии из реестра. `PanelFor` остаётся доступен для чтения/recovery назначенных клиентов; не превращать его в blanket запрет диагностики.
- [x] **3.6. Генерация и GREEN:** `make -C backend generate`; повторить tests. Сохранить bounded concurrency sync (4 панели), общий deadline и `TestServerManagementSyncSlowPanelsWithinDeadline`. Два чтения status/inbounds не должны вводить unbounded retries или увеличивать общий deadline скрытно.
- [x] **3.7. Commit:** `feat(vpn): track panel compatibility in server selection` с Co-Authored-By.

## Task 4: Граница мутаций и безопасное исполнение workers

**Files:** `vpn/panel.go`, `panel_compatibility.go`, `panel_test.go`, `provision.go`, `access_worker.go`, `service.go`; `backend/internal/app/config.go`, новый `panel_compatibility_config_test.go`; `deploy/compose.yml`, `deploy/acceptance/compose.acceptance.yml`; shared fake `httpapi/regression_provision_test.go`; tests в `httpapi/regression_provision_test.go`, `regression_access_operations_test.go`, `regression_monthly_reset_test.go`, `regression_panel_compatibility_test.go`.

**Interfaces:** private `(*PanelClient).mutate(ctx context.Context, path string, body any) (panelEnvelope, error)` выполняет свежий `RequireCompatible`, затем ровно один существующий POST. Внутри одного клиента первый допуск фиксирует ожидаемую panel version; другая версия до следующей мутации даёт `version_changed`. Единственные потребители — AddClient, Attach, Detach, UpdateAccess, ResetAccessTraffic, DisableAccess. Auth/login и read-only `POST setting/all` идут прежним `call`.

- [x] **4.1. Добавить test table** `TestPanelMutationCompatibility`: каждый из шести методов на unsupported/unknown делает **ноль клиентских POST**; диагностическое чтение и login работают. Последовательность status 3.10.2 → 3.11.0 внутри одного исполнения останавливает следующий POST. Для timeout уже отправленной мутации — ровно один POST, без повтора другим payload.
- [x] **4.2. Расширить payload tests**: `clientHostRuleIds` omitted/[]/[1,2]; keepAlive omitted/0/25/`"15-25"` для 3.11.0; 3.10.2 — числовой вариант; Raw custom fields, reverse object/null, UUID, subId, CSV allowedIPs, int64 bytes > 2^53, expiry ms и devices+1 сохраняются. Не добавлять новую нормализацию, если эти реальные контракты проходят существующий код.
- [x] **4.3. RED:** `go -C backend test ./internal/modules/vpn ./internal/httpapi -run 'TestPanel|TestRegressionPanel|TestRegressionAccess|TestRegressionProvision|TestRegressionMonthly' -count=1` при test DB/Redis.
- [x] **4.4. Перед LeaseOperation/LeaseAccessOperation** после owner lock и загрузки актуального panel ID/target выполнить preflight тем же owner connection. Для trial после bind перечитать operation. Временный unconfirmed без прошлых write/reset markers — `river.JobSnooze(time.Minute)`, не расходующий domain attempts/first-start timestamp. Уже неоднозначные операции не переводить в «точно не записано».
- [x] **4.5. Подтверждённый unsupported** перевести подготовленную операцию в существующий review flow (при необходимости получить lease для существующего SQL transition) до MarkPanelWrite/MarkAccessWrite/MarkAccessReset. Access reason — `panel_version_unsupported`; trial сохраняет свой target и server diagnostic. Для ошибки после возможной записи — review с сохранёнными markers. Не добавлять новую operation status или переписывать frozen JSON.
- [x] **4.6. Подключить mutate и обработать typed compatibility errors** там, где сейчас `_ = p.AddClient/UpdateAccess/Attach/Detach/DisableAccess`. Не принять отсутствие отправленного запроса за успешную запись только из-за подходящего readback; не потерять защиту при повторном ban после reset. Остальные ambiguous outcomes продолжают использовать существующий readback/recovery.
- [x] **4.6a. Удалить глобальный обход uncertain-create.** Убрать `Settings.PanelDuplicateGuardVerified` и условное разрешение в Provision; legacy env absent/false принимается, true и malformed отклоняются с ясной ошибкой. Убрать env forwarding из обоих Compose. В `TestRegressionProvisionReconciliationAbsentAfterAmbiguity` сохранить ноль повторных Add после reconcile; вместо глобального флага смоделировать контролируемое внешнее восстановление exact target и успешное подтверждение чтением. Добавить `TestPanelCompatibilityConfig` для absent/false/true/invalid, выполнить RED/GREEN командой `go -C backend test ./internal/app -run '^TestPanelCompatibilityConfig$' -count=1`. Это явное изменение recovery-политики, описать его в RU/EN runbook.
- [x] **4.7. GREEN:** повторить тесты; добавить regression unknown-before-lease, unsupported-before-first-write, смена версии после первого шага, lost reset reply с VPN-ban, recovery с прежним target. `TestRegressionPanelTargetCompatibility` должен доказать прежнее представление persisted targets. Проверить pool size 1/owner-loss tests.
- [x] **4.8. Commit:** `feat(vpn): guard panel mutations without corrupting recovery state` с Co-Authored-By.

## Task 5: Допуск заказов и подготовленных операций

**Files:** `backend/internal/modules/payments/purchase.go`, `purchase_worker.go`; `backend/internal/modules/subscriptions/access_operations.go`; `backend/internal/modules/vpn/monthly_reset.go`, `group_reconciliation.go`. `vpn/data.go:QueueAccessTx` и `vpn/access_read.go` остаются общими хранилищем/чтением, без сетевого probe внутри SQL transaction. Tests: `backend/internal/httpapi/server_pool_purchase_test.go`, `server_pool_trial_test.go`, `regression_access_preparation_test.go`, `server_pool_access_test.go`, `server_pool_stars_test.go`.

**Interfaces:** использовать `RequireCompatible` из Task 1 и existing owner/review/error API; customer-facing отказ до заказа остаётся `503 SERVICE_UNAVAILABLE`. Для funded order с неподдерживаемой назначенной панелью — существующий purchase review reason `panel_version_unsupported`; unconfirmed до первого изменения — snooze, без повторной оплаты.

- [x] **5.1. Добавить tests:** online unsupported сервер не выбирается для нового trial/заказа; назначенный клиент не переносится на другой сервер; при отказе до checkout provider invoice/receipt/reservation не создаются. Панель меняет версию после оплаты: receipt остаётся один, frozen target/назначение сохраняются, внешнего charge/refund нет.
- [x] **5.2. RED:** `go -C backend test ./internal/httpapi -run 'TestServerPool|TestRegressionAccessPreparation|Test.*Purchase' -count=1`.
- [x] **5.3. Проверить допуск перед созданием заказа/вызовом provider** и повторно в paid fulfillment перед подготовкой access operation. Существующий successful payment webhook принимает финансовый факт независимо от состояния панели. Если нет доступного поддерживаемого сервера для уже funded unassigned order, остаётся ожидание доступности, а не потеря/отклонение receipt.
- [x] **5.4. Проверить callers подготовки** operator actions, trial, monthly reset, group reconciliation, bonus и Stars. Не создавать пустой набор membership и не мутировать неподдерживаемую панель из обходного пути; читать можно. Использовать существующие recovery/decline guards, не добавлять версионные условия в тарифы и webhook verification.
- [x] **5.4a. Сохранить metadata-only/no-op семантику** в `subscriptions/access_operations.go`: допуск требуется перед постановкой реальной panel mutation, после определения `NoClientIntent`/`state_unchanged` и до финальной транзакции. Не требовать возможности записи для чисто локального действия и не выполнять HTTP на lock-owning SQL transaction. Добавить отдельные tests metadata-only на unsupported панели и реального assign/ban, который должен быть остановлен.
- [x] **5.5. GREEN:** tests + refund/reservation/replay сценарии; после операторского восстановления поддерживаемой панели исполнение использует прежний target и одну выдачу.
- [x] **5.6. Commit:** `feat(payments): require compatible panels before access fulfillment` с Co-Authored-By.

## Task 6: Операторские API, веб и Telegram

**Files:** `docs/api/openapi.yaml`, `backend/internal/httpapi/server_management.go`, `server_management_test.go`, `backend/internal/modules/telegram/server_management.go`, `server_commands_test.go`, `web/src/AdminServers.tsx`, `web/tests/server-management.spec.ts`; generated `backend/internal/wire/*`, `web/src/api/schema.gen.ts`. Обновить fixtures summary/detail, включая native/browser helpers, где валидируется exact schema.

**Interfaces:** в `OperatorServerSummary` и `OperatorServerDetail` добавить required nullable `panel_version`, `xray_version`; required `compatibility` enum supported/unsupported/unknown и `compatibility_reason` enum с null для успеха. HTTP mapper нормализует zero-value старых action snapshots в unknown/not_checked. Create input и набор server actions не меняются.

- [x] **6.1. Добавить API/replay tests:** реальные поля проходят list/detail/ping/sync и action replay; старый retained action не требует сети и не выдаёт supported. Versions/reasons не включают raw provider body/секреты.
- [x] **6.2. Добавить Playwright и Telegram assertions:** online + unsupported показан отдельно от offline; unknown имеет понятную причину; ping обновляет версию; RU/EN доступны; после 401/403 инфраструктурные действия скрываются по прежним правилам. Пустые версии — «неизвестно», не 0.
- [x] **6.3. RED:** backend tests `TestServerManagement|Test.*ManagedServer`, `go -C backend test ./internal/modules/telegram -run 'Test.*Server' -count=1`, `npm --prefix web run test:e2e -- server-management.spec.ts`.
- [x] **6.4. Изменить source schema и consumers**, затем `make -C backend generate`, `npm --prefix web run api:generate`. В UI достаточно сведений в существующих карточках; новая страница или ручной переключатель «игнорировать совместимость» не нужны. Telegram использует безопасные локализованные строки и прежнее ограничение длины сообщения.
- [x] **6.5. GREEN:** те же tests, `npm --prefix web run typecheck`, `npm --prefix web run lint`. Проверить правило удаления: unsupported само по себе не ослабляет существующие проверки owned facts/provider clients.
- [x] **6.6. Commit:** `feat(operators): show panel versions and compatibility` с Co-Authored-By.

## Task 7: Одинаковая native-матрица, смешанный пул и upgrade/rollback

**Files:** `.github/workflows/platform-checks.yml`, `deploy/acceptance/local.py`, `deploy/server-management/local.py`; создать `backend/tests/native_panel_compatibility_test.go`, `deploy/acceptance/panel_upgrade.py`, `tests/test_panel_upgrade.py`; расширить `backend/tests/native_server_pool_test.go`, `native_trial_integration_test.go`, `native_group_real_panel_test.go`, `server_management_integration_test.go`. Использовать существующие `deploy/purchase/`, `subscription-operations/`, `account-restrictions/`, `device-connection/` scenarios. Править version labels в browser reports, не переписывая независимые тесты.

**Interfaces:** обязательный native test `TestNativePanelCompatibility` читает owned `NATIVE_DOCKER_STATE` и не засчитывается как runtime evidence при synthetic fixture/skip. Upgrade runner CLI: `python deploy/acceptance/panel_upgrade.py check --target 3.10.2|3.11.0 --state <new-owned-state>`; источник только pinned 3.10.0 из upgrade_sources, marker purpose=panel-upgrade. Отчёты содержат SHA, обе panel/core versions, image refs, commands, PASS/FAIL/SKIP, без секретов.

- [x] **7.1. Добавить native contract test** для admin Bearer и username/password+CSRF: read→update→read, add/attach/detach/reset/bulkDisable, identity/units/unknown fields, настоящий 401/403 и subscription-base discovery. Для 3.11.0 — host binding и range keepAlive preservation; для 3.10.2 — отсутствие этих optional features не считается провалом core.
- [x] **7.2. Запустить одинаковый core suite на каждой версии:** fresh/repeated bootstrap; trial→paid; renewal/plan/profile change; ban/unban; monthly reset; lost reply/restart и partial membership; subscription URL/QR и настоящий VPN traffic к test origin. Расширить явный selection `native_check` или отдельный CI run так, чтобы `TestNativePanelCompatibility` и нужные существующие tests реально выполнялись, а не только `TestNativeTrial|TestNativeNotices`.
- [x] **7.3. Добавить смешанный пул** primary 3.10.2 / secondary 3.11.0 и обратное назначение: независимые наблюдения, выбор/renewal остаются на своей панели, unsupported не получает клиентов, частичная недоступность одной панели не отключает вторую. Настоящие две панели не называть master/node evidence.
- [x] **7.4. Добавить unit tests upgrade runner:** произвольный/непустой state и неподдерживаемый target отвергаются; source ref берётся только из upgrade_sources; snapshot делается после остановки панели; исходная копия не изменяется; rollback выбирает старый image+исходную DB. RED до реализации.
- [x] **7.5. Реализовать rehearsal:** создать собственных клиентов active/quota-disabled/manually-banned, memberships и ненулевой traffic на 3.10.0; сохранить ожидаемые UUID/subId/URL/limits/traffic и private snapshot. Обновить рабочую копию до каждой target версии, дождаться migrations, выполнить readback/renewal/reset и реальное подключение. Восстановить исходную DB+образ 3.10.0, сравнить исходные факты. Старый образ никогда не открывает мигрированную DB. PostgreSQL mole backup не выдавать за rollback DB панели.
- [x] **7.5a. После восстановления source 3.10.0** новый mole должен сохранять запрет мутаций; сравнение восстановленных данных runner делает диагностическим чтением. Разделить в отчёте сохранность данных панели и полноценный service rollback, для которого нужен предыдущий совместимый release mole.
- [x] **7.6. CI берёт matrix из JSON registry** (supported only), каждый matrix job имеет отдельные state/artifacts. Удалить positive 3.7.0 control. Общие product/UI/static tests запускать один раз; core native acceptance — одинаково для обоих релизов. Все mandatory native tests имеют ненулевой счётчик и ноль SKIP. Проверка миграции запускается для обоих target, mixed-pool — отдельным прогоном.
- [x] **7.7. Убрать неверные fixed version labels** в отчётах `deploy/account-security/browser.mjs`, `access-profiles/browser.mjs`, `account-restrictions/browser.mjs`, `subscription-operations/browser.mjs`, `operator-cabinet/browser.mjs`, соответствующих native assertions/comments. Читать actual runtime metadata. Сохранить CSV/absence/keepAlive совместимые нормализации даже при удалении ссылок на 3.7.0: эти формы есть и в поддерживаемых релизах.
- [ ] **7.8. GREEN:** Python upgrade tests; полный обязательный matrix CI; локальная arm64-проверка образов и VPN smoke, если заявляется runtime support arm64. Наличие arm64 manifest само по себе не является PASS. Не включать master/node или произвольные Xray в итоговую поддержку без отдельного evidence.
- [x] **7.9. Commit:** `test(ci): verify supported and mixed panel versions` с Co-Authored-By.

## Task 8: Политика, rollout и итоговая проверка

**Files:** `docs/ru/engineering.md`, `docs/en/engineering.md`, `docs/ru/operators.md`, `docs/en/operators.md`; update #128. Изменять README только если там появляется или уже есть утверждение о поддерживаемых версиях.

- [x] **8.1. Документировать точную матрицу**, проверенные core/topology/architecture, unsupported/unknown поведение, токены, host binding/keepAlive preservation, первый запуск, recovery funded orders и откат. Описать процедуру добавления patch-релиза: registry PR → contract diff → native/mixed/upgrade evidence → release notes.
- [x] **8.2. Предусмотреть rollout gate:** перед применением в production оператор получает перечень фактических panel versions и ожидающих операций. 3.10.0/3.7.0 обновляются отдельно; во время обновления останавливаются новые операции и завершаются/разбираются in-flight writes. Включение нового executable не должно неожиданно остановить обслуживание клиентов из-за незамеченного старого сервера.
- [ ] **8.3. Выполнить итоговые проверки** `make -C backend generate`, `npm --prefix web run api:generate` и проверить отсутствие незакоммиченного generated diff; `go -C backend vet ./...`, штатный `make -C backend test-integration TEST_TIMEOUT=60m` с test DB/Redis, Python unittest suite, web typecheck/lint/e2e и matrix из Task 7. Не повторять уже прошедшие дорогие прогоны без новых изменений/причин.
- [ ] **8.4. Приложить evidence к #128:** точные SHA/digest и фактические результаты, отдельно synthetic/API/runtime/browser/upgrade; закрывать задачу только после обязательной runtime-приёмки. Остаточные ограничения перечислить явно.
- [x] **8.5. Commit:** `docs: define multi-version panel support and upgrade policy` с Co-Authored-By.

## Критерии завершения

- [ ] 3.10.2 и 3.11.0 проходят одинаковую core-приёмку, 3.7.0 не поддерживается и не допускается к клиентским мутациям.
- [ ] Unknown/unsupported не выбираются для новых клиентов; версии и причина доступны оператору; online не подменяет compatibility.
- [ ] До внешней записи отказ не создаёт ложные write/reset markers; после возможной записи сохраняются исходные recovery-ограничения.
- [ ] Уже принятая оплата, immutable target, назначения и identity сохраняются при проблемах совместимости.
- [ ] Смешанный пул, bootstrap/restart, host/keepAlive preservation, ручной ban/reset, real VPN и upgrade+rollback подтверждены отдельными evidence.
- [ ] Изменение supported registry не требует переписывания domain workers; лишних version-specific клиентов и dependencies нет.

## Что проверено при подготовке плана

Прочитаны перечисленные owning modules, SQL/API schemas, worker lease/write/reset порядок, shared fakes, native selections, UI/Telegram consumers, обе версии upstream status/client model и публичные OCI manifests. Проверены текущий main и исходное содержимое #128. Код продукта не менялся; контейнеры и runtime acceptance не запускались. Наличие CI steps и тестовых файлов не трактуется как подтверждение их успешного исполнения.

## Состояние реализации

Реализация: ветка `codex/panel-multiversion`, PR [#129](https://github.com/ekho/3xui-mole/pull/129).
На arm64 обе версии прошли одинаковые 24 native tests/subtests без FAIL/SKIP,
оба направления смешанного пула, отдельные обновления из 3.10.0 с исходным
DB/image rollback и реальным VPN. После финального ревью исправлены порядок
admission→markers→POST, запись worker diagnostics и причины в Telegram;
новые регрессии получили RED/GREEN. Веб: 681 Playwright PASS, Python: 44 PASS.
Финальные CI jobs на amd64 и завершение полного backend `-race` остаются
проверкой выпуска; незавершённые пункты выше намеренно не отмечены.
