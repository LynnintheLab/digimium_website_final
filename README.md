# Digimium website

Digimium is a bilingual digital subscription catalog for browsing products, choosing a plan, and ordering through Telegram. The storefront uses a soft blue/lavender gradient, navy sections, colored brand marks, Manrope for English, and Wa Lone for Myanmar.

- Website: [Digimium](https://digimium-minimal.aungnyeinchantun23.chatgpt.site)
- Administration: [Manage catalog](https://digimium-minimal.aungnyeinchantun23.chatgpt.site/admin)
- Source: [LynnintheLab/digimium_website_final](https://github.com/LynnintheLab/digimium_website_final)

Website visitor access is controlled separately in Sites. A GitHub repository or branch does not change the website's audience.

## What is included

| Area | Behavior |
| --- | --- |
| Storefront | Category browsing, search, featured collections, FAQ, English/Myanmar language preference, and contact links. |
| Product plans | Only published plans appear to customers. Unpriced products remain available for enquiries. |
| Cart | Add a selected plan and continue browsing, change quantities, remove items, and retain the cart in the same browser. |
| Telegram checkout | Combine the cart and selected plan, copy the order, and open the store's Telegram DM with a draft. The customer sends the message. |
| Admin | Create and edit products, plans, descriptions, categories, availability, featured state, publication, and contact settings. |
| Short descriptions | One switch hides all short descriptions from public cards, product dialogs, and public catalog data while preserving the saved text. |
| Logos | Upload a logo, save its durable path, reuse it on another product, or use a built-in service mark. |
| Storage | D1 holds the saved catalog; R2 holds uploaded logos. Revision checks prevent overwriting another editor's changes. |
| Mobile | Sticky header, larger touch controls, single-column cards on narrow phones, scrolling order sheets, and separate admin list/editor views with reachable save controls. |
| Motion | Subtle blue cursor light outside cards and separate violet light clipped inside cards, respecting pointer and reduced-motion preferences. |

The starting catalog contains **54 products and 104 plan records**, with **50 plans selected for public display**. Admin edits can alter these counts. Keep the current plan visibility unless the owner explicitly changes it. Source and pricing decisions are documented in [data/IMPORT-SOURCES.md](data/IMPORT-SOURCES.md).

This release does not process payments, automatically send Telegram messages, or maintain a server-side order history. Those are future extensions, not active checkout features.

## Quick start

Install Git, GitHub CLI, and Node.js 24 with npm. The package declares Node.js 22.13 or later; Node.js 24 is recommended because the tests import TypeScript directly.

```sh
gh repo clone LynnintheLab/digimium_website_final
cd digimium_website_final
git switch testing
git pull --ff-only
npm run install:ci
```

Create a git-ignored `.dev.vars` containing the local preview identity:

```dotenv
ADMIN_EMAILS=seedy@sites.test
```

Build and initialize the local database **once on a new clone**:

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --file drizzle/0000_supreme_salo.sql
npm run dev -- --host 127.0.0.1 --port 5185
```

Open `http://127.0.0.1:5185` and `http://127.0.0.1:5185/admin`. Local sign-in uses the development identity above. Production uses ChatGPT sign-in and a separate runtime allowlist. Do not replay the initial migration against an existing database.

See [Development setup](docs/DEVELOPMENT.md) for Windows PowerShell commands, troubleshooting, and tests.

## Branches and release workflow

| Branch | Purpose |
| --- | --- |
| `production` | Default branch with stable, reviewed source intended for the live release. |
| `testing` | Working branch for changes and verification before promotion. |

Both branches start from the same completed website revision. Future work belongs on `testing`; merge validated changes into `production`. Git pushes synchronize source only. Sites publishing is a separate operation, and `testing` is not automatically connected to a separate staging URL or database.

See [Deployment and recovery](docs/DEPLOYMENT.md) for the release sequence and runtime backups.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

`npm run test:integration` needs a running, initialized local preview and an explicit `TEST_BASE_URL`. These tests modify local catalog data and restore the catalog afterward. Use the commands in [Development setup](docs/DEVELOPMENT.md); never target production.

Automated checks cover ordering rules, localization, admin authorization, persistence, concurrent saves, description visibility, logo storage, and published-plan filtering. They do not establish that a layout has been visually checked on a physical phone. Current verification status and remaining work belong in [NOTES.md](NOTES.md).

## Project guide

- [Admin guide](docs/ADMIN.md): products, plans, logo paths, descriptions, and contacts.
- [Architecture](docs/ARCHITECTURE.md): routes, data model, storage, and order flow.
- [Development setup](docs/DEVELOPMENT.md): Mac/Windows setup and checks.
- [Deployment and recovery](docs/DEPLOYMENT.md): branches, Sites publishing, and backups.
- [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md): scope and visual direction.
- [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md): matching contributor and sync instructions.
- [Asset provenance](public/assets/PROVENANCE.md) and [service mark sources](public/assets/marks/SOURCES.md): assets and font origins. Existing service marks retain their original colors in the current UI.

Dependencies, generated builds, local databases, runtime credentials, and uploaded production images are not Git source files. Reinstall dependencies on each machine and back up live storage separately.
