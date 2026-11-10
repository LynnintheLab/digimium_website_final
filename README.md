# Digimium website

Minimal bilingual service catalog using black, white, and Digimium Persian Blue. Built with React and Vinext. Myanmar text uses supplied Wa Lone; display headings use supplied Gunken, with a quiet sans-serif body.

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

- `app/page.tsx`: 22 services, category filters, search, collection tabs, FAQ, and contact enquiry flow.
- `app/globals.css`: layout, type, palette, responsive behavior, reduced motion, and focus states.
- `public/assets`: local brand assets and fonts; origins recorded in `PROVENANCE.md`.
- `PRODUCT.md` and `DESIGN.md`: product scope and design system.

Visitors can select a service, open a prepared email, copy their enquiry, or open Viber. No message is automatically sent. Pricing and availability must be confirmed directly. Payment processing is deliberately deferred until the planned checkout upgrade. The Viber link requires an installed Viber client; the number and email are also shown.

## Future checkout

Move the product list to a maintained catalog with stable IDs, verified plan options and prices. Add an order backend and payment provider only when chosen. Keep contact ordering available as a fallback.

## Hosting

Site identity lives in `.openai/hosting.json`. Sites publication uses a build archive from the exact pushed source revision. Credentials must never be saved in source. Local tool and dependency state is ignored.
