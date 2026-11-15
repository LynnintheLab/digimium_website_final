# Zod security follow-up — 15 November 2026

## Result and scope

The Zod finding is fixed in source and the final local verification passes. Hosted rollout is pending. This is a focused dependency and application regression check, not a penetration test or a clean bill of health for every deployment dependency.

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

Pending: testing deployment, bounded read-only HTTP/browser smoke checks, production promotion and verification. Do not run exploit, load or mutation suites against either live service.

Local audit, suite-summary and artifact-version evidence is ignored under `outputs/security/zod-*-2026-11-15.json`.
