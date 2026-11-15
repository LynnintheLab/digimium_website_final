# Website notifications and owner alerts

Status: runtime `42039be` is live on testing and production with the final 99-test automated round passing. Local interface acceptance and live read-only controls/route checks are complete; the approved owner-chat recipient is configured. The owner approved private scheduler activation; the protected five-minute production job is configured. No live order/account was created to send a test Telegram alert; actual provider delivery is not claimed from the read-only hosted checks.

## What each recipient receives

| Recipient | Channel | Events |
| --- | --- | --- |
| Signed-in customer | Website notification bell | Messages sent by Admin and automatic subscription-expiry reminders. |
| Store owner | The existing Telegram bot's private chat with the owner | A newly created website customer or a newly placed order. |

The website bell appears in the storefront and full Account/Order history headers after a customer session is confirmed. It shows the server's unread count; zero unread has no badge. Opening it shows newest messages, readable Myanmar/English expiry copy, individual/all-read actions, Load more and an Order history link. Opening the list alone does not mark messages read. Refresh happens on open and in visible tabs; a list being read is not periodically rearranged. Private list state is cleared on account changes, session rejection and navigation.

These are website notifications, not phone push notifications. Admin messages and expiry reminders are not sent to a customer's Telegram chat. Linking Telegram for sign-in does not subscribe that customer to Telegram messages. Owner alerts go only to the configured owner personal chat.

## Admin messages

Open **Admin → Customers**, select a customer and use the website-message composer. A message is addressed to that customer only and appears in their website bell. The customer does not need to have an active tab open when it is sent; it is saved for their next visit. Guest orders without a website customer do not create a customer notification inbox.

Messages are plain text, trimmed, at most 1,000 characters, with at most 20 newly created messages per customer per hour. Control/direction-override characters are rejected. Keep messages suitable for a customer to read; do not enter passwords, OTPs, private account credentials or secrets.

The optional **Button** selector defaults to **No button**. Choose the saved Telegram contact, Store homepage, Order history, Account settings, Contact section, or **Custom link**. Edit **Button text** (up to 60 characters); a custom destination must be a complete HTTPS link. The customer sees the button below the message. External links open in a separate tab with `noopener noreferrer`; customer-page presets remain on the website. Facebook or another support page can be supplied through Custom link. Selecting a preset or viewing the preview never opens Telegram.

Sending uses a request UUID. Retrying the same request with identical text and normalized button returns the existing message; reusing that UUID with different text, label or destination is a conflict. Repeated clicks/retries must not create duplicate queued messages. Admin can review that customer's message history through the same protected customer editor.

## Automatic expiry reminders

The scheduled job checks approved, customer-owned orders and their saved subscription term dates. It creates reminders at exactly **3 calendar days** and **1 calendar day** before the end date, using **Asia/Yangon / Myanmar time (UTC+06:30)**. Guest, pending and rejected orders are excluded. Unknown/missing dates cannot produce a reminder. This is a calendar-day calculation, not a browser-local 72/24-hour timer.

Each reminder is unique to the customer, order, line, actual end date and 3/1-day threshold. Re-running the job does not create another reminder for that same key. A date change can therefore produce reminders for the revised term. Changing validated start/end dates clears that order's existing expiry reminders in the same fulfillment transaction; changing only credentials/notes while keeping dates preserves them. The next scheduled scan evaluates the revised dates. Existing historical reminders are not a substitute for the current dates shown in Order history.

Each expiry pass scans at most **20 orders / 300 lines**, retaining an order/line cursor for the next pass. The scan day resets using Myanmar's calendar date. Invalid legacy snapshots or unreadable encrypted term data are skipped with cursor progress and an aggregate `invalidOrders` count so later valid orders can continue. No private delivery credentials are copied into a reminder. For a very large catalog of orders, monitor `hasMore` and ensure scans finish during the relevant day; a missed 3/1-day window is not retroactively reconstructed.

The bell API does not replace the scheduler. Without a configured job, admin messages still work but automatic expiry reminders will not be generated reliably.

## Private configuration

Configure real values only in the target Hostinger application's private environment settings or a git-ignored local file. The example environment files contain keys only.

| Variable | Value / purpose |
| --- | --- |
| `NOTIFICATIONS_CRON_SECRET` | A private, random 32–256-character value using letters, digits, `_` or `-`, authorizing the job endpoint. Use at least 32 random characters. |
| `TELEGRAM_BOT_TOKEN` | Reuse the existing Digimium login bot's private token for the selected configuration. Its existing login webhook remains in place. |
| `ADMIN_TELEGRAM_CHAT_ID` | The owner's verified numeric **personal/private-chat** ID, saved privately. Group/channel IDs are not accepted. |
| `ADMIN_TELEGRAM_BOT_TOKEN` | Optional separate alert-bot token. Leave empty for the selected existing-bot setup; if set later, it takes precedence over `TELEGRAM_BOT_TOKEN`. |

