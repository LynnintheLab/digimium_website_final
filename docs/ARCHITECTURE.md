# Architecture

## Runtime

React 19 and TypeScript use the Next-style App Router through Vinext/Vite. Production emits a Cloudflare Worker and client assets. Drizzle accesses D1; uploaded product images use R2. The Sites Vite integration copies hosting metadata and migrations into the deployment output.

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
| `lib/admin-auth*.ts` / `app/chatgpt-auth.ts` | Trusted identity, allowlist checks, and same-origin mutations. |
| `lib/logo-storage.ts` | Image container/dimension validation and R2 operations. |
| `db/schema.ts` / `drizzle/` | Database schema and migration history. |
| `public/assets/` | Committed brand marks, service images, and self-hosted fonts. |
| `tests/` | Unit tests and localhost-only integration checks. |

## Routes

| Method / route | Behavior |
| --- | --- |
| `GET /` | Server-rendered storefront with public content only. |
| `GET /admin` | Admin authorization, otherwise sign-in/unauthorized redirect. |
| `GET /api/catalog` | Public catalog projection, subject to Site visitor access. |
| `GET /api/admin/catalog` | Authorized complete catalog, including hidden records. |
| `PUT /api/admin/catalog` | Same-origin admin save with expected revision and validated payload. |
| `POST /api/admin/logos` | Same-origin authorized PNG/JPEG/WebP binary upload. |
| `GET /media/logos/[file]` | Image with content type, ETag, caching, and `nosniff`. |
| `/signin-with-chatgpt` / `/signout-with-chatgpt` | Hosted auth; loopback-only mock in development. |

## Catalog model and authority

A catalog has `revision`, `updatedAt`, `products`, and `settings`. Products have stable IDs, display fields, category, optional logo path/plans, availability, feature state, and publication state. Plan IDs are unique per product. Settings include contacts and optional `hideShortDescriptions`.

D1's `catalog_snapshots` table has one row with ID `main`, a JSON payload, positive revision, and timestamp. Saving is atomic: revision zero inserts only if no row exists; later saves update only the revision loaded by that editor. Concurrent saves cannot silently overwrite each other.

The seed starts from `data/catalog.json`. Matching imported products contribute plans; new imported products are appended from `data/import-catalog.json`. A fresh combined seed contains 54 products and 104 plans. After an admin save, D1 is authoritative. Storage failure returns an error instead of replacing user data with the seed.

Public reads omit unpublished products/plans. With the description setting enabled, public descriptions are cleared while admin retains the saved text.

## Cart and checkout

`digimium:shopping-cart:v1` in browser local storage holds product/plan references and quantities, not trusted price snapshots. Restoration resolves against the current public catalog and removes hidden, unavailable, invalid, or missing entries.

**Add to cart** increments an existing selection. **Checkout** includes the current selection without duplicating an already-present line. Known MMK amounts can be totaled; unknown prices require confirmation. Order text includes product, plan, duration, price, and quantity.

Checkout opens a Telegram DM draft and attempts to copy the full order. Long messages are split into numbered parts. The customer sends the message. There is no server-side order history or payment collection.

## Authorization

Hosted identity comes from Sites. Admin access requires an email in server-side `ADMIN_EMAILS`; an empty allowlist grants nobody access. Mutations also require same-origin requests. Local dev strips client-supplied identity headers and permits its mock identity only on loopback.

Do not expose the Worker behind an untrusted proxy that accepts forged identity headers. Moving away from Sites requires implementing a trusted authentication boundary, not merely copying the routes.

## Assets and portability

Built-in marks and fonts travel with Git. Font CSS prefers WOFF2 and retains TTF fallbacks. English uses Manrope; Myanmar uses Wa Lone. Runtime images live under R2 `logos/`, referenced by `/media/logos/...` paths in the catalog.

Project paths are relative. Dependencies, builds, local storage, and secrets are ignored. Git synchronizes implementation and seed data, not customer carts, live catalog edits, or uploaded runtime images.
