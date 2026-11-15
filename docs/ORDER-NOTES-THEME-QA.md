# Order notes, rejected orders and appearance QA

Date: 15 November 2026. Status: runtime `42039be` is live on testing and production; private scheduler activation remains awaiting the owner’s explicit confirmation.

## Resulting behavior

- Admin can approve or reject a pending order with an optional customer-facing note. Rejection retains the order instead of deleting it and never creates an active subscription.
- Approved and rejected orders support explicit note-only edits. These do not change status, subscription dates or encrypted account details. Rejected orders cannot be approved through the fulfillment update route.
- Full website Order history separates Purchased, Pending and Rejected orders and shows the owning customer's note as escaped, pre-wrapped text. Account previews, checkout receipts and Telegram output omit notes. Guest orders and their notes remain admin-only.
- Notes allow up to 1,000 UTF-16 code units, normalize CRLF to line breaks, trim outer whitespace and reject other control characters and bidirectional overrides. Omission preserves an existing note; an explicit empty value clears it.
- Admin customer summaries count rejected orders separately. Existing explicit, revision-confirmed order deletion also supports rejected records.
- Customer pages offer light/dark appearance, use the system preference until the customer chooses, persist an explicit choice where browser storage is available, and synchronize changes across tabs. Admin routes retain light appearance at initial load and after navigation.
- Theme changes preserve the existing catalog geometry, two-column phone catalog, service logos, payment marks and giveaway identity.

## Data and API compatibility

The order schema adds nullable `rejected_at` and `customer_note` columns. First-use migration checks each column independently, including partially applied migrations. Existing pending/approved rows, ownership, snapshots and encrypted fulfillment remain intact. Fresh tables also enforce that rejection cannot coexist with approved fulfillment.

The existing admin PATCH body `{ revision, lines }` remains supported, with an optional `customerNote`. Explicit `{ action: 'reject', revision, customerNote? }` and `{ action: 'note', revision, customerNote }` variants avoid implicit approval. Each mutation locks the same order row, checks the current revision and advances it atomically. Authentication, same-origin checks, bounded JSON and no-store responses remain in place.

Owner-scoped full history returns the additive `customerNote`, `rejectedAt` and `rejected` status. Brief projections remain note-free and rejected records cannot become purchased-plan previews. Telegram history labels rejection; both stages of its Plans query require approval without rejection and never select customer notes or delivery credentials.

## Automated verification

The first completed order-note/appearance round below used Node.js 24.22.3 in an isolated source/dependency snapshot. Integration suites used separate empty loopback `digimium_test_*` databases, synthetic accounts and intercepted providers. Non-local provider fetches were blocked. No production environment files or live records were used. Its 95-test/three-suite result is retained here; the final expanded round is recorded separately below.

| Gate | Result |
| --- | --- |
| `npm run lint -- --max-warnings 0` | Passed; zero errors and warnings |
| `npm test` | 95 passed, zero failed/skipped |
| `npm run build` | Passed; standalone server packaged |
| `npm run typecheck` | Passed |
| `tests/commerce.integration.mjs` | Passed |
| `tests/admin-customers.integration.mjs` | Passed |
| `tests/telegram.integration.mjs` | Passed |
| `git diff --check` | Passed |

The explicit unit-test command now includes `tests/shop-theme.test.mjs`. Theme tests cover preference resolution, restricted browser storage, system behavior, bootstrap timing and Admin light-mode exclusion. Telegram renderer tests cover rejected status without dates, remaining-time visuals, pending guidance or note disclosure.

Commerce integration coverage includes old pending and approved encrypted records migrating without snapshot/credential changes, strict note validation, authorization/origin/body-size rejection, owner isolation, guest isolation, optional notes, preserved encrypted fulfillment, retained rejection, note-free receipts/previews, explicit rejected deletion, and concurrent approval/rejection/note/removal revisions. Customer administration tests verify separate rejected totals, stale removal protection after decisions or note-only edits, rollback and unrelated-record preservation. Telegram integration covers rejected history, approved-only plans, note/credential isolation, pagination and the existing login/linking protections.

The first commerce run exposed interference between new approved fixtures and an existing three-plan preview assertion. Moving the independent decision fixtures after the existing preview/removal checks preserved both sets of assertions; the fresh-database rerun passed. Production behavior did not change for this test correction.

All three integration application servers stopped after their suites. The synthetic database service was handed to the separate local UI fixture for final browser review. Browser findings and fixture cleanup should be recorded before deployment; physical-device checks are not claimed by these automated gates.

## Final expanded notification round

