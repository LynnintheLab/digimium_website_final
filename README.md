# Digimium website

Digimium is a bilingual digital subscription catalog for browsing products, choosing a plan, and ordering through Telegram. The storefront uses a soft blue/lavender gradient, navy sections, colored brand marks, Manrope for English, and Wa Lone for Myanmar.

- Host on Hostinger: [hPanel and GitHub deployment steps](docs/HOSTINGER.md)
- Earlier Sites deployment: [Digimium](https://digimium-minimal.aungnyeinchantun23.chatgpt.site)
- Earlier Sites administration: [Manage catalog](https://digimium-minimal.aungnyeinchantun23.chatgpt.site/admin)
- Source: [LynnintheLab/digimium_website_final](https://github.com/LynnintheLab/digimium_website_final)

On `testing`, the Hostinger build protects `/admin` with a one-time code sent to the owner’s inbox through Resend. A verified browser stays signed in for up to 180 days. The earlier Sites deployment uses ChatGPT sign-in.

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
| Storage | Hostinger MySQL stores catalog edits and uploaded logos. The Sites target uses D1 and R2. Revision checks prevent overwriting another editor's changes. |
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

For the default Next.js app, initialize a local MySQL database with [the Hostinger schema](hostinger/schema.sql), then set the database and admin environment variables as described in [Development setup](docs/DEVELOPMENT.md). Start the app:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000` for the storefront and `http://127.0.0.1:3000/admin` to manage it. For the older Sites target, follow the separate D1/R2 instructions in the development guide.

## Branches and release workflow

| Branch | Purpose |
| --- | --- |
| `production` | Default branch with stable, reviewed source intended for the live release. |
| `testing` | Working branch for changes and verification before promotion. |

Develop on `testing` and merge verified changes into `production`. When connecting GitHub in Hostinger, select `production` as the live branch. Automatic redeployment depends on the Hostinger app setting. Sites uses a separate publication workflow.

See [Deployment and recovery](docs/DEPLOYMENT.md) for the release sequence and runtime backups.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Use `npm run test:hostinger` for the MySQL-backed target and `npm run test:integration` for a running local Sites preview. Both run against disposable local data. See [Development setup](docs/DEVELOPMENT.md) for prerequisites.

Automated checks cover ordering rules, localization, admin authorization, persistence, concurrent saves, description visibility, logo storage, and published-plan filtering. They do not establish that a layout has been visually checked on a physical phone. Current verification status and remaining work belong in [NOTES.md](NOTES.md).

## Project guide

- [Admin guide](docs/ADMIN.md): products, plans, logo paths, descriptions, and contacts.
- [Architecture](docs/ARCHITECTURE.md): routes, data model, storage, and order flow.
- [Development setup](docs/DEVELOPMENT.md): Mac/Windows setup and checks.
- [Deployment and recovery](docs/DEPLOYMENT.md): branch promotion, hosting targets, and backups.
- [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md): scope and visual direction.
- [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md): matching contributor and sync instructions.
- [Asset provenance](public/assets/PROVENANCE.md) and [service mark sources](public/assets/marks/SOURCES.md): assets and font origins. Existing service marks retain their original colors in the current UI.

Dependencies, generated builds, local databases, runtime credentials, and uploaded production images are not Git source files. Reinstall dependencies on each machine and back up live storage separately.
