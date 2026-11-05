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