The final candidate also includes the authenticated customer notification bell in the storefront/full Account/History, per-customer admin website messages, owner-scoped read/pagination APIs, 3/1-day Myanmar-calendar expiry reminders and bounded new-customer/new-order Telegram owner alerts. The packaged Node scheduler reads private runtime configuration; hPanel scheduling and production owner-chat setup remain unconfigured. Validated term-date changes remove stale expiry reminders transactionally; credential/note-only edits retain them. See `NOTIFICATIONS.md` for behavior, limits and release setup.

The final combined gates pass: strict lint with **zero errors/warnings**, **98/98 unit tests**, standalone build/packaging and typecheck. Six fresh disposable integrations pass: **commerce, customer administration, Telegram protocol/history, Google protocol, direct Telegram identity and notifications**. Provider calls were intercepted; these checks sent no real Telegram/Google traffic and used no live records. The three additional units cover the private scheduler runner's HTTP boundaries. Database queued-event dedupe does not imply end-to-end exactly-once Telegram delivery.

This is automated source verification, not a claim of new-interface browser acceptance, physical-device testing or live deployment. Final browser evidence, owned-fixture cleanup, testing release, production promotion and real scheduler/private configuration remain to be recorded.

## Google Analytics read-only findings

The empty report belonged to account `416043452`, property `563983926`, measurement ID `G-1XHML3Y3WY`. The store uses a different property:

| Store destination | Verified value |
| --- | --- |
| Account | `416048711` |
| Property | `563966155` |
| Web stream | `16327521135` |
| Measurement ID | `G-5LML9P3RE0` |
| Stream status | Data flowing in the past 48 hours |
| Home, last 7 days | 24 users, 93 views, 243 events |

Open the [correct store report](https://analytics.google.com/analytics/web/#/a416048711p563966155/reports/intelligenthome). Filter the Host name when separating production from staging traffic.

The browser attempted collection with `tid=G-5LML9P3RE0`, matching the store destination. Collection was intentionally blocked during capture to avoid adding test hits; that temporary capture was then cleared and closed. No tag-code defect was established. Existing tracking code and container configuration were left unchanged, and no duplicate tag was added.

Automatic user-provided-data configuration was observed, but no private-data transmission was observed. A separate privacy review can check that configuration and the treatment of private Account/checkout overlays; this observation is not evidence of a data incident.

## Pending work

Finish and record the local browser review, including the notification bell/message/read/pagination flows in both themes/languages, then deploy the reviewed source to testing and verify it before promotion to production. Deployment, private notification configuration, actual five-minute hPanel scheduler and post-release read-only checks remain pending. Preserve campaign settings, provider configuration, existing sessions and live customer/order data; the owner manages real-data cleanup.

Relevant implementation files are `hostinger/orders.ts`, `hostinger/order-schema.sql`, `app/api/admin/commerce/[id]/route.ts`, `app/api/customer/orders/route.ts`, `app/admin/commerce/`, `app/account/`, `app/theme-toggle.tsx`, `app/theme.css` and `lib/shop-theme.ts`.

## Browser follow-up and dependency audit

Local Chrome verified optional approval/rejection notes, rejected records without dates/credentials/gauges, plain-text multiline rendering, Cancel focus restoration, stale-save input preservation and owner history. Admin website-message submission produced its success state and the owning customer’s unread bell; mark-all-read cleared the badge only after server success. A 320px popup initially extended below the viewport because of the blurred sticky header’s containing block. A body portal plus measured viewport bounds corrected it; final 320×700 and 390×844 checks leave 12px bottom clearance with no horizontal overflow. Strict lint, standalone build and typecheck pass after the two-file UI refinement; backend security results remain unchanged.

Fresh full and production-only npm registry audits each report zero findings across all severities. This describes the current npm graph, not a separate hosting scanner’s cached badge. Testing runtime `90631cf` reached Completed/Current and passed the original six read-only checks plus three unauthenticated notification/cron isolation checks; production promotion and final private scheduler activation are still pending.

## Release verification

Runtime `42039be` reached testing and production Completed/Current. Both hosts pass bounded public catalog/health, admin redirect, unauthenticated customer/admin notification isolation and unauthorized scheduler checks; private responses remain no-store and giveaway dates/status/prizes match the pre-release baseline. A fixed 54-product assertion was stale for production: its published catalog is 51 products at revision 27, updated before this release. The public API filters unpublished products; verification records that observed count instead of resetting the owner’s catalog. Testing remains 54 published at revision 3.

Live Chrome confirms the new theme and notification controls, existing English/session/cart2 state and no captured application errors. Collection was temporarily blocked for that public-page inspection, then the tab navigated to static content and the block was cleared before closure. Owned local fixture servers/databases/fake accounts/runtime secrets were cleaned up; the original unrelated review server remains unchanged. No live customer/order edits, test purchases, provider linking, giveaway entries or Telegram app launches were performed.
