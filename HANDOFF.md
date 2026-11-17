# Digimium website — full continuation handoff

Updated **17 November 2026, Asia/Bangkok**. This is the current starting point for another chat or developer. It supersedes the 14 November showcase handoff. Newest entries in [NOTES.md](NOTES.md) describe current status; older entries and dated QA reports are historical evidence.

## 1. Current state and next action

The existing website is implemented and live. **Continue this project; do not rebuild it.** The latest application runtime is **6248c3f93b6183f57549aea012a9a3b675cde947** (Admin-created customer orders). It was observed Hostinger **Completed / Current** on both environments on 16 November. Final verification documentation was subsequently committed as **6efd697** on testing only. This handoff adds documentation on testing, without promoting a new production application or changing live data.

There is no unfinished website feature from the preceding request. The owner can give the next change after this handoff is loaded. The latest completed feature lets Admin record an earlier purchase for a customer who registered after buying as a guest. The postponed giveaway must remain hidden.

| Resource | Current value |
| --- | --- |
| Canonical source | [LynnintheLab/digimium_website_final](https://github.com/LynnintheLab/digimium_website_final) |
| Clone URL | https://github.com/LynnintheLab/digimium_website_final.git |
| Development / live branches | **testing** / **production** (default) |
| Production | [Store](https://buywith-digimium.store) · [Admin](https://buywith-digimium.store/admin) |
| Testing | [Store](https://test.buywith-digimium.store) · [Admin](https://test.buywith-digimium.store/admin) |
| Branch comparison | [production...testing](https://github.com/LynnintheLab/digimium_website_final/compare/production...testing) |
| Hosting | [Hostinger hPanel](https://hpanel.hostinger.com/), managed Node.js, separate app/database per environment |
| Earlier Sites target | [Legacy storefront](https://digimium-minimal.aungnyeinchantun23.chatgpt.site), separate deployment/storage |

GitHub metadata was rechecked on 17 November: the repository is **PUBLIC**, default branch production. The owner's general preference is private per-project repos; visibility was not changed. Do not assume privacy or alter the hosting integration incidentally.

The checkout is named **digimium-website** inside the shared **digimium rebranding** design-media workspace. Use the checkout on the active machine. Keep project paths relative; do not hardcode Mac/Windows home paths.

## 2. Owner constraints

- **Protect Kosai Namti**, the real customer explicitly identified by the owner. Preserve all other live customers/orders during development too. The owner will clean test data manually using the delivered controls.
- Deletion controls are implemented; that is not permission to delete live customers, pending/approved/rejected orders or participants as a test.
- Do not open Telegram app/launch links, send provider messages or create fake live accounts/orders for incidental verification. Mutation tests use disposable local databases and intercepted providers.
- Preserve prices, publication/order/Best Seller flags, saved contacts, provider settings, bot webhook, secret values and campaign dates unless a specific change is requested.
- Keep the giveaway postponed and hidden until explicitly reopened. No automatic relaunch or invented dates.
- A website order means a saved tracking record, **not** proof of a sent Telegram message, payment or approval.
- Work on testing. Pull before edits; update NOTES (Current status / Last thing done / Next steps), commit intended files and push before ending. Do not force-push.
- Never commit secrets, customer/database dumps, local sessions or builds. Live MySQL and private keys require backups independently of Git.
- Preserve established compact layouts, actual website fonts, original logos and restrained motion.

The checkout has unrelated **untracked iCloud numbered duplicates** (names ending in 2, 3, etc.), plus untracked **hostinger/provider-identities.ts** and **public/assets/showcase/**. They are not part of the reviewed release. Do not stage, delete or use them without inspection. Avoid blind git add -A, git clean or broad resets; stage named task files.

## 3. Fresh checks versus historical release evidence

Public **GET-only** checks on 17 November passed all 16 requests below. No sign-in, job invocation, write or provider send occurred.

| Check | Production | Testing |
| --- | --- | --- |
| Home / Admin login | 200 / 200 | 200 / 200 |
| Public catalog | 200, **51 published products** | 200, **54 published products** |
| Giveaway API | 200, **JSON null / hidden** | 200, separate **draft** configuration |
| Google capability | Enabled | Enabled |
| Telegram capability | Enabled | Disabled |
| Anonymous Admin commerce GET | 401 | 401 |
| Anonymous customer orders GET | 401 | 401 |
| Admin document referrer policy | same-origin | same-origin |
| API referrer policy | no-referrer | no-referrer |

Last authenticated Hostinger observations, 16 November:

- Testing runtime 6248c3f, deployment **01a1e52e-a8a7-7229-b3bb-06be2e0666b1**, Completed / Current.
- Production runtime 6248c3f, deployment **01a1e532-e58d-7006-a66f-cd2204656c99**, Completed / Current.
- Testing later received documentation 6efd697. A Git push is not proof of a newer hosted activation.

Capabilities confirm configuration, not a new real provider login today. The manual-order UI was tested with a local production build and synthetic customers, without a live customer write. No fresh authenticated hPanel inspection or production backup was made for this documentation handoff.

## 4. Storefront and design

The bilingual digital-subscription catalog defaults to **Myanmar**, preserving explicit English choice. Fonts: self-hosted **Manrope** (English), **Wa Lone** (Myanmar). Preserve blue/lavender gradients, Persian Blue #1F45B8, Egyptian Blue #123499, Navy #051650, colored service marks, original blue favicon and “Digital. Premium. Make Simple.”

Wide desktop uses about **80% screen width**, **four catalog columns** and an **eight-service initial preview** with expansion. Phones retain **two columns**. Source is authority for intermediate breakpoints. Payment copy/logos and prize/count groups are compactly centered, rather than spread across the screen.

Search, categories, saved publication flags, hidden-description switch, ordering guide, FAQ, contacts and share metadata remain. The showcase rotates eligible **Best Seller / paid-plus-free promotions / discounts**, with category fallback. Best Seller is a manual owner designation, independently at product and plan level. Selected offer determines paid/gift periods and effective price.

The scroll rail groups **21 ticks** near viewport center, supports mouse/touch dragging and keyboard, and varies **length only** for position. Uniform thickness, no blue highlight; marks adapt black/white to the section behind them. Lighting/tiles/autoplay respect reduced motion, interaction and tab visibility.

Customer light/dark appearance persists or follows the system. Admin remains light. Refined dark card/panel/logo plate/selected-state contrast should be preserved in both languages.

## 5. Cart, account and history

### Checkout

Cart localStorage key: **digimium:shopping-cart:v1**. It stores IDs/quantities, not trusted prices. Restore resolves current public catalog and drops invalid/hidden/unavailable items.

- Signed out: **Create account** or **Buy on Telegram**. Sign-in/register stays inside the order dialog and returns to cart review, without automatic submission.
- Signed in: **Place order** uses the verified account.
- Telegram guest: no fabricated name/email/account. Guest cookie/request keys deduplicate retries. Guest records stay Admin-only even if the browser later registers.

Server saves a pending snapshot before Telegram handoff. **Customer must press Send in Telegram.** A person without Telegram may leave a valid pending website record without contacting support; that alone is not evidence of a site fault. Keep clipboard/manual-copy and support fallbacks.

Cart clears on server acknowledgement. Receipt is a pending-order acknowledgement, not payment success. Explicit **Cart → View saved order** recovery is tab-local, expires after 24 hours and does not reopen automatically when returning from Account/History.

### Account and history

Top-menu Account is last and highlighted. Inline Account is read-only: profile, **two purchased-plan previews** and **two brief pending rows**. Round gear opens full settings. Backend overview may cap three approved lines; that differs from the two-line brief UI.

Full **/account** shows profile/password/settings and connected methods, **without history**. **/order-history** has **Approved / Pending / Rejected** views. Purchases show service logos, **segmented semicircle remaining-DAY gauges**, status and separately spaced dates; no percentage or large solid circle. Myanmar-calendar dates distinguish upcoming, active, ends-today and expired. Rejected orders never become active subscriptions. Decision notes appear in full history.

Optional delivered **Account / Password / Manager / Username** are encrypted and appear only in the owning customer's approved full history, with passwords initially masked. Never include these in previews, pending responses, receipts, public data, bot history or notifications.

Mobile dock: Products, Cart/count, raised center Account, History, Help. It yields to overlays/keyboard and preserves safe areas, focus return and scrolling actions.

## 6. Admin workflows and latest manual orders

Owner-email OTP protects Admin. Sections: Services, Orders, Customers, Giveaways, Contact settings.

| Area | Implemented behavior |
| --- | --- |
| Catalog | Edit products/plans, categories/availability/publication, descriptions, paid/gift duration, discounts, Best Seller, plan order, contacts and logos |
| Customers | Review/edit supported name/email fields, inspect identities/orders, create an order, send website message, protected delete |
| Orders | Review reference, dates, optional encrypted delivery, customer-visible note; Approve/Reject |
| Removal | Pending/Rejected **Remove**, Approved **Delete**, exact displayed reference and reviewed revision |
| Messages | Per-customer plain text; optional no-button/preset/custom HTTPS button |
| Giveaway | Saved dates, explicit Launch, reversible Hide/Show; leave production hidden |

### Earlier guest purchase → registered customer's record

Entry: **Customers → Create order**, **Customer details → Create order for this customer**, or **Orders → Create order**.

1. Choose the exact existing customer. Customer-specific entry locks selection; review identity/contact/customer ID.
2. Select published available offers, quantities and actual whole-MMK unit prices. Saved catalog/discount prices prefill. Historical negotiated prices may override; unpriced offers require an explicit amount. Zero is valid for an intentional complimentary purchase.
3. Review totals and **Create pending order**. It opens the existing editor.
4. Set original historical start/expiry dates, optional delivery fields and decision note; Approve when confirmed.

This makes a **new account-owned record**. It never auto-matches email, claims/reassigns/deletes the original guest record or sends a new-checkout Telegram alert. The owner handles duplicate bookkeeping manually.

Stable request UUID plus namespaced payload hash make exact retries recover one original snapshot even after catalog changes. Changed payload under that key returns 409. Parent customer locks serialize create/delete races. Server validates catalog revision, trusted snapshots, safe quantities/prices/totals. Public checkout cannot use Admin-only price overrides.

Uncertain network submission freezes fields and offers **Retry same request**. Do not change its payload and create another uncertain submission. Catalog-conflict recovery retains draft selections/prices for reload/review. Phone form footer scrolls below fields.

See [manual-order release report](docs/ADMIN-MANUAL-ORDERS-2026-11-16.md).

## 7. Authentication, providers and Telegram

### Owner login

Resend delivers a browser-bound six-digit code to ADMIN_EMAIL. Codes expire after 10 minutes, allow five verification attempts; sending is limited to one/minute and five/hour. Successful verification creates a server-side remembered session up to 180 days. Sign-out invalidates it. Customer login grants no Admin access.

Native browser QA found global no-referrer made Admin form POST Origin opaque. **Admin document paths deliberately use Referrer-Policy:same-origin**; Account/History/API retain no-referrer. Do not relax strict missing/null/foreign Origin validation to fix login.

### Customer methods

- Email/password supported; passwords are hashed, not exposed by Admin APIs.
- Google configured on both hosts, basic identity scopes only. Google-only accounts have no invented website password. Attaching Google to an email/password account with matching verified email requires existing-password confirmation; equal email text alone does not claim ownership.
- Telegram code login configured on production only. Stable numeric Telegram ID owns identity; names/usernames are not account keys. Telegram-only accounts may have null email/password.
- Signed-in Google/email customers can explicitly **connect Telegram** in full settings via an exact customer/session-bound challenge. An already-owned identity is rejected; no merge/transfer of accounts/orders.
- General Google-connect from Telegram-only settings and phone login are not promised beyond the actual supported UI; unsupported methods remain Coming soon.

Production bot: **@digimium_login_bot**. Webhook: **https://buywith-digimium.store/api/customer/telegram/webhook**. **One bot has one webhook**: do not repoint it to staging or use getUpdates as a shortcut. Preserve provider settings; another active environment needs a separate bot.

Website Telegram challenge: four-digit comparison code, five-minute countdown, optional QR, Refresh/Cancel. Bot presents four distinct choices plus Reject. Bound browser/session, secret webhook header, sender/chat/message and opaque choice are checked. Verification uses a distinct lock image; actual website-session success uses a success image. Photo failure falls back to text. Packaged DB-IP country data supplies honest approximate device/location context, not GPS claims.

Bot history/plans are scoped to the verified Telegram sender's mapped customer, never guest/unrelated email/Google purchases or delivered credentials. [Provider guide](docs/LOGIN-PROVIDERS.md).

## 8. Website notifications, owner alerts and cron

Customer bell shows unread count, paginated owner-only messages and one/all-read actions. These are **website notifications**, not phone push or customer Telegram messages.

Admin → Customers → Website message: plain text up to 1,000 characters; optional saved destination/custom HTTPS button with editable label up to 60 characters. No button is valid. Unsafe executable, credential-bearing and control-character URLs are rejected. Identical request/button retries deduplicate. Do not enter secrets or private staff notes.

Expiry reminders: **3 and 1 Myanmar calendar days** before approved saved term ends, **Asia/Yangon UTC+06:30**. Excludes guests/pending/rejected/unknown dates. Term-date changes transactionally remove stale expiry reminders; unchanged dates preserve them. Bounded scans use a cursor; a bell read does not replace the scheduler.

New customer/new checkout records queue owner alerts through the **existing bot → owner's personal chat**, as chosen. Manual historical order creation sends no new-checkout alert. No automatic customer email was added.

Owner-approved production job key and **five-minute Node cron** are configured. Runner: **scripts/run-notifications.mjs**, schedule ***/5 * * * ***. It reads APP_ORIGIN and NOTIFICATIONS_CRON_SECRET from private app env; no secrets in the command or URL. It sends a private Bearer POST, refuses redirects and times out. Regression covers Hostinger's version-switching current symlink.

Hosted cron produced “Notification maintenance completed.” on 16 November. That confirms successful invocation, **not exactly-once delivery of every queue row**. No fake live order/account was created for delivery testing. Cron/outbox was not reinspected today. Keep staging owner-chat alerts disabled and preserve the bot webhook.

Deleting an order removes linked website notifications; delivered Telegram alerts cannot be recalled. Worker cancels unsent deleted-entity alerts. No automatic retention purge exists. Full limits/configuration: [notification runbook](docs/NOTIFICATIONS.md).

## 9. Postponed giveaway and separate OTP Link

The owner postponed the giveaway until launch. Production public API is **JSON null**. **Keep hidden** until explicit owner instruction. Hide/Show preserves dates/launch time/entries (two participants preserved at pause); hidden joins are rejected server-side.

When explicitly resumed, configured prizes are:

- Gemini Pro — 3 months, **2 winners**.
- Canva EDU Pro — 12 months, **3 winners**.
- ChatGPT Go · Own Mail — 1 month, **1 winner**.

Website account plus verified Telegram link required. One entry per campaign/customer and Telegram identity. Unlinked customers receive illustrated connection guidance. Joined copy: “Giveaway တွင် ပါဝင်ပြီးပါပြီ”. Selection countdown targets campaign end; winner choice remains **manual**, not an implemented automatic drawing engine. Do not invent dates.

Gold banner/showcase/prize section differ from blue offers but all disappear when hidden. Testing retains its separate draft; never copy it into production.

**OTP Link is a separate project:** [LynnintheLab/digimium-otp-link](https://github.com/LynnintheLab/digimium-otp-link). Customer link/copy analytics and its Admin are not this store. Its independent PHP giveaway switch is disabled; source 9290c3f was uploaded as public_html/index.php and live hash matched at the recorded check. Store pushes do not deploy that PHP file. Reopening requires separately reviewing both systems. Protected customer OTP links were not opened for analytics testing. [Pause evidence](docs/GIVEAWAY-PAUSE-QA.md).

## 10. Runtime, database and environment

### Build

Verified runtime **Node.js 24**. Current locked versions: Next.js 16.4.6, React/React DOM 19.2.9, TypeScript 5.9.3, Zod 4.6.7, mysql2 3.24.6. Package lock is authoritative. Engine minimum is lower; use Node.js 24 for direct TypeScript test imports.

npm run build runs Next webpack then scripts/package-hostinger.mjs. Standalone output: **.next/standalone**. Packaging includes required public/static assets, SQL/provider data and notification runner, stripping copied env files. npm start runs .next/standalone/server.js.

Hostinger settings: root ., Next.js preset, npm, Node.js 24, npm run build. Preserve working settings and separate app origins/databases. Auto-deploy follows configured branch. Git pushes, Hostinger activation and Sites publication are distinct.

Legacy Sites target uses Vinext/Vite, D1/R2, Sites identity and separate data. Preserve .openai/hosting.json project ID and DB/BUCKET bindings. Do not publish a replacement Site to update the Hostinger shop.

### Persistence authority

| Data | Authority |
| --- | --- |
| Source, built-in fonts/marks, seed/tests/docs | GitHub |
| Catalog/prices/publication/contacts, uploaded logos | Each environment's **MySQL** |
| Customers/sessions/identities, orders/encrypted fulfillment, giveaways/entries, notifications/outbox/job cursors | Each environment's **MySQL** |
| Runtime secrets/encryption keys | Private hPanel / ignored local env |
| Cart / saved receipt | Visitor localStorage / bounded tab sessionStorage |
| Legacy Sites catalog/logos | Separate D1/R2 |

Combined seed: **54 products / 104 plans / 50 originally published plans**. These are seed counts, not live production. Never reseed initialized data or overwrite 51 live products with test/seed state. DB failure must report error, not reset.

Schema files: base schema.sql; customer-auth-schema.sql; order-schema.sql; Google/Telegram *-auth-schema.sql and *-identity-schema.sql; giveaway-schema.sql; notification-schema.sql under hostinger/. Current bootstrap code also applies guarded additive changes for nullable provider identities, fulfillment/decision/button fields, etc. Review current code and schema privileges; the original six-table base file is not the complete database model.

Back up **all MySQL tables including logo bytes**, plus matching private keys/settings, independently of Git. Clone/push/rollback cannot restore live data. Review older validator/schema compatibility before rollback. No new production backup was made for this handoff.

### Environment key names only

Templates: [.env.example](.env.example), [hostinger/.env.example](hostinger/.env.example). Never place actual values in chat, Git, screenshots or logs.

| Group | Keys |
| --- | --- |
| Owner login | APP_ORIGIN, ADMIN_EMAIL, ADMIN_AUTH_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL |
| MySQL | DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD |
| Fulfillment encryption | ORDER_FULFILLMENT_SECRET; falls back to ADMIN_AUTH_SECRET when absent |
| Google | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |
| Telegram | TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET |
| Scheduler/owner alerts | NOTIFICATIONS_CRON_SECRET, ADMIN_TELEGRAM_CHAT_ID, optional ADMIN_TELEGRAM_BOT_TOKEN |

Keep keys stable across routine redeploys. Rotating fulfillment key or fallback can make saved delivery unreadable; changing auth/origin can invalidate sessions/challenges. Rotation needs a reviewed recovery plan, not an incidental login fix.

Ignored local files present by **filename only**: .env.google.local, .env.telegram.production.local, .env.telegram.testing.local, .env.notifications.production.local. Values/freshness were not inspected today. Filename presence is not proof of current live settings. They do not transfer through Git/chat. hPanel is deployment authority.

## 11. File map

| Area | Main files |
| --- | --- |
| Server entry/metadata/theme bootstrap | app/page.tsx, app/layout.tsx |
| Browse/nav/responsive | app/storefront.tsx, app/globals.css, app/storefront-order.css |
| Theme/dock/rail | app/theme.css, app/theme-toggle.tsx, lib/shop-theme.ts, app/mobile-dock.*, app/scroll-rail.* |
| Showcase/payment/logos | app/collection-showcase.*, app/showcase-artwork.tsx, lib/showcase.ts, app/payment-methods.*, app/product-mark.tsx, lib/product-logo.ts |
| Cart/receipt/draft | app/shop-order.*, lib/cart-order.ts, lib/order-receipt.ts, lib/order-telegram.ts |
| Account/history | app/account-menu.*, app/account/account.tsx, app/account/page.tsx, app/order-history/page.tsx, app/account/subscription-term.* |
| Provider UI | app/account/auth-form.*, use-google-login.ts, use-telegram-login.ts, telegram-login.*, account-connections.* under app/account/ |
| Admin catalog | app/admin/admin-catalog.tsx, plan-editor.tsx, duration-field.tsx, price-field.tsx, logo-editor.tsx |
| Admin customers/orders | app/admin/commerce/admin-commerce.tsx, create-order.tsx, customer-editor.tsx, order-editor.tsx, remove-order-dialog.tsx, commerce.css |
| Customer/order backend | hostinger/orders.ts, hostinger/admin-customers.ts, hostinger/customer-auth.ts, lib/commerce-*, lib/customer-identity.ts |
| Owner/provider backend | hostinger/auth.ts, otp-store.ts, google-auth.ts, google-identity.ts, telegram-auth.ts, telegram-identity.ts, telegram-history.ts, login-location.ts |
| Notifications | app/customer-notifications.*, lib/notification-*, hostinger/notifications.ts, scripts/run-notifications.mjs |
| Giveaway | app/giveaway.*, app/admin/giveaway/, lib/giveaway*, hostinger/giveaway.ts |
| APIs | app/api/admin/, app/api/customer/, app/api/giveaway/, app/api/internal/notifications/run/ |
| Catalog/storage/headers | lib/catalog*, lib/initial-catalog.ts, runtime/, hostinger/mysql.ts, hostinger/storage.ts, next.config.ts |
| Build/Sites | scripts/package-hostinger.mjs, scripts/run-framework.mjs, runtime/*.sites.ts, db/, drizzle/, .openai/hosting.json |
| Provenance | public/assets/PROVENANCE.md, public/assets/marks/SOURCES.md, data/IMPORT-SOURCES.md |

## 12. Validation and security boundaries

### Latest recorded verification

Runtime 6248c3f passed clean tracked-source **Node.js 24.22.3** install, strict ESLint **zero warnings**, standalone build/typecheck and **103 units**. Fresh disposable integrations passed **manual Admin orders, commerce, customer administration**. Earlier provider/notification/giveaway suites are separately documented; not every suite was rerun for every subsequent change.

Manual-order tests cover strict auth/origin/body/number validation, catalog conflicts/server snapshots, actual prices/public override rejection, concurrent/changed retries, owner history, encryption/redaction, guest preservation and create/delete races. Browser 1440/390/320 covers all entries, totals, historical approval, Telegram-only identity, unpriced offers, focus/layout and offline retry without duplicates. Mutation data was isolated/synthetic.

The original checkout contains untracked duplicate TypeScript and had stale dependencies. Whole-tree lint/typecheck can pick them up. Reviewed release used a clean tracked-source copy and lockfile install. Do not delete unrelated files or omit real source to manufacture a pass. Fresh clone is a straightforward cross-machine validation route.

Earlier Zod, eight High build/preview, fifteen Moderate, one lint error and seventeen warning fixes are complete. Last recorded full/production npm audits had **zero findings**; this is dated evidence, not a fresh advisory scan today. Hosting history includes a withdrawn esbuild advisory; distinguish active issues, ESLint and compatibility notices. Do not force unrelated upgrades or suppress genuine findings to clear a badge.

Preserve server-verified roles, strict same-origin writes, private no-store/noindex, secure HttpOnly cookies, owner-bound queries, bounded schemas/safe totals/rate limits, revisions, transactional idempotency, AES-GCM order/owner-bound fulfillment and redacted projections. Keep scoped Admin same-origin referrer policy and CSP/frame/nosniff/HSTS protections. This is not a claim of exhaustive penetration testing.

Physical Windows/iOS/Android were not exercised for latest runtime. Resized viewports do not prove mobile keyboard/Safari. Historical real sign-ins and mocked protocol checks do not establish new real provider delivery. **No fresh app tests/audit were rerun for this documentation-only handoff**; today's fresh verification is the 16 public reads in section3 and documentation checks.

### Local commands

With Node.js 24 active, from repo root:

~~~sh
git status --short --branch
git pull --ff-only
npm run install:ci
npm test
npm run lint -- --max-warnings=0
npm run build
npm run typecheck
~~~

Use separate development MySQL/private env per [Development setup](docs/DEVELOPMENT.md). On a new machine clone canonical repo, switch testing, pull/reinstall; never copy another OS's node_modules.

MySQL integration scripts require a **new empty loopback DB named digimium_test_***, dedicated test user, private test env and unused local port. Build first, run sequentially with distinct fresh DBs/intercepted providers, then remove only owned fixtures. Never use live DB/token.

| Script | Scope |
| --- | --- |
| test:hostinger | Owner auth/catalog/logo persistence/standalone restart |
| test:commerce | Account checkout/snapshots/ownership/approval/encryption |
| test:admin-customers | Customer edit/delete/revisions/cascades |
| test:admin-orders | Manual purchase/prices/retries/races |
| test:google | Mocked Google protocol/identity |
| test:telegram | Mocked Telegram login/history |
| test:telegram-identity | Explicit linking ownership |
| test:giveaway | Schedule/entry/visibility/migration |
| test:notifications | Buttons/reminders/outbox/timezone |
| test:integration | Separate running local **Sites** catalog/logo preview |

Previous task's isolated MariaDB, test envs, UI harness and clean validation copy were removed. UI/media tabs, test cookies and temporary metrics were cleared. Do not reuse old temp paths/session IDs or stop unrelated listeners (port 16163 was explicitly preserved).

## 13. Analytics, access and release operations

Store uses GTM **GTM-M7S62K8J**, GA4 **G-5LML9P3RE0**. The empty dashboard originally inspected was a different property; no duplicate tag/code fix was needed.

Correct recorded destination: account 416048711, property 563966155, stream 16327521135. [Correct report](https://analytics.google.com/analytics/web/#/a416048711p563966155/reports/intelligenthome). Both hosts share installation; filter hostname for production. Earlier authenticated check observed data flowing; no fresh GA session today. Private Account/History omit storefront tags. Automatic user-provided-data settings/private-overlay exclusions are an optional focused privacy review, not an established incident. Avoid test analytics pollution or blindly adding tags.

Next-chat minimum: repo plus this handoff/NOTES. Deployment/configuration requires owner hPanel session; real OTP diagnostics require Resend logs/inbox; dashboard work requires GA/GTM; backup requires authorized MySQL access. Credentials, browser sessions, service permissions and ignored files do not transfer with chat/Git. Do not assume an old session is authenticated or request secret values in chat when private UI can handle them.

For a future authorized code change:

1. Inspect/pull testing; read instructions and preserve unrelated work.
2. Implement and validate relevant clean-source tests and browser flows on disposable data.
3. Update NOTES, stage intended files, inspect for secrets, commit/push testing.
4. Observe actual testing deployment and bounded relevant checks.
5. Pull production, normally merge the verified testing revision and push; preserve storage/settings.
6. Observe Hostinger **Completed / Current** and intended runtime. Rollover can serve an old response briefly; use bounded no-cache checks and confirm normal paths too.
7. Leave testing synced; record real device/provider/hosted verification limits.

Rollback needs compatible reviewed code, complete separate DB backup and matching keys. Do not reset data/rotate secrets to resolve a code rollback. A Git push alone is not hosted success.

## 14. Runbooks, media and continuation prompt

Read: [AGENTS](AGENTS.md), this handoff, newest [NOTES](NOTES.md), [README](README.md), then relevant runbooks.

| Document | Use |
| --- | --- |
| [HOSTINGER](docs/HOSTINGER.md), [DEPLOYMENT](docs/DEPLOYMENT.md) | Runtime/env/backup/release/recovery |
| [DEVELOPMENT](docs/DEVELOPMENT.md), [ARCHITECTURE](docs/ARCHITECTURE.md) | Local setup/routes/data |
| [ADMIN](docs/ADMIN.md), [manual orders](docs/ADMIN-MANUAL-ORDERS-2026-11-16.md) | Owner workflows/latest feature |
| [LOGIN-PROVIDERS](docs/LOGIN-PROVIDERS.md) | Provider configuration/protocol/linking |
| [NOTIFICATIONS](docs/NOTIFICATIONS.md) | Messages/job/outbox/configuration |
| [GIVEAWAY-PAUSE-QA](docs/GIVEAWAY-PAUSE-QA.md) | Hidden store/OTP banner |
| [APPROVED-ORDER-DELETION](docs/APPROVED-ORDER-DELETION-2026-11-15.md) | Protected Admin delete |
| [STOREFRONT-SPACING](docs/STOREFRONT-SPACING-2026-11-15.md) | Four columns/eight preview/centering |
| [ORDER-NOTES-THEME-QA](docs/ORDER-NOTES-THEME-QA.md) | Notes/rejected/theme/notification/analytics history |
| docs/SECURITY-* and LINT-WARNINGS-FOLLOWUP-2026-11-15.md | Dated security/toolchain/lint evidence |
| docs/ux/ and UX-REVIEW-2026-11-15.md | Prior UX/screenshots; old circular gauges are superseded |

Shared media workspace (outside repo) retains **output/qa/admin-orders-2026-11-16/** and **output/handoff/website-2026-11-17/**. They do not travel in website Git. Runtime does not depend on temporary clipboard attachments or a previous chat.

GTA VI poster task is complete/separate: **output/social/gta-vi-official-posters-v1/** has two 1080-square official-art posts with original **digimium. / ဒီမှာဝယ် (D Mar Wal)** logos, captions and ZIP. No external scheduling/publication occurred. D Mar Wal source assets are in sibling **dmharwal-ဒီမှာဝယ်** media folder. Promo images use actual regular Manrope/Wa Lone and original/3D service marks. Do not reintroduce postponed giveaway in public launch art. The earlier Claude video prompt at docs/prompts/CLAUDE-WEBSITE-GIVEAWAY-VIDEO.md predates postponement and needs scope/date review. Media tasks are not unfinished website features.

Use [NEXT-CHAT-PROMPT](docs/NEXT-CHAT-PROMPT.md) with repository access, or attach this full document for context. The next chat should load it, report actual current branch/status and wait for the owner's next concrete website request. Older historical “next steps” must not restart completed work.
