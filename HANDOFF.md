# Digimium — project handoff

Updated: **2026-11-14** (Asia/Bangkok). This document is the starting point for continuing the existing website in another Codex/ChatGPT chat.

## 1. State at handoff

The current Best Seller / Promotion / Discount request is **implemented, pushed, and observed on both Hostinger sites**. Do not rebuild the website or replace its current catalog.

- Both branches received the original showcase in [4eee1ff — Highlight best sellers and rotate promotions on the landing page](https://github.com/LynnintheLab/digimium_website_final/commit/4eee1ff26854f4d0c091cc2bf545e1b930fde9c0). See [NOTES.md](NOTES.md) for subsequent releases and verification.
- Both live public catalog endpoints returned **54 products** after deployment, and both sites served the new showcase/badge assets.
- The admin sign-in page was reachable. A real inbox OTP, authenticated live admin save, and authenticated hPanel/Resend/Analytics inspection were **not** performed in the final release check.
- No live prices, publication flags, or Best Seller selections were invented or changed during verification.
- No new environment variable or SQL migration is required for this feature. Its optional fields are saved in existing catalog JSON.
- GitHub metadata was checked: the repository is currently **public**, with default branch `production`. Its visibility was not changed. The owner's usual preference is private repositories; review that separately before changing hosting integrations.
- The current task is complete. Remaining operational checks and owner choices are listed in section 9.

Older entries in [NOTES.md](NOTES.md) are history, including earlier sign-in configuration problems. Do not assume an old failure remains active without reproducing it.

## 2. Repository, sites, and service links

| Resource | Link / value |
| --- | --- |
| Canonical GitHub repository (currently public) | [LynnintheLab/digimium_website_final](https://github.com/LynnintheLab/digimium_website_final) |
| HTTPS clone remote | `https://github.com/LynnintheLab/digimium_website_final.git` |
| Production source | [production branch](https://github.com/LynnintheLab/digimium_website_final/tree/production) |
| Testing source | [testing branch](https://github.com/LynnintheLab/digimium_website_final/tree/testing) |
| Pending branch difference | [production...testing](https://github.com/LynnintheLab/digimium_website_final/compare/production...testing) |
| Issues | [Repository issues](https://github.com/LynnintheLab/digimium_website_final/issues) |
| Live storefront | [buywith-digimium.store](https://buywith-digimium.store) |
| Live admin | [Production admin](https://buywith-digimium.store/admin) |
| Live public catalog | [Production catalog JSON](https://buywith-digimium.store/api/catalog) |
| Staging storefront | [test.buywith-digimium.store](https://test.buywith-digimium.store) |
| Staging admin | [Testing admin](https://test.buywith-digimium.store/admin) |
| Staging public catalog | [Testing catalog JSON](https://test.buywith-digimium.store/api/catalog) |
| Hosting dashboard | [Hostinger hPanel](https://hpanel.hostinger.com/) |
| Recorded production deployment settings | [Production settings](https://hpanel.hostinger.com/websites/buywith-digimium.store/node/deployments/settings) |
| Recorded testing deployment settings | [Testing settings](https://hpanel.hostinger.com/websites/test.buywith-digimium.store/node/deployments/settings) |
| Email service | [Resend](https://resend.com/) · [API keys](https://resend.com/api-keys) · [Email logs](https://resend.com/emails) |
| Analytics | [Google Analytics](https://analytics.google.com/) · [Google Tag Manager](https://tagmanager.google.com/) |
| Earlier ChatGPT Sites storefront | [Legacy Site](https://digimium-minimal.aungnyeinchantun23.chatgpt.site) |
| Earlier ChatGPT Sites admin | [Legacy Site admin](https://digimium-minimal.aungnyeinchantun23.chatgpt.site/admin) |

The legacy Site was not reverified in this release. It is a separate deployment with separate account authorization and data. Hostinger dashboard links require the owning account and may redirect as hPanel navigation changes.

Other older website folders are reference copies, not alternative remotes for the current project. No additional Git repository is required to continue this website. The owner's separate `ai-config` repository stores global instructions/skills; it was not changed by this release.

## 3. Product scope and established design

Digimium sells access to digital subscriptions and services. The current flow is **browse → choose a published plan → Add to Cart or Check Out → Telegram order draft**. Customer browsing requires no login. Admin login is for the configured owner only.

Preserve these established choices:

- English and Myanmar storefront; language preference persists in a cookie.
- Self-hosted **Manrope** for English and **Wa Lone** for Myanmar.
- Persian Blue `#1F45B8`, Egyptian Blue `#123499`, Navy `#051650`, pale blue/lavender backgrounds, gradients, and colored logos.
- Sticky top navigation with translucent/blurred background.
- Two product cards per row at widths up to 700px; three above. Mobile dialogs scroll with reachable actions.
- Subtle blue cursor lighting outside cards; separate violet light clipped inside each card. Pointer/reduced-motion preferences are respected.
- Custom right-side scroll ruler; native page scrollbar hidden without disabling scrolling.
- Telegram blue and Viber purple contact rows with aligned icons/text.
- Original blue favicon restored at the owner's request.
- Server-rendered link-preview title, description, and the 1200 × 630 `public/assets/digimium-share.png`.
- The English brand wording “Digital. Premium. Make Simple.” stays English.
- Current Myanmar copy and red checkout guidance must be preserved. Unpriced selections have an extra admin-price-response sentence.
- Short descriptions can be hidden globally from public cards, dialogs, and public API output without deleting the saved admin text.

The landing page retains navigation, hero copy, catalog search/filtering, brand information, ordering guide, FAQ, and contacts. The rotating showcase changed; catalog category filters still exist.

Source authority: [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md), [storefront](app/storefront.tsx), [global styles](app/globals.css), and [responsive styles](app/storefront-order.css). Exact current copy and breakpoints come from source, not old screenshots.

## 4. Admin, plans, pricing, and the latest showcase

### Catalog management

The owner can create/edit products; set category, availability, publication, Featured and Best Seller; edit contact settings; hide all short descriptions; upload or reuse logos; and add, edit, publish, remove, or reorder plans.

Only published plans appear to customers. Plan arrows set saved order. The first published plan remains the default choice and the main card's displayed offer. Keep existing publication choices unless the owner changes them.

Logos support PNG, JPEG, or still WebP, up to 2 MiB and 4096 × 4096 pixels. Uploads return a reusable `/media/logos/...` path. Logo bytes are stored in MySQL, not in the deployment folder.

Limits: 100 products, 30 plans per product, and 768 KiB catalog save payload. Revision checks reject a stale concurrent save with HTTP 409 instead of overwriting another editor's work.

### Duration and gifts

The duration editor separates a positive whole-number quantity from a day/month/year selector. An optional gift quantity/unit produces values such as `3 months + 1 month free`.

The saved representation remains a duration string so existing records remain compatible. Existing custom wording is preserved until edited. Canonical durations support Myanmar display and promotion detection; arbitrary legacy wording can display normally without qualifying automatically for a Promotion slide.

### Discount prices

Products and plans can each have a regular price and an optional lower discounted MMK price. Valid discounts show the original price crossed out and the sale price. The selected plan's effective sale price is used in the cart, quantities, totals, and Telegram draft.

Regular MMK parsing accepts recognized MMK/Ks/ကျပ် amounts, including Myanmar digits. Sale input can omit the currency. Invalid discounts are rejected by admin validation. Percentage-based discount editing and date scheduling are not implemented.

### Best Seller

- The product checkbox adds a bright gold Best Seller badge with a filled star to the product card and dialog. Best Seller showcase slides use the same gold treatment.
- The plan checkbox gives that published option a pale gold gradient, amber border and Best Seller badge in the plan picker. A blue outline and checked radio identify the visitor's selected option.
- Card summary also names the first marked published plan in saved order, even if its price differs from the first/default plan.
- Product and plan flags are independent of one another and of Featured/publication.
- Best Seller is a manual owner designation; there is no sales-ranking calculation.
- Save changes publishes the draft. No flag was preselected merely to demonstrate the UI.

### Automatic landing showcase

Eligible records are published products with `available` or `on-request` status and their published plans. Hidden plans and unavailable products are excluded.

Offers are grouped and interleaved in this order:

1. **Best Seller** — each marked visible plan; or a marked product's first visible plan when no visible plan is marked.
2. **Promotion** — paid-plus-free duration from the canonical gift parser.
3. **Discount** — a valid sale amount below the regular price.

Every qualifying offer has its own slide and opens its exact plan. An offer can appear in multiple groups when it qualifies for each. Saved product and plan ordering is retained within each group. When published plans exist, their offer fields take precedence over service-level fields; service-level offers apply when no visible plan exists.

If **no promotion or discount qualifies**, the existing Think/Create/Unwind category collections follow any Best Seller slides. Empty categories are skipped. Everyday essentials is a fallback when needed. With no eligible products, no showcase is rendered.

With multiple slides, the showcase advances every **7 seconds**. Use the arrows, tap a short dash, or swipe left for the next slide and right for the previous slide on a phone. The longer, brighter dash marks the current slide. Hover, focus, touch contact and a background browser tab suspend rotation. Selecting the current dash or opening an offer holds the slide until the visitor navigates to another one.

Ten decorative service tiles float at staggered positions on the top, right, bottom and left edges. The interior watermark and text stay still. Visitors can pause and resume decorative motion and autoplay from the storefront footer. A hidden tab suspends both, and reduced motion displays the stationary artwork with manual slide navigation.

Refresh an open storefront to receive saved catalog edits. Promotions, best-seller flags and discounts remain active until the owner changes them.

## 5. Cart and Telegram order behavior

- Cart state lives in browser local storage under `digimium:shopping-cart:v1`, using product/plan IDs and quantities.
- Current public catalog data resolves prices; stale hidden/unavailable selections are removed on restoration.
- Add to Cart increments an existing selection and lets the visitor continue browsing.
- Check Out combines the current selection with the existing cart without duplicating that selection.
- Checkout captures the full order, clears the saved cart immediately, attempts clipboard copy, and opens the store's Telegram DM with a prefilled draft.
- The handoff screen retains the captured order for copying or reopening after the cart has cleared.
- Spaces use URL-safe encoding; long orders are divided into numbered parts.
- Unknown prices remain enquiries. A mixed-price order requests confirmation instead of presenting a misleading complete total.
- **The customer must press Send in Telegram.** The application does not send a message automatically.

Not implemented: online payment collection, order database/history, customer accounts, fulfillment automation, or stock integration. The owner expressed interest in a later online-checkout upgrade; it is a future phase requiring a separate design and implementation.

## 6. Runtime, data, authentication, and environment

### Stack and build

The default deployment is Next.js App Router **16.3.4**, React **19.2.6**, TypeScript, and MySQL via `mysql2`. Node.js **24** is the verified runtime. Versions are recorded in `package.json` and locked in `package-lock.json`.

`npm run build` runs a webpack Next build and `scripts/package-hostinger.mjs`. The script copies public assets and `.next/static` into `.next/standalone` and strips copied environment files. `npm start` runs `.next/standalone/server.js`.

Hostinger uses repository root `.`, Next.js, npm, Node 24, and `npm run build`. Keep the existing working Next.js preset. For an explicit standalone output/entry configuration, use `.next/standalone` and `server.js`. Full deployment instructions: [docs/HOSTINGER.md](docs/HOSTINGER.md).

### Data authority and backups

| Data | Authority / storage |
| --- | --- |
| Application source, built-in images/fonts, seed JSON | GitHub repository |
| Current product edits, prices, visibility, flags, contacts | Each site's MySQL catalog snapshot |
| Uploaded logo bytes | Each site's MySQL logo table |
| Environment values | Each Hostinger application's private settings |
| Pending OTPs and remembered admin sessions | MySQL and browser cookies |
| Customer cart | That visitor's browser local storage |
| Legacy Sites catalog/logos | Separate D1/R2 resources |

The seed combines `data/catalog.json` and `data/import-catalog.json`: **54 products, 104 plans, 50 originally published plans**. These are seed counts, not a promise about current live plan counts. The owner has edited live data since import.

An initialized empty database uses the seed. After an admin save, the database snapshot is authoritative. A database failure returns an error; it must not trigger destructive reseeding. A Git clone/push does not copy live edits, uploaded logos, secrets, sessions, or carts. Back up the complete MySQL database separately; a fresh production backup was not made during this handoff.

Six tables in [hostinger/schema.sql](hostinger/schema.sql):

- `digimium_catalog`: one `main` JSON snapshot with revision and timestamp.
- `digimium_logos`: uploaded image bytes.
- `digimium_admin_sessions`: remembered admin sessions.
- `digimium_otp_challenges`: pending hashed codes.
- `digimium_otp_send_limit`: code-send limits.
- `digimium_login_limits`: retained from password login; no active caller.

The schema uses `CREATE TABLE IF NOT EXISTS` and preserves existing rows when reimported. Best Seller and discount fields are inside catalog JSON. Older strict schemas from before the Best Seller release may reject records containing its new keys; review compatibility before rolling back code.

### Owner OTP login

Resend delivers a six-digit code to the single configured `ADMIN_EMAIL`. Codes expire after 10 minutes, allow five verification attempts, and are bound to the requesting browser. Sending is limited to once per minute and five times per hour for the application database.

A verified browser gets a server-side session and HttpOnly cookie for up to **180 days**. A different browser/device, cleared cookies, session expiry, or sign-out requires login again. It is not an indefinite account login.

Changing `ADMIN_AUTH_SECRET`, `ADMIN_EMAIL`, or `APP_ORIGIN` invalidates the hashes used for existing sessions/codes. Preserve the secret across routine redeploys. Catalog contact email and admin login email are different settings. Old `ADMIN_PASSWORD` is obsolete in this runtime.

### Required environment keys

Templates: [hostinger/.env.example](hostinger/.env.example) for Hostinger, and [.env.example](.env.example) for all targets. Never commit a completed file.

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Exact app origin: production or testing HTTPS URL |
| `ADMIN_EMAIL` | Owner inbox for OTP |
| `ADMIN_AUTH_SECRET` | Stable random secret, at least 32 characters |
| `RESEND_API_KEY` | Resend sending credential |
| `RESEND_FROM_EMAIL` | Permitted sender |
| `DB_HOST` | Database hostname; template uses `127.0.0.1` |
| `DB_PORT` | Template uses `3306` |
| `DB_NAME` | Full app-specific database name |
| `DB_USER` | Full database username |
| `DB_PASSWORD` | Database user's password |

Use each app's full prefixed database name and username from its current hPanel configuration. Active hPanel values were not inspected again. Keep staging and production databases separate.

The owner requested Resend's built-in sender `onboarding@resend.dev`. It sends only to the email associated with that Resend account. A different recipient requires a verified sending domain. [Resend's sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)

When importing `.env` in hPanel, existing matching values may be kept; review entries rather than assuming every old value was overwritten. Environment changes need the app's apply/restart/redeploy flow. [Hostinger environment import](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)

The retained Sites target uses `ADMIN_EMAILS`, D1 binding `DB`, R2 binding `BUCKET`, and `.openai/hosting.json`. Preserve its existing project identity. Account switching does not transfer its ownership.

### Analytics

Storefront source includes GTM container **GTM-M7S62K8J**. The recorded GA4 stream is **G-5LML9P3RE0**. Both Hostinger domains share the installation; use a hostname filter for production reporting. Authenticated Analytics/Tag Manager configuration and current delivery were not inspected in this handoff.

## 7. File map

| File or directory | What the next chat should use it for |
| --- | --- |
| [AGENTS.md](AGENTS.md), [NOTES.md](NOTES.md), [README.md](README.md), [HANDOFF.md](HANDOFF.md) | Instructions, current status, onboarding, continuation |
| [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) | Product scope and established visual choices |
| [docs/ADMIN.md](docs/ADMIN.md) | Owner workflows: plans, gifts, discounts, Best Seller, logo paths |
| [docs/HOSTINGER.md](docs/HOSTINGER.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting, release, backups/recovery |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Local setup, test prerequisites, routes and data model |
| [app/page.tsx](app/page.tsx), [app/layout.tsx](app/layout.tsx) | Server catalog entry, metadata, app shell |
| [app/storefront.tsx](app/storefront.tsx), [app/storefront-order.css](app/storefront-order.css) | Browse/filter/search, bilingual copy, responsive cards |
| [app/globals.css](app/globals.css), [app/cursor-light.tsx](app/cursor-light.tsx), [app/scroll-rail.tsx](app/scroll-rail.tsx) | Brand system, cursor glow, scroll ruler |
| [app/collection-showcase.tsx](app/collection-showcase.tsx), [app/collection-showcase.css](app/collection-showcase.css), [lib/showcase.ts](lib/showcase.ts) | New offer carousel and selection rules |
| [app/best-seller-badge.tsx](app/best-seller-badge.tsx), [app/product-mark.tsx](app/product-mark.tsx) | Shared label and logo rendering |
| [app/shop-order.tsx](app/shop-order.tsx), [lib/cart-order.ts](lib/cart-order.ts) | Plan picker, cart, totals, Telegram handoff |
| [app/offer-price.tsx](app/offer-price.tsx), [lib/pricing.ts](lib/pricing.ts), [lib/duration.ts](lib/duration.ts), [lib/shop-language.ts](lib/shop-language.ts) | Sale prices, paid/gift periods, localization |
| [app/admin/admin-catalog.tsx](app/admin/admin-catalog.tsx), [app/admin/plan-editor.tsx](app/admin/plan-editor.tsx) | Product and plan editing, ordering, publication and flags |
| [app/admin/duration-field.tsx](app/admin/duration-field.tsx), [app/admin/price-field.tsx](app/admin/price-field.tsx), [app/admin/logo-editor.tsx](app/admin/logo-editor.tsx) | Duration/gift, prices, uploads |
| [lib/catalog.ts](lib/catalog.ts), [lib/catalog-validation.ts](lib/catalog-validation.ts), [lib/catalog-store.ts](lib/catalog-store.ts), [lib/initial-catalog.ts](lib/initial-catalog.ts) | Types, payload validation, concurrency, public filtering, seed |
| [app/api/catalog/route.ts](app/api/catalog/route.ts), [app/api/admin/catalog/route.ts](app/api/admin/catalog/route.ts) | Public read and authenticated read/save |
| [app/api/admin/logos/route.ts](app/api/admin/logos/route.ts), [lib/logo-storage.ts](lib/logo-storage.ts), [lib/logo-path.ts](lib/logo-path.ts) | Upload validation and durable paths |
| `app/media/logos/[file]/route.ts` | Uploaded image delivery |
| [hostinger/auth.ts](hostinger/auth.ts), [hostinger/otp-store.ts](hostinger/otp-store.ts) | Owner login, code limits, remembered sessions |
| [hostinger/mysql.ts](hostinger/mysql.ts), [hostinger/storage.ts](hostinger/storage.ts), [hostinger/schema.sql](hostinger/schema.sql) | Database connection, persistent catalog/logos, tables |
| [runtime/auth.sites.ts](runtime/auth.sites.ts), [runtime/storage.sites.ts](runtime/storage.sites.ts), [db/schema.ts](db/schema.ts), `drizzle/` | Legacy Sites adapters and migrations |
| [data/IMPORT-SOURCES.md](data/IMPORT-SOURCES.md), [data/catalog.json](data/catalog.json), [data/import-catalog.json](data/import-catalog.json) | Seed provenance and price-conflict history |
| `public/assets/`, `public/assets/fonts/`, `public/assets/marks/` | Logo, share image, self-hosted fonts, service marks |
| [public/assets/PROVENANCE.md](public/assets/PROVENANCE.md), [public/assets/marks/SOURCES.md](public/assets/marks/SOURCES.md) | Asset and font sources |
| [package.json](package.json), [package-lock.json](package-lock.json), [next.config.ts](next.config.ts), [tsconfig.json](tsconfig.json), [scripts/package-hostinger.mjs](scripts/package-hostinger.mjs) | Reproducible dependencies, build and runtime aliases |
| [tests/showcase.test.mjs](tests/showcase.test.mjs), [tests/cart-order.test.mjs](tests/cart-order.test.mjs), [tests/shop-language.test.mjs](tests/shop-language.test.mjs), [tests/hostinger.integration.mjs](tests/hostinger.integration.mjs) | Current behavior and persistence/auth regression checks |

## 8. Verification evidence and boundaries

Checks completed for the original showcase release (`4eee1ff`) included the following.

- Node 24 standalone production build.
- TypeScript check.
- All **14 unit tests**.
- Expanded Hostinger integration suite on a **disposable local MariaDB database**: auth, same-origin protections, concurrency, catalog persistence, logo bytes, plan filtering, independent Best Seller flags and removal.
- Local Chromium desktop and **320px/390px English/Myanmar** checks: admin checkbox save/reload, hidden/unfeatured combinations, default selection, automatic rotation, pause, reduced motion, exact gift/discount plan selection, category fallback, dialog focus, and no horizontal overflow/runtime errors.
- Post-push HTTPS checks for both real storefronts, catalogs and new asset signatures.

The local Resend delivery was simulated by the integration fixture. No live email or customer Telegram message was sent. Physical iPhone/Android behavior of this exact release and actual inbox delivery remain separate checks. Earlier NOTES entries include additional WebKit/viewport checks for older changes.

Temporary local servers/database were stopped after verification. Test fixture rows were never put into the production catalog.

## 9. Next steps and release workflow

### Immediate owner actions

1. On production admin, mark the actual desired products/plans as Best Seller and save.
2. Set gift periods or sale prices only on real current offers. Refresh the storefront to see the carousel.
3. Check a real phone's Telegram handoff and shared-link preview. Verify the intended recipient and complete order text before sending.
4. If needed, confirm live OTP receipt and remembered login using the owner's inbox/browser.
5. Check Google Analytics Realtime for the production hostname.
6. Keep a separate MySQL backup that includes both catalog and uploaded logos.

No further coding is required to activate the current controls. There is no pending automatic payment integration. Later checkout/payment work should be scoped with the owner before implementation.

### Start the next development session

Use the existing checkout named `digimium-website` inside the branding workspace, or clone the same repository on another machine:

```sh
gh repo clone LynnintheLab/digimium_website_final
cd digimium_website_final
git switch testing
git pull --ff-only
npm run install:ci
```

On an existing checkout, inspect `git status`, pull before editing, and preserve unrelated files. Configure a dedicated local MySQL database and git-ignored environment file following [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Do not point mutation tests at the live database.

```sh
npm run dev -- --hostname 127.0.0.1 --port 3000
npm test
npm run typecheck
npm run build
```

The MySQL integration suite needs its own fresh disposable database and the documented test environment. It is not a zero-configuration command.

After authorized changes are ready:

1. Update NOTES with current status, last work, and next steps.
2. Stage only the intended files; inspect the staged diff for credentials/unrelated changes.
3. Commit/push `testing`; check its deployment and relevant behavior.
4. Pull `production`, merge the verified testing revision normally, then push. Do not force-push.
5. Confirm the Hostinger deployment and public behavior; distinguish a Git push from an observed successful deployment.
6. Leave the checkout on `testing` for continued work.

The current Mac checkout contains unrelated **untracked iCloud duplicate files with “ 2” in their names**. They were intentionally excluded from commits. Do not use a blind `git add -A`. A duplicate login file was preserved in ignored `work/icloud-copies/`. Generated `.next/types` duplicates were cleared before the verified rebuild; do not commit generated build files.

### If admin sign-in becomes unavailable

Check the exact app origin, all current environment keys, the selected MySQL database and OTP tables, then Hostinger runtime logs and Resend delivery logs. Apply/restart after config changes. Do not diagnose every failure as a missing table or overwrite a current secret with a fresh one. Use [the Hostinger troubleshooting table](docs/HOSTINGER.md#if-setup-stalls).

## 10. Files and account access to carry to the next chat

### Minimum for code changes

Give the next chat access to the **current repository folder or GitHub repository**, plus this handoff and NOTES. The repo already contains the necessary source, built-in logos/fonts, seed data, docs and tests. Old screenshots and every previous chat are not required to continue ordinary development.

The current session has used local source access, GitHub Git push access, disposable local test databases/browsers, and public HTTPS reads. This does **not** establish authenticated access to Hostinger, Resend, Analytics, an inbox, or another account's hosted Site.

For deployment/configuration work, separately provide the relevant Hostinger account/session and private environment values. For live-data backup, use that site's MySQL access. Resend account access and owner inbox interaction are needed when diagnosing real OTP delivery. GA/GTM access is needed for dashboard work. Chat access alone does not grant these service permissions.

### Private handoff inventory

The owner was given a separate local access inventory for relevant Downloads environment/schema files, original source folders, and related chat titles/IDs. That inventory is outside Git. Those file contents and account sessions do not transfer through a repository clone or a chat-account switch.

The main website chat plus this repository handoff is enough for ordinary development. Earlier bot/store/interactive-design chats are optional references for their separate projects. The source provenance needed for catalog work is already in [data/IMPORT-SOURCES.md](data/IMPORT-SOURCES.md).

Do not assume that a remembered environment filename is current or that an old SQL file is a complete backup. Use the deployed settings and a verified backup. Original clipboard screenshots are temporary and are not project dependencies.

## 11. Paste-ready continuation brief

> Continue the existing Digimium website. Read HANDOFF.md, NOTES.md, AGENTS.md, README.md, and docs/HOSTINGER.md first. Use the repo LynnintheLab/digimium_website_final, working branch testing; production serves buywith-digimium.store and testing serves test.buywith-digimium.store. Pull before edits. Release 4eee1ff already implements independent product/plan Best Seller flags, gifts and discounted prices, and an automatic seven-second showcase with category fallback. Both sites were checked after deployment. Preserve the established design, bilingual copy, current plan visibility/prices, original favicon, and Telegram draft checkout behavior. Live catalog edits and uploaded logos belong to each MySQL database, not the Git seed. Never reset live data or commit secrets. Read the stated verification limits before claiming live OTP/device checks. At session end update NOTES, commit intended files, and push; exclude unrelated iCloud “ 2” duplicates. Ask the owner for the next requested change rather than rebuilding completed work.
