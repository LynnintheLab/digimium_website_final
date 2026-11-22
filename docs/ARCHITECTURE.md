# Architecture

## Runtime

The React 19 and TypeScript storefront uses the Next.js App Router. The default build creates a standalone Next.js Node server for Hostinger. The `runtime/storage.ts` adapter reads and writes catalog snapshots and uploaded logo bytes in MySQL. Admin sessions use the same database. [Hostinger setup](HOSTINGER.md)

The retained Vinext/Vite target builds a Cloudflare Worker for Sites. Its storage adapter uses Drizzle/D1 for catalog snapshots and R2 for images. The Sites Vite integration copies the hosting metadata and migrations into its build output.

`.openai/hosting.json` identifies the current Site and declares `DB` and `BUCKET`. Preserve the project ID for updates. A GitHub fork or account switch does not transfer a hosted Site.

## Main files

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Server catalog load and language cookie. |
| `app/storefront.tsx` | Browse/search/filter UI, navigation, language, and cart entry point. |
| `app/mobile-dock.tsx` / `app/mobile-dock.css` | Shared floating mobile navigation with a raised center Account entry and cart count. |
| `app/account-menu.tsx` / `app/account-menu.css` | Inline storefront account panel, including the imperative mobile dock entry and focus restoration. |
| `app/payment-methods.tsx` / `app/payment-methods.css` | Shared informational strip with five verified local payment logos. |
| `app/account/account.tsx` | Read-only inline account overview with two recent purchased-plan previews and two pending rows; full profile/settings page; full Approved/Pending/Rejected history filters. |
| `app/account/subscription-term.tsx` / `app/account/subscription-term.css` | Segmented semicircle remaining-day gauges, status and calendar dates in compact and full views. |
| `app/collection-showcase.tsx` / `app/collection-showcase.css` | Rotating offers and category collections, swipe and arrow navigation, position indicators, and reduced-motion handling. |
| `lib/showcase.ts` | Published offer selection, best-seller/promotion/discount grouping, and category fallback. |
| `app/best-seller-badge.tsx` / `app/product-mark.tsx` | Shared best-seller label and product logo rendering. |
| `app/storefront-order.css` | Storefront ordering controls and mobile refinements. |
| `app/shop-order.tsx` / `app/shop-order.css` | Plan picker, cart, checkout sheet, and Telegram handoff. |
| `app/cursor-light.tsx` / `app/globals.css` | Brand styling, fonts, gradients, lighting, focus, and reduced motion. |
| `app/admin/` | Catalog, plan, and logo editors with responsive admin UI. |
| `lib/catalog-store.ts` | Snapshots, public filtering, and optimistic concurrency. |
| `lib/catalog-validation.ts` | Input schemas and limits. |
| `lib/initial-catalog.ts` | Merge original catalog with imported plans/services. |
| `lib/cart-order.ts` | Cart validation, deduplication, totals, message splitting, and Telegram links. |
| `lib/order-receipt.ts` | Bounded tab-local receipt validation, expiry and customer/contact ownership checks. |
| `lib/shop-language.ts` | Bilingual product, plan, duration, and price presentation. |
| `lib/duration.ts` / `lib/pricing.ts` | Paid/gift duration parsing and validated regular/sale MMK price calculations. |
| `app/offer-price.tsx` | Consistent regular and discounted price presentation. |
| `lib/admin-auth*.ts` | Platform-specific admin authorization and same-origin mutations. |
| `hostinger/` | MySQL connections, catalog and logo storage, admin sessions, and database schema. |
| `runtime/` | Sites adapters for D1/R2 storage and ChatGPT authentication. |
| `lib/logo-storage.ts` | Image container and dimension validation, path management and platform storage calls. |
| `db/schema.ts` / `drizzle/` | Sites D1 schema and migration history. |
| `public/assets/` | Committed brand marks, service images, and self-hosted fonts. |
| `tests/` | Unit tests and localhost-only integration checks. |

## Routes

