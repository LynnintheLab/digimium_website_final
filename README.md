# Digimium website

Minimal bilingual service catalog using a soft blue gradient canvas, deep blue panels, and Digimium Persian Blue. Built with React and Vinext. Myanmar text uses supplied Wa Lone; English headings, body copy, and controls use self-hosted Manrope (400, 500, 600, 700), with semibold headings.

## Development

```sh
npm install
npm run dev -- --host 127.0.0.1 --port 5185
```

## Verification

```sh
node --test tests/cart-order.test.mjs tests/shop-language.test.mjs
npx tsc --noEmit
npm run build
```

## Content and behavior

- `app/page.tsx`: server-rendered catalog loader. `app/storefront.tsx`: category filters, search, collection tabs, FAQ, and language preference. `app/shop-order.tsx` handles plan selection, the cart and Telegram checkout. `app/admin`: catalog administration.
- `app/globals.css`: layout, type, palette, responsive behavior, reduced motion, and focus states.
- `public/assets`: local brand assets and fonts; origins recorded in `PROVENANCE.md`.
- `PRODUCT.md` and `DESIGN.md`: product scope and design system.

Customers can switch between English and Myanmar, choose a published plan and add it to a cart that stays in their browser. Checkout combines the selected plan with the cart, copies the order, and opens the store’s Telegram DM with a draft. The customer taps Send. Prices without a known amount require confirmation. Email and Viber remain available for support; the site does not collect payment.

## Future checkout

Add an order backend and payment provider only when chosen. Keep contact ordering available as a fallback.

## Hosting

Site identity lives in `.openai/hosting.json`. Sites publication uses a build archive from the exact pushed source revision. Credentials must never be saved in source. Local tool and dependency state is ignored.


## Catalog administration

Open `/admin` and sign in with the site owner's account. Only emails in the server-side `ADMIN_EMAILS` environment setting may edit. The production value is configured through Sites; local development uses the starter's local sign-in with `ADMIN_EMAILS=seedy@sites.test` in git-ignored `.dev.vars`.

The editor manages service descriptions (English/Myanmar), categories, prices, durations, icons, availability, featured visibility, publishing, and Telegram, email and Viber contacts. Save changes publishes the full catalog atomically to D1. Hidden services remain editable but are excluded from the public API and storefront. Conflicting saves require loading the latest catalog.

The initial catalog combines `data/catalog.json` with plans and services from `data/import-catalog.json`. See `data/IMPORT-SOURCES.md` for source files and price conflicts. Once saved, D1 is authoritative. API and database failures are reported instead of replacing user content with default data.

Generate migrations with `npm run db:generate`; build before applying local SQL. See `drizzle/0000_supreme_salo.sql`. Sites applies production migrations during deployment. Do not replay an applied migration.

Run the local integration checks with `node tests/catalog.integration.mjs` while dev preview is running on port 5185. The checks deliberately edit only a localhost database and restore its original catalog content. Never use them against production.

Third-party logo origins are in `public/assets/marks/SOURCES.md`. Meitu uses a neutral fallback where no verified mark was sourced. VPN uses a generic shield.

This checkout is a copy published under the current account, as requested after an account switch. The earlier checkout remains separate. Always reuse the project ID in this checkout’s `.openai/hosting.json`.

## Product logos and plans

Under Product logo, choose Upload logo, select a PNG, JPEG or WebP file up to 2 MiB and 4096 pixels per side, then select Save changes. The upload has a durable path under `/media/logos/`. Use Copy path to reuse it on another product within the same site. The BUCKET storage binding holds the image and the catalog records its path. Replacing a logo keeps its original path available for products that share it.

Use the Show on website option on a plan, publish the product and save. The card highlights its first visible plan. Customers can select among visible plans before adding a plan or checking out.
