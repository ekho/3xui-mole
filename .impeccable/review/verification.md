# «Маршрут»: проверка реализации

Дата: 2026-11-05. Область: клиентский кабинет, Telegram Mini App и интерфейс оператора. Проверен собранный frontend с вымышленными API/SDK-данными, без обращения к платёжным провайдерам.

## Автоматические проверки

| Проверка | Результат |
|---|---|
| TypeScript, production build | Успешно; финальный build включает `tsc` |
| ESLint | Успешно |
| Ограничения размера bundle | Успешно; предупреждение Vite о крупном Admin chunk сохраняется |
| Development CSP, CSS, React Fast Refresh (`test:dev`) | Успешно |
| Полный исходный Playwright-набор | 683/685; два падения связаны с потерей видимого времени окончания подписки |
| Повторная проверка после исправлений | 106/106, включая оба падения полного прогона и новые проверки тёмного notice, пустой Telegram-темы и hover языковых кнопок |
| `git diff --check` | Успешно |

На этапе визуальной приёмки повторно проверялись связанные группы `cabinet`, `mini-app`, `ui-ux`, `promo-activation`, `operator-cabinet`, `subscription-profile`. Исходные логи той проверки: `/tmp/mole-e2e-full.log`, `/tmp/mole-final-focused.log`, `/tmp/mole-static-checks.log`. Новый полный прогон для PR описан ниже.

## Визуальная и независимая проверка

Desktop1440×900, mobile390×844 и375×812; RU/EN; светлая и тёмная темы. Проверены кабинет, Mini App, каталог, заказ, идентификация аккаунта, поддержка, список и карточка клиента оператора, мобильное меню. Таблица оператора прокручивается внутри контейнера; страницы не имеют горизонтального переполнения на проверенных размерах.

Снимки и измерения: [implementation-evidence.md](implementation-evidence.md). Первичный независимый обзор: [finish-review.md](finish-review.md). [Повторный вердикт](finish-verdict.md): **ship**, все F1–F7 resolved. Он оценивает только семь перечисленных исправлений, а не проводит новый аудит всего продукта.

## Границы результата

На момент первоначальной визуальной приёмки изменения оставались локальными. Backend/API и зависимости не менялись. Реальный Telegram, реальные аккаунты и платёжные провайдеры не проходили runtime-приёмку. Перед развёртыванием нужна проверка этих интеграций в разрешённом окружении.

## Подготовка PR — 2026-11-05

После одобрения внешнего вида пользователь разрешил подготовку PR и локальные проверки. Тестового кабинета нет; пользователь ограничил текущий этап словами «только PR и локальные проверки». Слияние, выпуск и развёртывание не выполняются; реальный Telegram остаётся отдельным этапом.

Основа ветки `codex/route-redesign` совпадает с проверенным `origin/main` (`c8de8377cd1aaf2382687c3fc886ad9b221a80de`). Свежие production build, TypeScript, ESLint и проверка размера bundle прошли. Девять выбранных браузерных интеграционных Go-тестов прошли с `-race` и настоящим backend на выделенных локальных PostgreSQL/Redis. Они покрывают web-trial, запуск Mini App, переходы оплаты, Stars, промокоды, приглашения и maintenance. Внешние Telegram SDK/API, платёжные системы и панель в этих сценариях заменены тестовыми сервисами; это не проверка настоящего Telegram и не реальная оплата.

Команда connected-проверки: `RUN_BROWSER_TESTS=1 go -C backend test -race ./tests -run '^(TestWebTrialFlowAndFailures|TestNativeTrialTelegramActivationBrowser|TestNativeMiniBrowserPayments|TestNativeTrialStarsBrowser|TestNativeStarsRecurringBrowser|TestNativePromoActivationBrowser|TestNativeReferralsBrowser|TestNativeMaintenanceBrowser|TestPromocodesBrowser)$' -count=1 -timeout=15m -v`, с отдельными `TEST_DATABASE_URL_FILE` и `TEST_REDIS_URL_FILE`. Итог:9/9, без skips. Лог текущей сессии: `/tmp/mole-route-connected.log`.

Свежий полный браузерный прогон `E2E_PORT=4193 npm --prefix web run test:e2e`: **687/687 passed**,8мин, exit0. Сюда входят новые регрессионные проверки темы/контраста; прежние два падения не повторились. Лог текущей сессии: `/tmp/mole-delivery-e2e.log`. Временные контейнеры, сеть и данные проекта `mole-route-4516` удалены после проверки; остальные локальные сервисы не менялись.

## Исправление переполнения, обнаруженного в CI

Первый [Platform checks run42020939880](https://github.com/ekho/3xui-mole/actions/runs/42020939880) прошёл 686/687 браузерных сценариев: русская версия мобильного кабинета не уложилась в ширину375px. Обе native-panel проверки (3.10.2 и3.11.0) прошли. Успешный локальный macOS-прогон выше не заменяет этот результат CI.

Ошибка воспроизведена локально в изолированном Linux-контейнере с тем же Chromium153.0.8010.12 (Playwright revision1243) и системным DejaVu Sans. Строка пагинации `ClientNotices` задавала минимальную ширину403.2px; правая граница доходила до419.2px при viewport375px. Удалено переопределение мобильной пагинации в горизонтальный ряд: до540px общий компонент снова располагает кнопки вертикально на всю ширину. Текст и действия сохранены, скрытие overflow не используется.

Существующая проверка кабинета теперь дожидается загрузки notice перед измерением ширины и при ошибке выводит размеры вышедших за экран элементов. После исправления RU/EN на Linux прошли2/2, затем6/6 в трёх повторах. Снимки полного документа: [RU](linux-mobile-ru.png), [EN](linux-mobile-en.png), viewport375×812; детали подписки и аккаунта раскрыты тестом. Независимый узкий verdict: **ship**, исправление resolved; DESIGN.md сверён с окончательной раскладкой. Логи: `/tmp/mole-route-linux-repeat.log` (reproduction), `/tmp/mole-route-linux-green.log`, `/tmp/mole-route-linux-stability.log`.

После последней CSS-правки production build/TypeScript, ESLint и bundle budgets прошли повторно. Связанные группы `cabinet`, `notices`, `operator-cabinet`, `mini-app`, `ui-ux`: **156/156 passed**,2.6мин, exit0 (`/tmp/mole-route-overflow-focused.log`).

## Стабилизация существующего backend-теста

[Run42028749571, attempt1](https://github.com/ekho/3xui-mole/actions/runs/42028749571/attempts/1) остановился до браузерного набора: `TestRuntimeOwnerWarmupLossAndCancel` обнаружил advisory lock сразу после закрытия клиентского соединения. Обе native-panel задачи прошли. Исходный тест воспроизвёл это падение в1 из20 локальных повторов на выделенной PostgreSQL с `-race`.

`pgx.Close` отправляет Terminate и закрывает клиентский сокет; завершение серверной сессии наблюдается через другое соединение. Тест теперь опрашивает освобождение блокировки каждые10мс с пределом3с, как уже делает при ожидании её захвата. При сохранении блокировки или ошибке запроса тест по-прежнему падает. Рабочий код backend не изменён.

Отмена warm-up и соседний сценарий contention/loss/restart прошли по20 раз: **40/40**,163.8с, с `-race`. Команда: `go -C backend test -race ./internal/modules/operations -run '^TestRuntimeOwner(WarmupLossAndCancel|ContentionLossAndRestart)$' -count=20 -timeout=5m -v`, с отдельными файлами URL PostgreSQL/Redis. Логи: `/tmp/mole-route-owner-repeat.log` и `/tmp/mole-route-owner-fixed.log`.
