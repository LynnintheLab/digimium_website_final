# Zod security follow-up — 15 November 2026

## Result and scope

The Zod finding is fixed and runtime source `1a25b6b` reached Hostinger Completed/Current on testing and production. Final local and hosted verification passed. This is a focused dependency and application regression check, not a penetration test or a clean bill of health for every deployment dependency.

## Changes

- Pin Zod **4.6.7**. Migrate the preview invocation/result records to the v4 two-argument `z.record(key, value)` API. Preserve strict object validation and the pre-schema 3,000-item order limit. [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [official migration guide](https://zod.dev/v4/changelog).
- The expanded audit found `react-server-dom-webpack` **19.2.6** with a critical RSC advisory. Pin React, React DOM and React Server DOM Webpack together to **19.2.9**, preserving their matching peer requirements. [React RSC advisory](https://github.com/advisories/GHSA-xqc2-xf4c-x3h3), [separate server-function DoS advisory](https://github.com/advisories/GHSA-wx67-qw84-cm4g).
- Fix a reproduced concurrent Telegram-link response: MariaDB `ER_CHECKREAD` / 1020 now joins the existing bounded three-attempt whole-transaction retry. Rollback/release and fresh website-session, challenge and identity-ownership checks remain intact. No ownership transfer/merge is allowed. The previous test returned 200/503; the final test returns 200/409 with exactly one Telegram identity and owner. [MariaDB error 1020](https://mariadb.com/docs/server/reference/error-codes/mariadb-error-codes-1000-to-1099/e1020).

## Audit scopes

| Audit | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production dependencies before Zod migration | 0 | 1 | 0 | 0 | 1 |
| Production dependencies after final patches | 0 | 0 | 0 | 0 | 0 |
| Full dependency graph after Zod, before React patches | 1 | 8 | 17 | 1 | 27 |
| Full dependency graph after final patches | 0 | 8 | 17 | 1 | 26 |

`npm audit --omit=dev --json` and `npm audit --json` cover different graphs. The full graph still has **26 affected dependency entries**, including eight high, in the Vite/Vinext/Cloudflare, lint and migration toolchains. These remain open and need a separate compatibility/security cleanup. Do not describe the whole graph as clean or assume every dev-declared package is absent from deployment.

In particular, the earlier standalone trace physically included the dev-declared RSC server decoder. The final artifact contains React/DOM/RSC **19.2.9**. Zod is bundled rather than a traced external package; its lockfile version is 4.6.7. Artifact presence alone did not establish exploitability of the prior Hostinger app. Next stays at 16.4.6; its vendored code is not independently assessed by npm's package graph audit. The legacy Sites RSC build also passed, but no Sites publication was performed.

## Verification

- Final Node 24 standalone build and TypeScript check: passed.
- Legacy Sites build with the patched packages: passed.
- Unit tests: **70 passed**, including six new protocol migration/security cases.
- Focused ESLint: **zero errors or warnings**.
- Six fresh disposable-database suites: **all passed** — catalog/admin, commerce, Telegram/link/history, giveaway, Google and direct Telegram identity.
- New catalog checks exercise strict extra-field rejection, safe revision bounds, malformed email, duplicate-plan issue paths and maximum catalog size.
- Protocol/application checks cover authorization, origin/CSRF, rate limits, expiry/replay, concurrent writes, customer/guest isolation, encrypted optional delivery fields, secret projections, linked Telegram eligibility and giveaway deduplication.

All mutation tests used loopback-only disposable databases and fake Google/Telegram/Resend fixtures, with external fetch fallback blocked. No production orders, account links, giveaway dates/launch/entries, or real provider messages were changed. Telegram app/links were not opened. Owned fixture servers and database were stopped.

## Hosted verification

Both hosts deployed runtime source `1a25b6b` as Completed/Current. Each passed **14 bounded, signed-out read-only checks**: public storefront/catalog/giveaway/session and private pages, unauthenticated admin/customer-order rejection, private no-store/noindex and security headers, no storefront analytics in private documents, plus source/config exposure checks. `/.env` and `/.git/config` returned 403; `/package.json` and `/package-lock.json` returned 404. Catalogs retain 54 products; giveaway remains draft with exact 2/3/1 allocation and no public participant data.

Chrome smoke checks passed on staging (Myanmar) and production (English): plan dialog open/close, account chooser/profile open/close and no captured browser errors. The existing production sign-in, English preference and cart count of two were preserved. No provider login, sign-out or checkout was performed. Public storefront proof is ignored at `outputs/security-live-storefront-2026-11-15.png`.

One first immediate staging check batch failed. A diagnostic ten-GET batch and the subsequent complete fourteen-check batch passed; the first wrapper did not retain the underlying response, so its cause is not established. Production's complete batch passed. These are bounded smoke checks, not exploit/load tests or proof against all attacks.

Local audit, suite-summary and artifact-version evidence is ignored under `outputs/security/zod-*-2026-11-15.json`.
