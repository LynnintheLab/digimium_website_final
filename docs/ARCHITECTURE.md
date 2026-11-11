# Architecture

## Runtime

The React 19 and TypeScript storefront uses the Next.js App Router. The default build creates a standalone Next.js Node server for Hostinger. The `@digimium/storage` adapter reads and writes catalog snapshots and uploaded logo bytes in MySQL. Admin sessions use the same database. [Hostinger setup](HOSTINGER.md)

The retained Vinext/Vite target builds a Cloudflare Worker for Sites. Its storage adapter uses Drizzle/D1 for catalog snapshots and R2 for images. The Sites Vite integration copies the hosting metadata and migrations into its build output.

`.openai/hosting.json` identifies the current Site and declares `DB` and `BUCKET`. Preserve the project ID for updates. A GitHub fork or account switch does not transfer a hosted Site.

## Main files

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Server catalog load and language cookie. |
| `app/storefront.tsx` | Browse/search/filter UI, navigation, language, and cart entry point. |
| `app/storefront-order.css` | Storefront ordering controls and mobile refinements. |
| `app/shop-order.tsx` / `app/shop-order.css` | Plan picker, cart, checkout sheet, and Telegram handoff. |
| `app/cursor-light.tsx` / `app/globals.css` | Brand styling, fonts, gradients, lighting, focus, and reduced motion. |
| `app/admin/` | Catalog, plan, and logo editors with responsive admin UI. |
| `lib/catalog-store.ts` | Snapshots, public filtering, and optimistic concurrency. |
| `lib/catalog-validation.ts` | Input schemas and limits. |
| `lib/initial-catalog.ts` | Merge original catalog with imported plans/services. |
| `lib/cart-order.ts` | Cart validation, deduplication, totals, message splitting, and Telegram links. |
| `lib/shop-language.ts` | Bilingual product, plan, duration, and price presentation. |
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

A catalog has `revision`, `updatedAt`, `products`, and `settings`. Products have stable IDs, display fields, category, optional logo path/plans, availability, feature state, and publication state. Plan IDs are unique per product. Settings include contacts and optional `hideShortDescriptions`.

The MySQL `digimium_catalog` table or D1 `catalog_snapshots` table has one row with ID `main`, a JSON payload, positive revision, and timestamp. Saving is atomic: revision zero inserts only if no row exists; later saves update only the revision loaded by that editor. Concurrent saves cannot silently overwrite each other.

The seed starts from `data/catalog.json`. Matching imported products contribute plans; new imported products are appended from `data/import-catalog.json`. A fresh combined seed contains 54 products and 104 plans. After an admin save, the snapshot in the deployed database is authoritative. Storage failure returns an error instead of replacing user data with the seed.

Public reads omit unpublished products/plans. With the description setting enabled, public descriptions are cleared while admin retains the saved text.

## Cart and checkout

`digimium:shopping-cart:v1` in browser local storage holds product/plan references and quantities, not trusted price snapshots. Restoration resolves against the current public catalog and removes hidden, unavailable, invalid, or missing entries.

**Add to cart** increments an existing selection. **Checkout** includes the current selection without duplicating an already-present line. Known MMK amounts can be totaled; unknown prices require confirmation. Order text includes product, plan, duration, price, and quantity.

Checkout captures the full order, empties the saved browser cart, opens a Telegram DM draft and attempts to copy the captured text. The handoff screen can reopen or copy the same order after the cart clears. Long messages are split into numbered parts. The customer sends the message. There is no server-side order history or payment collection.

## Authorization

On the Hostinger testing build, Resend delivers one-time codes only to the configured owner email. The server binds a code to the browser that requested it and consumes it once. A successful verification creates a server-side session and a persistent HttpOnly cookie for that browser profile, valid for up to 180 days. The app uses server-verified sessions for both admin pages and protected APIs. Customer browsing requires no sign-in.

On Sites, hosted identity comes from the Sites platform. Admin access requires an email in server-side `ADMIN_EMAILS`; an empty allowlist grants nobody access. Mutations also require same-origin requests. Local dev strips client-supplied identity headers and permits its mock identity only on loopback.

Do not expose the Worker behind an untrusted proxy that accepts forged identity headers.

## Assets and portability

Built-in marks and fonts travel with Git. Font CSS prefers WOFF2 and retains TTF fallbacks. English uses Manrope; Myanmar uses Wa Lone. Runtime images use the same `/media/logos/...` route on both hosts. Hostinger serves binary data from `digimium_logos` in MySQL. Sites serves objects from the R2 `logos/` prefix.

Project paths are relative. Dependencies, builds, local storage, and secrets are ignored. Git synchronizes implementation and seed data, not customer carts, live catalog edits, or uploaded runtime images.
