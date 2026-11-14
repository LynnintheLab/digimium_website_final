# Development setup

## Requirements

- Git and GitHub CLI, authenticated to an account with repository access.
- Node.js 24 and npm. This avoids extra flags for the tests' direct TypeScript imports.
- A terminal in the repository root. All commands below use relative paths.

The default development server is Next.js. The optional Sites development server uses its own portable build profile.

## Clone and install

These commands work in macOS Terminal, Git Bash, and PowerShell:

```sh
gh repo clone LynnintheLab/digimium_website_final
cd digimium_website_final
git switch testing
git pull --ff-only
npm run install:ci
```

The installer uses the committed npm lockfile, including platform-specific optional dependencies. Do not copy `node_modules` from another machine.

## Hostinger-compatible local server

1. Create a dedicated development MySQL database and a user with access to it.
2. Open that database in phpMyAdmin or your SQL client. Import [hostinger/schema.sql](../hostinger/schema.sql). The file creates the application tables and can be imported again safely.
3. Copy `.env.example` to a git-ignored `.env.local`. Set `APP_ORIGIN=http://127.0.0.1:3000`, set `ADMIN_EMAIL`, `ADMIN_AUTH_SECRET`, `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, and enter the development database connection values. See [Hostinger setup](HOSTINGER.md) for all required settings.
4. Run `npm run dev -- --hostname 127.0.0.1 --port 3000`. Open `http://127.0.0.1:3000` for the store or `http://127.0.0.1:3000/admin` for admin login.

For the production build, run `npm run build`. This prepares the standalone Node.js server and includes storefront assets. `npm start` runs that build. Set environment variables in the hosting runtime and serve production over HTTPS. MySQL holds editable data and logo bytes outside the deployment directory.

## Legacy Sites local environment

`.env.example` lists application configuration keys without production values. The local Cloudflare runtime reads `.dev.vars`, which is ignored by Git.

On macOS or Git Bash:

```sh
printf 'ADMIN_EMAILS=seedy@sites.test\n' > .dev.vars
```

On Windows PowerShell:

```powershell
Set-Content -Path .dev.vars -Value 'ADMIN_EMAILS=seedy@sites.test' -Encoding utf8
```

`seedy@sites.test` is the built-in local development identity, not a real production account. Do not put it in the hosted admin allowlist. Restart dev after changing `.dev.vars`.

## Initialize local Sites storage

Build once to generate the local Wrangler configuration, then apply the initial SQL only to a fresh local database:

```sh
npm run build:sites
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --file drizzle/0000_supreme_salo.sql
```

This works unchanged in PowerShell. It uses the local `DB` binding and does not contact the production database. The initial SQL creates `catalog_snapshots`; it is not idempotent. If the table already exists, do not rerun the file or delete the database merely to silence that message.

Local D1 and R2 state live under `.wrangler/state/`, independently on each machine. The first successful read of an empty, initialized database uses the JSON seed. Saving in admin creates the authoritative catalog snapshot.

For schema changes, use `npm run db:generate`, review the generated migration, and apply new migrations in order. Do not edit or replay a migration already applied to production.

## Run the Sites preview

```sh
npm run dev:sites -- --host 127.0.0.1 --port 5185
```

- Storefront: `http://127.0.0.1:5185`
- Admin: `http://127.0.0.1:5185/admin`

The local sign-in helper is restricted to loopback requests and strips client-supplied authentication headers. Production sign-in is provided by Sites.

`npm run start:sites` runs the compiled Worker locally after a Sites build. It does not provide the Vite development sign-in middleware; use `npm run dev:sites` for the Sites admin integration checks.

## Automated checks

```sh
npm test
npm run typecheck
npm run build
```

For the Hostinger integration test, create a **new empty** test database on `127.0.0.1` with a name beginning `digimium_test_`. Give a dedicated test user access to it. Put disposable database credentials and `APP_ORIGIN=http://127.0.0.1:6100` (or another unused port) in a git-ignored `.env.test.local`. Set `DB_HOST=127.0.0.1` explicitly. After `npm run build`, run:

```sh
node --env-file=.env.test.local tests/hostinger.integration.mjs
```

The test supplies its own owner settings, intercepts Resend delivery locally, imports the schema, runs the packaged server, saves a product and a logo, restarts the server, and verifies both records and admin sign-out. It leaves the disposable database available for inspection. Create a fresh empty database for another run. If the test variables are already exported, `npm run test:hostinger` runs the same check.

The account and order integration suite also starts a packaged server and requires its own empty loopback database. Point the same test environment keys at that database and an unused local app port, then run `npm run test:commerce` or `node --env-file=.env.test.local tests/commerce.integration.mjs`. It covers account isolation, concurrent checkout retries, snapshot pricing, manual approval, date validation and encrypted delivery details.

For the Sites integration tests, leave the initialized Sites dev server running in another terminal and set its exact port. The tests' fallback ports differ, so use `TEST_BASE_URL` explicitly.

macOS or Git Bash:

```sh
TEST_BASE_URL=http://127.0.0.1:5185 npm run test:integration
```

Windows PowerShell:

```powershell
$env:TEST_BASE_URL = 'http://127.0.0.1:5185'
npm run test:integration
Remove-Item Env:TEST_BASE_URL
```

Run integration tests sequentially and avoid editing the local catalog while they run. The catalog test restores its original content but advances its revision. The logo test removes its temporary service; the uploaded test logo remains in local R2. These checks reject non-local targets.

## Mobile review

Check narrow phones, a typical phone width, tablet portrait, and short landscape in both English and Myanmar:

1. Header, language toggle, menu, search keyboard, clear search, and filters.
2. Long product/plan names, unpriced products, and cards with descriptions hidden.
3. Add to cart, continue browsing, quantity controls, empty cart, and Telegram handoff.
4. Sheet scrolling with checkout and close controls reachable, including safe areas.
5. Admin list → editor → back, validation errors, logo upload, and bottom Save/Revert controls.
6. Keyboard focus, reduced motion, zoom, and horizontal overflow.

Record whether evidence came from code inspection, a resized browser, or a physical device. Viewport emulation does not verify the iOS keyboard, touch gestures, or Safari rendering. If browser access is disabled, report that gap rather than marking visual checks passed.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Catalog returns 503 on a fresh clone | For Hostinger, check the MySQL credentials and import `hostinger/schema.sql`. For Sites, initialize local D1 and keep the `DB` and `BUCKET` bindings. |
| Admin redirects or denies access | For Hostinger, check the origin, admin credentials and MySQL tables. For Sites, confirm the allowlist and sign-in identity. Restart dev after changing configuration. |
| Integration tests cannot connect | Confirm the preview port and explicitly set `TEST_BASE_URL`. |
| Saved logo path fails on another machine | Uploaded images live in each environment’s database or R2 bucket. Restore the matching data or upload the image locally. |
| Changes disappear after reload | Use Save changes; drafts are not persisted until saving succeeds. |
| Catalog save reports a conflict | Reload the current snapshot and reapply the intended changes. |
| Native dependency fails after switching OS | Reinstall with `npm run install:ci`; do not reuse another machine's dependency folder. |
| Browser shows an old design | Reload the current URL and verify the intended account/Site before changing source. |

## Cross-machine sync

Start each session with `git pull --ff-only` on the intended branch. Before switching machines, update `NOTES.md`, commit, and push. Keep real credentials in ignored environment files and configure each machine separately.
