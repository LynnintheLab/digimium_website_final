# Development setup

## Requirements

- Git and GitHub CLI, authenticated to an account with repository access.
- Node.js 24 and npm. This avoids extra flags for the tests' direct TypeScript imports.
- A terminal in the repository root. All commands below use relative paths.

The clean-clone execution profile is `portable`, suitable for Mac and Windows. Checkout-local tool state is generated under `.sites-runtime/`; do not copy that directory between machines.

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

## Local environment

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

## Initialize local storage

Build once to generate the local Wrangler configuration, then apply the initial SQL only to a fresh local database:

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --file drizzle/0000_supreme_salo.sql
```

This works unchanged in PowerShell. It uses the local `DB` binding and does not contact the production database. The initial SQL creates `catalog_snapshots`; it is not idempotent. If the table already exists, do not rerun the file or delete the database merely to silence that message.

Local D1 and R2 state live under `.wrangler/state/`, independently on each machine. The first successful read of an empty, initialized database uses the JSON seed. Saving in admin creates the authoritative catalog snapshot.

For schema changes, use `npm run db:generate`, review the generated migration, and apply new migrations in order. Do not edit or replay a migration already applied to production.

## Run the site

```sh
npm run dev -- --host 127.0.0.1 --port 5185
```

- Storefront: `http://127.0.0.1:5185`
- Admin: `http://127.0.0.1:5185/admin`

The local sign-in helper is restricted to loopback requests and strips client-supplied authentication headers. Production sign-in is provided by Sites.

`npm start` runs the compiled Worker locally after a build. It does not provide the Vite development sign-in middleware; use `npm run dev` for admin integration checks.

## Automated checks

```sh
npm test
npm run typecheck
npm run build
```

For integration tests, leave the initialized dev server running in another terminal and set its exact port. The tests' fallback ports differ, so use `TEST_BASE_URL` explicitly.

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
| Catalog returns 503 on a fresh clone | Build, then initialize local D1. Keep hosting bindings as `DB` and `BUCKET`. |
| Admin redirects or denies access | Confirm `.dev.vars` has the local identity, restart dev, and sign in through `/admin` on loopback. |
| Integration tests cannot connect | Confirm the preview port and explicitly set `TEST_BASE_URL`. |
| Saved logo path fails on another machine | Git does not copy R2 uploads. Use a built-in mark or upload the image locally. |
| Changes disappear after reload | Use Save changes; drafts are not persisted until saving succeeds. |
| Catalog save reports a conflict | Reload the current snapshot and reapply the intended changes. |
| Native dependency fails after switching OS | Reinstall with `npm run install:ci`; do not reuse another machine's dependency folder. |
| Browser shows an old design | Reload the current URL and verify the intended account/Site before changing source. |

## Cross-machine sync

Start each session with `git pull --ff-only` on the intended branch. Before switching machines, update `NOTES.md`, commit, and push. Keep real credentials in ignored environment files and configure each machine separately.