The owner chose the existing bot and the owner's personal chat. Do not put an actual token, chat ID or scheduler secret in Git, URLs, screenshots, issue descriptions or logs. The owner must be able to receive messages from that bot in the private chat. If the chat ID is not already verified, obtain it privately through the existing bot integration/owner; do not replace the bot's login webhook to discover it.

Configure the real owner chat only on the intended production app. Leave the testing app's owner-chat setting empty so tests or staging account creation cannot alert the owner. Local integrations must use synthetic data and fake Telegram delivery.

Missing/invalid Telegram alert configuration leaves the outbox pending and reports `configured: false`; it does not fail an otherwise valid registration/order or disable customer website messages. After adding the configuration and restarting the app, the scheduled worker can drain queued alerts. Back up the database independently of Git.

## Schedule every five minutes

For this Hostinger Node.js deployment, use the packaged Node runner in **hPanel → Cron jobs → Node.js**. Set a five-minute schedule (`*/5 * * * *`) and enter only this relative script path in the script/command field:

```text
scripts/run-notifications.mjs
```

hPanel's generated Node.js command already supplies the application's private environment file and current Node.js app root. Check that its preview references the intended production app/environment; do not add another `--env-file`, paste private values into the command, or use the testing app's configuration. The build copies the runner into `scripts/` inside the standalone bundle. It reads `APP_ORIGIN` and `NOTIFICATIONS_CRON_SECRET` from that private runtime environment, so there are **no secrets in the scheduled command**.

The runner accepts only a root HTTPS `APP_ORIGIN` (loopback HTTP is reserved for local tests), sends the secret as a Bearer header to the existing app's job endpoint, refuses redirects and times out after 15 seconds. Its log messages are fixed success/failure text; they do not print the secret, request URL, payload or provider response. “Notification maintenance completed” means the endpoint returned a successful HTTP status, not that every queued alert reached Telegram.

If a different authorized scheduler cannot run Node.js, the equivalent HTTP request shape is below. These are placeholders only; supply the real header through that scheduler's private secret configuration rather than a logged command:

```text
POST https://YOUR-STORE-HOST/api/internal/notifications/run
Authorization: Bearer <private NOTIFICATIONS_CRON_SECRET>
```

Set the header through the scheduler's private secret/header configuration. **Never put the secret in a query string.** The request must have no query parameters, request body, browser `Origin` header or cookies. Do not send it from the website frontend or expose the secret in client JavaScript. There is no new Telegram webhook or VPS requirement in the application itself; the scheduler only calls the existing Hostinger app.

The endpoint accepts only POST, checks the secret in `Authorization: Bearer …` with a constant-time comparison, and uses no-store responses. An unset/incorrect secret gives 401; an invalid browser-style/query/body request gives 400. A runner-wide database guard allows at most one start per 30 seconds; another attempt returns 429. A successful response contains aggregate expiry-scan and owner-alert delivery counts. Treat aggregate failures or a queue that stops draining as an operational issue, not proof that an individual customer received anything.

The scheduler is external configuration and is not created or activated merely by deploying this source. The owner approved creation of the private credential and production job on 15 November 2026. The current production hPanel Node.js cron uses `scripts/run-notifications.mjs` every five minutes with its existing private env-file prefix. Future environments require their own explicit configuration; deploying source alone does not create a job.

## Owner alert delivery and limits

An email/password, Google or Telegram registration queues an owner alert only when it creates a **new customer record**. An ordinary login, provider linking or repeat sign-in must not queue another “new customer” alert. Newly placed orders queue an alert alongside the saved order; replaying the same idempotent order request does not create a second queued event.

The database outbox is inserted in the creation transaction. A small delivery attempt runs only after that transaction commits; Telegram failure must not roll back an account or order. The private job also drains due alerts in bounded batches: at most **5 alerts / roughly 5 seconds** per invocation. Each claim uses a 60-second database lease, up to five attempts, and exponential backoff starting at 60 seconds (`60 × 2^priorAttempts`, capped at one hour). The five-minute scheduler can make an actual retry later than its earliest due time. After five attempts an undelivered row stops retrying automatically and requires investigation.

Telegram requests have a maximum roughly two-second fetch timeout and a bounded 16KB response. Both HTTP success and Telegram's `ok: true` are required before the row is marked sent. Only fixed failure classes are retained, never provider response bodies, bot tokens or request URLs.

Database dedupe keys guarantee one queued event per creation key. They do **not** provide end-to-end exactly-once Telegram delivery: Telegram may accept a message and lose its acknowledgement, or the app may stop before recording success. A retry after that can duplicate an owner alert. Avoid automatic business decisions based on Telegram-message count.

Owner alerts use a short account/order reference, optional customer display name, sign-in provider for a new account, and product/total summary for an order. They do not read or include customer email fields, OTPs, TOTP secrets, delivered passwords/account credentials, private delivery notes or login tokens. Free-text admin website messages are deliberately written by the admin; they are not an automatic export of those protected fields.

## Storage, ownership and deletion

`hostinger/notification-schema.sql` creates the website notification table, owner-alert outbox and job cursor/runner state. Bootstrap is database-only; importing the schema does not seed messages or send a Telegram request. Existing customer tables must exist first; the app needs the usual schema privileges or the owner can apply the reviewed schema privately before deployment. Keep this schema packaged with the standalone server.

