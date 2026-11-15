# Security review — 15 November 2026

## Scope and status

Review of the account/history changes, optional purchased-account fields, saved-receipt recovery, verified Telegram linking and giveaway. This is a focused source review, dependency audit and bounded application verification, not a penetration test or a guarantee that the entire hosting environment is secure.

At this report's initial write, the final Next.js 16.4.6 production build and TypeScript check passed, all **64 unit tests** passed, and focused lint reported **0 errors**. Fresh disposable-database commerce, Telegram/link/history, giveaway, Google protocol and direct Telegram identity suites passed. Browser fixtures also verified masked fields, separate documents, link completion through a mocked webhook, entry and private admin review. Staging/live verification remains pending until the rollout record below is filled.

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

## Dependency audit and fixes

Command: `npm audit --omit=dev --json` against the final lockfile. This audit excludes development-only dependencies; it does not prove that every installed/build dependency is free of advisories.

| Result | Critical | High | Moderate | Total |
| --- | ---: | ---: | ---: | ---: |
| Before compatible patches | 1 | 3 | 2 | 6 |
| After compatible patches | 0 | 1 | 0 | 1 |

Updated Next.js and eslint-config-next to **16.4.6**, sharp to **0.35.5** including the existing miniflare override, and compatible lockfile dependencies source-map-js **1.2.2**, baseline-browser-mapping **2.11.37** and fast-uri **3.1.9**. No unrelated major upgrade was performed. See [package manifest](../package.json) and [lockfile](../package-lock.json).

Next/sharp patches address published image-processing and cache-related advisories. Source inspection found no `next/og` ImageResponse, `use cache`, Server Actions or configured remote image allowlist in this application. That reduces exposure to some documented preconditions; upgrading is still appropriate because the package versions were affected and the framework's image endpoint can exist independently of visible UI usage. [Next image optimization advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Next cache advisory](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

**Remaining: Zod 3.25.76 — high severity.** No patched 3.x release was available during this check; the advisory identifies 4.6.6+ as patched. A v4 migration was not mixed into this release. The order handlers now reject `items`/`lines` arrays longer than 3,000 **before** Zod processes their elements. Existing request-byte limits remain in force. This mitigates the reachable oversized-order-array path but does **not** fix the library or clear the audit finding. Follow up with a tested v4 migration and fresh audit. [Zod resource-consumption advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

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
| Staging release source / deployment | Pending |
| Production release source / deployment | Pending |
| Live read-only / rejection checks below | Pending |

After deployment, verify a small known set of live endpoints: valid HTTPS/TLS; signed-out customer/admin private endpoints reject access with 401; customer/private responses retain appropriate cache headers; observed session cookies retain Secure, HttpOnly, same-site and host-only protections; and robots/indexing behavior matches the intended public/account/admin surfaces. Live checks are read-only; CSRF and mutation rejection were tested only against disposable local databases. Submit no live order, entry, provider login, Telegram launch or account-link completion. Record actual statuses and headers rather than assuming the source configuration reached production.

## Limits and follow-up

- The Zod high-severity dependency finding remains open despite the collection guard.
- No exploit, load, brute-force or destructive test was run against the live service. Positive credential delivery, linking and giveaway entry must be validated with disposable fixtures; actual private Telegram delivery is outside the agent's no-app/link verification scope.
- This review does not inspect Hostinger's operating system, database grants/backups, internal network or every CDN/WAF rule. Live headers alone cannot establish those controls.
- Physical iOS Safari and assistive-technology coverage belong in the separate UI/UX report. These checks are not a participant usability study.
