# Security review — 15 November 2026

> Follow-up: the initial Zod finding is resolved by Zod 4.6.7, with matching React/DOM/RSC 19.2.9 patches. See the [Zod security follow-up](SECURITY-ZOD-FOLLOWUP-2026-11-15.md) for the new audits, regression tests, deployment status and remaining full-toolchain findings. The tables below retain the initial review history.

## Scope and status

Review of the account/history changes, optional purchased-account fields, saved-receipt recovery, verified Telegram linking and giveaway. This is a focused source review, dependency audit and bounded application verification, not a penetration test or a guarantee that the entire hosting environment is secure.

At this report's initial write, the final Next.js 16.4.6 production build and TypeScript check passed, all **64 unit tests** passed, and focused lint reported **0 errors**. Fresh disposable-database commerce, Telegram/link/history, giveaway, Google protocol and direct Telegram identity suites passed. Browser fixtures also verified masked fields, separate documents, link completion through a mocked webhook, entry and private admin review. Implementation `2a28a66` plus header hardening `363041c` reached Hostinger Completed/Current on testing and production. Read-only hosted checks below passed; the live giveaway remains an unlaunched draft.

## Reviewed application controls

| Area | Evidence from source |
| --- | --- |
| Admin changes | Valid owner-admin session and exact same-origin mutation checks precede order/giveaway writes. Order revision checks and row locks prevent overwriting another saved revision. |
| Purchased-account fields | Account, Password, Manager and Username are optional and bounded. They stay inside the existing AES-256-GCM fulfillment envelope, whose authenticated data binds it to its order and owner. Date-only edits preserve saved fields; explicit blank values clear structured fields. |
| Customer isolation | Orders are queried by the authenticated customer's ID. Browser-supplied customer IDs do not select another customer's history. Full approved history may expose that owner's delivered details; overview and pending responses remove them. |
| Credential projections | Checkout responses/replays, Telegram drafts, bot term/history projections and saved-receipt serialization use explicit purchase/date projections. They omit both legacy delivery text and structured account credentials. API responses use private/no-store caching. |
| Rendering | Customer delivery values are React text, not injected HTML. Passwords start visually hidden. Fresh server-rendered account/history documents do not include storefront analytics. Links from the storefront/popover/mobile dock to Account and History now use full document navigation. Browser checks confirmed zero storefront analytics scripts in both private documents. |
| Telegram linking | The encrypted challenge binds to the original customer and exact website-session hash. Bot approval alone does not persist a link. Completion rechecks the live session inside the transaction. Existing Telegram ownership is neither transferred nor merged; unique identity constraints and bounded transaction retries handle races. Public flow JSON excludes session hashes. |
| Giveaway entry | Exact-origin POST and a verified website session are required. Joining re-reads the linked stable Telegram ID inside a campaign-locked transaction. Unique campaign/customer and campaign/Telegram constraints prevent duplicate entries. Dates/status are checked at entry time. Public data contains campaign information and the viewer's own eligibility booleans; participant identity data is admin-only and paginated. A new campaign starts as draft. |
| Receipt recovery | A saved receipt is no longer treated as an instruction to open a modal on a normal store visit or Account/History return. Explicit cart recovery retains the existing owner/contact checks and 24-hour limit. |

Relevant implementation: [orders](../hostinger/orders.ts), [customer orders API](../app/api/customer/orders/route.ts), [customer authentication](../hostinger/customer-auth.ts), [Telegram challenge](../hostinger/telegram-auth.ts), [Telegram identities](../hostinger/telegram-identity.ts), [giveaway](../hostinger/giveaway.ts), [receipt projection](../lib/order-receipt.ts).

## Private-page response hardening

The first staging check found only the CDN’s `upgrade-insecure-requests` policy; frame, content-type, referrer and HSTS headers were absent. Added route-scoped Next headers for Account, History, Admin and API responses: CSP `frame-ancestors none` / `object-src none` / `base-uri self`, X-Frame-Options DENY, nosniff, no-referrer, and HSTS max-age 31536000 without a subdomain/preload directive. The final build and a local packaged `/account` GET verified all five headers. All five headers propagated to both hosted private pages. The CDN additionally appends its own upgrade-insecure-requests policy; the frame/base/object directives remain present.

## Dependency audit and fixes

Command: `npm audit --omit=dev --json` against the final lockfile. This audit excludes development-only dependencies; it does not prove that every installed/build dependency is free of advisories.