| Method / route | Behavior |
| --- | --- |
| `GET /` | Server-rendered storefront with public content only. |
| `GET /admin` | Admin authorization, otherwise sign-in/unauthorized redirect. |
| `GET /api/catalog` | Published catalog data for customers. |
| `GET /api/admin/catalog` | Authorized complete catalog, including hidden records. |
| `PUT /api/admin/catalog` | Same-origin admin save with expected revision and validated payload. |
| `POST /api/admin/logos` | Same-origin authorized PNG/JPEG/WebP binary upload. |
| `GET /media/logos/[file]` | Image with content type, ETag, caching, and `nosniff`. |
| `GET /admin/login`, `POST /admin/session`, `POST /admin/logout` | Hostinger admin sign-in and sign-out. |
| `/signin-with-chatgpt` / `/signout-with-chatgpt` | Sites identity routes with a loopback-only local mock. |

## Catalog model and authority

A catalog has `revision`, `updatedAt`, `products`, and `settings`. Products have stable IDs, display fields, category, optional logo path/plans, availability, feature state, and publication state. Products and plans both support an optional `discountPrice` and an independent optional `bestSeller` boolean. Duration remains a string; the admin quantity/unit controls serialize paid and optional gift periods into that string. Plan IDs are unique per product. Settings include contacts and optional `hideShortDescriptions`.

Best-seller labels are manually assigned, independently of `featured` and `published`. The showcase uses published offers with available/on-request status. Published plans supply the offers when present; product-level offers apply when no published plan exists. Gift promotion detection uses the canonical duration parser. Valid lower sale prices qualify for Discount slides. When no gifts or discounts qualify, category collections follow any Best Seller slides. These fields are stored in the catalog JSON and require no additional SQL columns.

The MySQL `digimium_catalog` table or D1 `catalog_snapshots` table has one row with ID `main`, a JSON payload, positive revision, and timestamp. Saving is atomic: revision zero inserts only if no row exists; later saves update only the revision loaded by that editor. Concurrent saves cannot silently overwrite each other.

The seed starts from `data/catalog.json`. Matching imported products contribute plans; new imported products are appended from `data/import-catalog.json`. A fresh combined seed contains 54 products and 104 plans. After an admin save, the snapshot in the deployed database is authoritative. Storage failure returns an error instead of replacing user data with the seed.

Public reads omit unpublished products/plans. With the description setting enabled, public descriptions are cleared while admin retains the saved text.

## Cart and checkout

`digimium:shopping-cart:v1` in browser local storage holds product/plan references and quantities, not trusted price snapshots. Restoration resolves against the current public catalog and removes hidden, unavailable, invalid, or missing entries.

**Add to cart** increments an existing selection. **Buy / ဝယ်ယူမည်** includes the current selection in checkout without duplicating an already-present line. Known MMK amounts can be totaled; unknown prices require confirmation. Order text includes product, plan, duration, price, and quantity.

Signed-out Hostinger checkout offers account registration/sign-in or **Buy on Telegram / Telegram မှဝယ်မည်**. The Account form runs in the same dialog and returns to the cart for review. Signed-in checkout continues in a separate `/checkout` document without the storefront’s analytics tags. Telegram-only checkout uses an explicit guest mode with no name or email. A signed HttpOnly guest cookie, hashed guest identity and request key make guest retries idempotent. Guest records remain visible only to Admin.

Guest checkout saves a pending order snapshot before opening the store’s Telegram DM. The customer sends the draft and arranges payment and service delivery in Telegram. The website keeps an order receipt with Telegram and copy fallbacks for 24 hours in `sessionStorage` under `digimium:last-order-receipt:v1`. Previously saved account receipts remain bound to the original signed-in customer. Receipt recovery requires an explicit action.

Website checkout derives amounts and required fields from the reviewed catalog revision. Plan-specific fields replace product defaults when configured. Each unit can carry separate input values. The order stores the field labels with the submitted values in an encrypted envelope bound to the owning customer and order. Exact retries recover one order using a keyed request digest. Reload recovery stores the request ID, customer ID and cart references in session storage. The form keeps submitted credentials in memory until it receives an acknowledgement.

