# Admin records for earlier customer purchases

Runtime **`6248c3f`** adds account-owned records for purchases made before a customer registered on the website. The runtime source is pushed to `testing` and `production` and was observed **Completed/Current** on both Hostinger environments. Local validation and bounded hosted verification are complete; final documentation is synced on `testing`.

## Customer and admin behavior

Admin can start from **Customers → Create order**, **Customer details → Create order for this customer**, or **Orders → Create order**. A customer-specific entry point fixes the selected account; the global entry point provides customer search and selection. The form shows the account name, contact and full customer ID for review.

Choose currently published, available products/plans, quantities and the actual whole-MMK unit prices. Saved catalog prices, including discounts, prefill the form. An earlier negotiated amount can override the unit price; an unpriced offer requires an explicit amount. Zero is accepted for a historical complimentary purchase. Line totals and the order total are shown before submission.

Creation saves a pending record visible to its registered owner. It opens the existing order editor, where Admin can enter the original subscription dates, optional delivered account details and a customer-visible approval/rejection note. The subscription remains inactive until approval. The new record does not transfer, claim, edit or delete the original guest order.

Manual recording does not send an email, a checkout message or a new-checkout Telegram owner alert. See [Admin instructions](ADMIN.md#record-an-earlier-purchase-for-a-customer).

## Server and security boundaries

- `POST /api/admin/commerce` requires the existing Admin session and strict same-origin mutation check. Missing, opaque/null and foreign origins remain rejected. Customer sessions cannot call the Admin endpoint.
- JSON is bounded to 2 MiB. Strict schemas reject unknown fields, spoofed names/totals/approval fields, malformed IDs, invalid notes and invalid numeric values. Collections are capped at 3,000 items before element validation. Quantities must be positive safe integers; unit prices must be nonnegative safe integers. Each line total and the combined amount must remain safe integers.
- Names, plan names, duration and default effective prices come from the saved server catalog. New requests require the reviewed catalog revision. Hidden, unavailable, unknown and duplicate offers are rejected atomically. Unpriced or non-MMK catalog amounts require a validated MMK override. Public checkout continues to reject price overrides and retains its existing enquiry behavior.
- The request UUID is scoped to the selected account. A separate manual-order fingerprint binds the customer, reviewed revision, ordered items, quantities, price overrides and normalized note. Concurrent exact retries return the same record; changed payloads using that request UUID return 409. Exact retries find the existing record before checking the current catalog, so a later catalog edit does not create a duplicate or change the saved snapshot.
- Manual creation locks the selected customer before checking/inserting the order. Customer deletion takes the same parent lock. A new purchase invalidates an earlier reviewed deletion version; a deletion that wins first prevents order creation. Existing guest ownership and snapshots remain untouched.
- Approval reuses the existing order/owner-bound encrypted fulfillment envelope. Structured credentials are available only to Admin and the owning customer's approved full history. Pending views and account previews omit them. Customer history remains session-owned; a supplied customer-ID query cannot change ownership.

An independent read-only code review found no material issue in the authorization, shared snapshot behavior, idempotency, parent-lock ordering, credential projection or uncertain-request UI handling. This is a bounded review of the changed workflow, not a claim of exhaustive security coverage.

## Local verification

The release source passed the following with Node 24:

| Check | Result |
| --- | --- |
| Full ESLint | Pass; zero errors and warnings |
| TypeScript typecheck | Pass |
| Next.js standalone build and Hostinger packaging | Pass |
| Existing unit suite | 103 tests passed |
| New `test:admin-orders` integration | Pass |
| Existing `test:commerce` integration | Pass |
| Existing `test:admin-customers` integration | Pass |

The new [manual-order integration](../tests/admin-orders.integration.mjs) refuses a nonempty database, a non-loopback database/origin or a database name outside `digimium_test_*`. All mutation fixtures used a dedicated disposable local MariaDB instance. The provider fixture permits only the fake Admin OTP mail and blocks other external provider fetches.

Its assertions cover authorization/origin/content-type/body limits; strict input and numeric bounds; missing customers and stale catalog revisions; discounted catalog snapshots and negotiated/zero prices; unpriced offers; concurrent retries and changed-payload conflicts; public checkout override/namespace rejection; owning-customer history and preview redaction; encrypted delivery; byte-for-byte guest preservation; unchanged customer profiles/outbox; and three concurrent manual-create/customer-delete races. The existing commerce and customer-administration suites provide regression coverage for checkout, fulfillment and removal behavior.

## Browser and UX observations

Local browser checks used **1440px, 390px and 320px** viewports with synthetic accounts and orders:

- Customer directory, customer details and global Orders entry points opened the creation form with the appropriate customer selection behavior.
- Two-item orders calculated line/combined totals, accepted an earlier negotiated price and rejected a duplicate product/plan selection.
- The saved pending order opened in the established editor and could be approved with historical dates; the correct owner then saw it in full history.
- A Telegram-only account retained its actual identity without a fabricated email/password. A price-on-request offer required an entered amount.
- An offline/uncertain submission exposed **Retry same request** and recovered one order. Editable fields and catalog reload are locked while the result is uncertain, preserving the payload and request UUID. Leaving warns that an order may already exist. Catalog-conflict recovery retains selections/prices for review after reload.
- The narrow-screen form footer was placed in normal scroll flow below the fields instead of obscuring them.

Native browser testing also reproduced an existing Admin sign-in failure: the global `no-referrer` policy made native form POST `Origin` opaque, and the strict server check rejected it. Admin document responses now use **`Referrer-Policy: same-origin`**. Same-origin native forms retain a usable origin; cross-origin referrers remain suppressed. Customer pages and API responses retain `no-referrer`. The origin validator was not relaxed.

Screenshots are retained in the shared design-media folder under `output/qa/admin-orders-2026-11-16/`: `desktop-create.png`, `mobile-320-create.png`, `created-pending.png` and `hostinger-testing-current.jpg`. They are local QA evidence rather than repository runtime assets. Physical Windows, iOS and Android devices were not exercised.

Local fixture cleanup is complete: the isolated MariaDB instance was stopped/removed, task-only environment files and harness were removed, and the clean validation copy was removed. Local mutation checks did not edit live customers, orders or catalog data. **Kosai Namti remained untouched.**

## Hosted verification

Runtime `6248c3f93b6183f57549aea012a9a3b675cde947` was observed **Completed / Current** in Hostinger on both environments on 16 November 2026:

- Testing deployment: `01a1e52e-a8a7-7229-b3bb-06be2e0666b1`.
- Production deployment: `01a1e532-e58d-7006-a66f-cd2204656c99`; Hostinger displayed deployment at 23:34 in the account's local time. The log confirms the expected commit, successful compile/typecheck, standalone output, current-version switch and restart.

Fourteen bounded hosted checks passed across the two hosts: home, Admin login, catalog and giveaway returned 200; anonymous Admin commerce GET/POST and customer orders GET returned 401. Admin documents serve `Referrer-Policy: same-origin`; API responses retain `no-referrer` and private/no-store where applicable. Four additional checks of the normal login/POST paths without a release query also returned the new behavior. These were public reads or anonymous auth-denied requests; no authenticated live create/approve request was made.

Production retained 51 published products and JSON-null giveaway output. Testing retained its existing 54 products and separate draft campaign. No account linking, customer/order/catalog edits, giveaway reopening, provider messages or Telegram interactions were performed during hosted verification.

During version rollover, early requests briefly reached the previous runtime. Hostinger's Completed/Current observation, no-cache checks and subsequent normal-path checks resolved that ambiguity without a manual redeploy. The detailed non-sensitive check results are retained beside the local screenshots as `hosted-checks.json` in the shared media QA folder.

The complete authenticated create/approve/retry UI was tested against the isolated local production build, not live customer data. Physical Windows, iOS and Android devices were not tested; viewport checks used the browser at 1440, 390 and 320 pixels. Temporary local browser metrics/cookies were cleared and UI/media test tabs were closed. The Hostinger deployment inspection used a temporary background tab. Owned database/processes and task-only secrets were removed.

The final verification documentation is synced on `testing`; production serves the reviewed runtime above.
