# Digimium website

Minimal bilingual service catalog using a soft blue gradient canvas, deep blue panels, and Digimium Persian Blue. Built with React and Vinext. Myanmar text uses supplied Wa Lone; English headings, body copy, and controls use self-hosted Manrope (400, 500, 600, 700), with semibold headings.

## Development

```sh
npm install
npm run dev -- --host 127.0.0.1 --port 5185
```

## Verification

```sh
npx tsc --noEmit
npm run build
```

## Content and behavior

- `app/page.tsx`: server-rendered catalog loader. `app/storefront.tsx`: category filters, search, collection tabs, FAQ, and contact enquiry flow. `app/admin`: catalog administration.
- `app/globals.css`: layout, type, palette, responsive behavior, reduced motion, and focus states.
- `public/assets`: local brand assets and fonts; origins recorded in `PROVENANCE.md`.
- `PRODUCT.md` and `DESIGN.md`: product scope and design system.

Visitors can select a service, open a prepared email, copy their enquiry, or open Viber. No message is automatically sent. Pricing and availability must be confirmed directly. Payment processing is deliberately deferred until the planned checkout upgrade. The Viber link requires an installed Viber client; the number and email are also shown.

## Future checkout

Move the product list to a maintained catalog with stable IDs, verified plan options and prices. Add an order backend and payment provider only when chosen. Keep contact ordering available as a fallback.

## Hosting

Site identity lives in `.openai/hosting.json`. Sites publication uses a build archive from the exact pushed source revision. Credentials must never be saved in source. Local tool and dependency state is ignored.


## Catalog administration

Open `/admin` and sign in with the site owner's account. Only emails in the server-side `ADMIN_EMAILS` environment setting may edit. The production value is configured through Sites; local development uses the starter's local sign-in with `ADMIN_EMAILS=seedy@sites.test` in git-ignored `.dev.vars`.

The editor manages service descriptions (English/Myanmar), categories, prices, durations, icons, availability, featured visibility, publishing, email and Viber contacts. Save changes publishes the full catalog atomically to D1. Hidden services remain editable but are excluded from the public API and storefront. Conflicting saves require loading the latest catalog.

Initial services come from `data/catalog.json` only when the database has no saved catalog. Once saved, D1 is authoritative. API and database failures are reported instead of replacing user content with default data.

Generate migrations with `npm run db:generate`; build before applying local SQL. See `drizzle/0000_supreme_salo.sql`. Sites applies production migrations during deployment. Do not replay an applied migration.

Run the local integration checks with `node tests/catalog.integration.mjs` while dev preview is running on port 5185. The checks deliberately edit only a localhost database and restore its original catalog content. Never use them against production.

Third-party logo origins are in `public/assets/marks/SOURCES.md`. Meitu uses a neutral fallback where no verified mark was sourced. VPN uses a generic shield.