Customer list/read APIs use the current authenticated customer only. Notifications are newest-first in pages of 20, with an owner-scoped opaque cursor and a total unread count. Mark-read accepts either 1–20 owned IDs or `all`; it cannot mark another customer's rows. Admin list/send routes require admin authentication and the existing same-origin checks. These APIs remain private/no-store and do not add storefront analytics to Account or Order history.

Removing an order removes its order-linked website notifications in the same deletion transaction. Removing a customer cascades their website notifications with the customer record. Those actions do not recall an already delivered owner alert.

The owner outbox is not transactionally erased at entity deletion. Before delivery, the worker checks that the referenced order/customer still exists; if it is gone, the row is cancelled and its copied payload is replaced by `{}`. This occurs when a configured worker processes the row, not immediately at deletion. A request already in flight cannot be recalled. Sent rows and fixed delivery status are retained; there is no automatic retention purge in this source. Choose an explicit reviewed retention policy before adding one.

## Verification before release

Final automated gates pass: strict lint with zero errors/warnings, 99/99 unit tests, standalone build/packaging and typecheck, plus six fresh private suites (commerce, customer administration, Telegram protocol/history, Google, direct Telegram identity and notifications). The scheduler runner's four HTTP/CLI boundary units are included, covering the version-switching directory symlink used by Hostinger. Integrations used disposable local databases and intercepted providers; no real provider sends or live records were involved. See `ORDER-NOTES-THEME-QA.md` for the separate initial 95-test round and final expanded results.

Local browser acceptance covers 320px/390px/desktop sizing, both appearances/languages, dismissal/focus, zero/unread counts and safe message rendering. Owner message delivery and mark-all-read were verified with disposable accounts. Hosted UI/private-route checks are complete; actual new-order/new-account Telegram delivery was not triggered with fabricated live data. Confirm that no new analytics loads on private routes. Keep mutation/delivery verification on fresh disposable data and mocked Telegram unless a real action is separately authorized.

Deploying this source and configuring a production owner chat/job are separate actions. Never trigger real Telegram delivery, create a real customer/order or delete live records as an incidental verification step.

## Release status

Runtime `42039be` is live on testing and production (Hostinger Completed/Current). The approved personal-chat recipient is applied in production using the existing bot; read-only Bot API verification confirmed the owner chat without sending a test message. No live order/account was created for testing. Website messages, the bell, dark appearance and order decisions were verified with disposable local accounts. The final portal fits 320px/390px viewports before and after scrolling.

The owner approved private scheduler-key creation and activation. Production has the five-minute Node.js job (`*/5 * * * *`), in addition to the immediate post-commit new-order/new-account alert attempt. A bounded authorized production invocation returned HTTP 200, scanned one approved order/line with zero invalid rows, found no currently due reminders and reported owner alerts configured with zero sends/failures. No fake live account/order or direct test Telegram message was created. The secret stays in a git-ignored private runtime file and must not be committed or put in a URL.

## Hosted entry-path correction

Hostinger invokes the runner through its version-switching `current` directory. Comparing the literal CLI path to Node’s resolved module URL skipped execution through that symlink. A local reproduction returned exit zero without a request; canonical file-path comparison fixes it. The actual packaged CLI now passes a symlinked-entry test with exactly one authenticated POST and the expected success output. Strict lint, 99 unit tests, build and typecheck pass; the server-side notification implementation is unchanged.

## Final hosted scheduler verification

Runner source `398381a` reached testing and production Hostinger Completed/Current. The actual five-minute production job at the 16:40 UTC interval produced `Notification maintenance completed.` in hPanel Cron output, confirming the packaged path, private env loading and authenticated job invocation. No secret appears in the cron command or its output. No fake live account/order or direct Telegram test message was created.

## Optional-button and dark-mode follow-up

The button schema adds nullable `action_label` and `action_url` columns without changing existing messages. The application guards each additive migration independently; old rows return no action. Both input and output validate the label/destination. Internal destinations are limited to customer routes without query redirects; executable, protocol-relative, credential-bearing, malformed and control-character URLs are rejected. Message/read APIs retain authentication, origin checks, bounded bodies, rate limits, owner isolation and private caching.

Message/reminder creation and owner-alert queue insertion explicitly use UTC timestamps, including the initial alert eligibility time. This prevents a database session timezone from delaying an otherwise immediately due owner alert. Existing records are preserved; no historical timestamp conversion is attempted.

Node 24 validation: 102 unit tests, strict lint with zero warnings, standalone build/typecheck, and fresh notification, commerce and customer-admin integrations. The notification suite also migrates a legacy table, checks button-aware retries and owner isolation, and runs with a UTC+7 database session to cover immediate queue delivery. Browser acceptance uses synthetic local accounts for preset/custom/no-button sends, unsafe-link rejection, readable message buttons, dark/light rendering and 320/390/768/1440px layout checks. No customer was contacted and no Telegram app or launch link was opened for verification.