Website orders move through quote when needed, payment selection, proof review, payment rejection or fulfillment, and completion. Selection snapshots the receiver and amount using the saved method and Binance rate. Screenshots are bounded PNG/JPEG/WebP uploads stored as encrypted private order attachments. The owning customer and Admin can view them. Payment decisions and fulfillment require the reviewed order revision. Admin verifies the transfer before approving it and enters subscription dates and optional delivery credentials to complete the order. Legacy purchases retain their original checkout and approval behavior.

Customer history contains only the signed-in customer’s orders. The inline Account preview shows two recent purchased plans and two pending rows. Its gear opens `/account` for profile and settings. Full `/order-history` has Approved, Pending and Rejected filters. Pending website orders show progress and payment controls. Pending legacy account orders can reopen their Telegram draft. Delivered account details appear in approved history, alongside segmented remaining-day gauges and dates based on the Myanmar calendar. The end date is labeled Ends today and expiry begins the next day. Guest order dates stay in the Admin record. The legacy Sites deployment opens its Telegram draft from the cart.

Admin-only `POST /api/admin/commerce` records an earlier purchase for a selected existing account. Strict JSON includes a customer UUID, stable request UUID, expected saved-catalog revision, catalog product/plan references, quantities and optional whole-MMK unit-price overrides. The server locks the parent customer before reading its request key, locks the saved catalog revision, resolves trusted product/plan names and durations, and checks safe totals. A namespaced payload hash makes exact retries return the original order while changed payloads conflict. The endpoint creates only a pending order; existing approval provides dates and encrypted fulfillment. It never reassigns guest ownership, matches email, depends on a Telegram contact or enqueues a checkout alert.

At mobile widths, a floating five-target dock provides Products, Cart with count, raised center Account, History and Help. Account opens the inline panel. Standalone pages link back through `/?account=1` or `/?checkout=1`, which the storefront consumes and removes. The dock yields to menus, account/order overlays and the keyboard. Website checkout displays KPay, AYA Pay, Wave Pay and Binance Pay according to saved availability. The public catalog includes enabled method IDs. The receiver details are supplied with the signed-in customer’s selected order.

## Authorization

On Hostinger, Resend delivers one-time codes only to the configured owner email. The server binds a code to the browser that requested it and consumes it once. A successful verification creates a server-side session and a persistent HttpOnly cookie for that browser profile, valid for up to 180 days. The app uses server-verified sessions for both admin pages and protected APIs. Customer browsing requires no sign-in.

Customer Google and Telegram identities remain separate unless explicitly linked by a supported flow. An existing Google/email customer can choose Connect Telegram in full Account settings. Its code challenge is bound to that exact signed-in customer session; identity conflicts are rejected without merging accounts or transferring orders. After linking, Telegram bot history uses the same customer mapped to the verified Telegram sender ID. It does not claim guest orders or match purchases by email. See [Telegram connection behavior](LOGIN-PROVIDERS.md#connect-telegram-to-an-existing-account).

On Sites, hosted identity comes from the Sites platform. Admin access requires an email in server-side `ADMIN_EMAILS`; an empty allowlist grants nobody access. Mutations also require same-origin requests. Local dev strips client-supplied identity headers and permits its mock identity only on loopback.

Do not expose the Worker behind an untrusted proxy that accepts forged identity headers.

## Assets and portability

Built-in marks and fonts travel with Git. Font CSS prefers WOFF2 and retains TTF fallbacks. English uses Manrope; Myanmar uses Wa Lone. Runtime images use the same `/media/logos/...` route on both hosts. Hostinger serves binary data from `digimium_logos` in MySQL. Sites serves objects from the R2 `logos/` prefix.

Project paths are relative. Dependencies, builds, local storage, and secrets are ignored. Git synchronizes implementation and seed data, not customer carts, live catalog edits, or uploaded runtime images.