| Result | Critical | High | Moderate | Total |
| --- | ---: | ---: | ---: | ---: |
| Before compatible patches | 1 | 3 | 2 | 6 |
| After compatible patches | 0 | 1 | 0 | 1 |

Updated Next.js and eslint-config-next to **16.4.6**, sharp to **0.35.5** including the existing miniflare override, and compatible lockfile dependencies source-map-js **1.2.2**, baseline-browser-mapping **2.11.37** and fast-uri **3.1.9**. No unrelated major upgrade was performed. See [package manifest](../package.json) and [lockfile](../package-lock.json).

Next/sharp patches address published image-processing and cache-related advisories. Source inspection found no `next/og` ImageResponse, `use cache`, Server Actions or configured remote image allowlist in this application. That reduces exposure to some documented preconditions; upgrading is still appropriate because the package versions were affected and the framework's image endpoint can exist independently of visible UI usage. [Next image optimization advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Next cache advisory](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

**Initial finding, now resolved: Zod 3.25.76 — high severity.** The follow-up pins Zod **4.6.7** and migrates both one-argument record schemas to the v4 API. The 3,000-item pre-schema order limits remain as defense in depth. The new production-dependency audit reports zero findings; the full build/preview graph still has separate open findings documented in the follow-up. [Zod resource-consumption advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

Local ignored evidence: [before audit](../outputs/security/runtime-audit-before-2026-11-15.json), [after audit](../outputs/security/runtime-audit-after-2026-11-15.json).

## Verification results

| Check | Status |
| --- | --- |
| Final Next.js 16.4.6 build / TypeScript | Passed |
| Unit tests | 64 passed |
| Focused lint | 0 errors |
| Disposable commerce HTTP suite, including field encryption/isolation and pre-Zod limits | Passed |
| Disposable Telegram/login/link suite | Passed |
| Disposable giveaway HTTP suite | Passed |
| Staging release source / deployment | `363041c` — Hostinger Completed/Current |
| Production release source / deployment | `363041c` — Hostinger Completed/Current |
| Live read-only checks below | Passed: 10 GET checks per environment; no live mutation tests |
| Additional Google protocol and direct identity regression suites | Passed on disposable local databases |

Actual hosted results (signed-out HTTP clients, no cookies): `/`, `/api/catalog`, `/api/giveaway`, `/api/customer/session`, `/account` and `/order-history` returned 200. Customer history and admin commerce/giveaway/catalog APIs returned 401 with no-store caching. Both catalogs retained 54 products. Public giveaway data stayed draft, preserved prize allocation 2/3/1, denied entry eligibility and exposed neither participants nor counts. HTTPS certificate validation used the standard trusted-certificate checks.

Account and History responses on both hosts contain frame-ancestors none, X-Frame-Options DENY, nosniff, no-referrer, HSTS max-age 31536000, private/no-store cache headers and noindex metadata, with no storefront analytics scripts. A narrow browser cookie-metadata check verified the existing production `__Host-digimium_customer` cookie is Secure, HttpOnly, SameSite=Lax, host-only and Path=/. Cookie values were not printed or saved. Existing owner sign-in, language and cart were preserved. Google remained enabled on both sites and Telegram on production only.

Evidence is local and ignored: [staging GET checks](../outputs/security/staging-readonly-2026-11-15.json), [production GET checks](../outputs/security/production-readonly-2026-11-15.json), [provider capabilities](../outputs/security/provider-capabilities-2026-11-15.json). CSRF, ownership failures, concurrent linking, revocation, secret projections, encrypted storage and giveaway write/window rejection were tested only against disposable local databases. No live order, entry, provider login, Telegram launch or account-link completion was performed.

## Limits and follow-up

- The initial Zod finding is closed in the follow-up; separate full-toolchain findings remain open. See the follow-up for current counts and limits.
- No exploit, load, brute-force or destructive test was run against the live service. Positive credential delivery, linking and giveaway entry must be validated with disposable fixtures; actual private Telegram delivery is outside the agent's no-app/link verification scope.
- This review does not inspect Hostinger's operating system, database grants/backups, internal network or every CDN/WAF rule. Live headers alone cannot establish those controls.
- Physical iOS Safari and assistive-technology coverage belong in the separate UI/UX report. These checks are not a participant usability study.
