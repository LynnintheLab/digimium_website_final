# Customer login methods

Customer login has a shared form in Account, Order history and the checkout popup. Email registration/sign-in remains available. Google and Telegram login are implemented and activate separately when the selected Hostinger app has their private provider settings. Deploying source alone does not configure a provider or register a Telegram webhook. Phone sign-in remains **Coming soon**.

Admin continues to use its separate owner-only email code. Customer Google or Telegram sign-in does not grant admin access.

## Telegram message presentation

The private bot keeps its generated welcome card for ordinary `/start`. A login
deep link instead sends a blue/amber verification-lock image, with the login
details as its caption and four code choices plus Reject attached to that same
message. After actual website-session issuance, a separate emerald/checkmark
success photo carries its details and menu. The two stages are visually distinct.
Missing image data, upload failures or captions over Telegram's 1024-unit limit
fall back to the existing text flow.

Login notices show a native bold title, browser/device inferred from user-agent,
approximate IP country when available, and the start time labelled MMT. Country
comes from the bundled offline DB-IP Lite IPv4/IPv6 files; no IP is sent to a
geolocation provider, and no city or GPS location is claimed. It is advisory and
does not participate in authentication. Private/missing/proxy-only addresses
show unknown, and caller-provided country/city headers are ignored. See
[data provenance, license and update instructions](../hostinger/data/README.md).

Selecting the code says only that the code was confirmed. A separate completed
notice is sent after the original browser successfully consumes the challenge
and receives its website session. This avoids a slow approval edit overwriting
success. The completed notice's history/plan buttons are bound to its actual
Telegram message ID. A photo-menu history/plan action opens a new signed text
panel, preserving long order pages and their normal pagination without caption
truncation. Older challenges and text fallbacks still use text edits; new photo
prompts store their message kind and use caption edits for approval/rejection.
Notification failure is bounded to two seconds and never invalidates the website
session; acknowledgement retries do not send it again.
The Telegram message-presentation change described above did not add account linking or logout-all-device controls. Current Telegram connection is implemented through the exact-session flow described in [Connect Telegram to an existing account](#connect-telegram-to-an-existing-account).

## Email and Google account behavior

- Email flow: enter an address → a password account asks for its existing password; a new address chooses a password of at least 10 characters, then a name. Customer creation happens only after final submission.
- A Google-only account does not have a fabricated website password. Email entry for that account directs the customer to Google.
- A new Google identity can create an account using its verified email and profile name. If a usable profile name is missing, the form asks for one.
- If the verified Google email already belongs to an email/password account, the customer must confirm that account’s existing password before Google is attached. Matching email text alone does not merge accounts or expose another customer’s orders.
- Subsequent Google sign-ins use the stable Google subject identifier. A changed Google email does not transfer an existing Google identity to a different website account.
- Checkout authentication returns to cart review. Signing in does not place an order automatically.

The email routing endpoint returns only the next sign-in step, with same-origin checks, private responses and request limits. It discloses whether an email has an account to support this requested flow.

## Set up Google in Google Cloud

Use a project owned by the business. Separate OAuth clients for staging and production keep their settings independent.

1. Open [Google Cloud Console](https://console.cloud.google.com/), select or create the project, and open **Google Auth Platform**.
2. Configure **Branding** with the Digimium application name, support/contact email and website details. Configure **Audience** for the customers who should be allowed to sign in. A public shop normally needs **External**, rather than an organization-only audience.
3. Open **Clients → Create client**, choose **Web application**, and give it an environment-specific name such as `Digimium staging`.
4. Add the corresponding origin and exact redirect URI from the table below. They must match the Hostinger app’s `APP_ORIGIN`; do not add a trailing slash to the callback path.
5. Keep the client ID and secret in that app’s private Hostinger environment. Do not paste secrets into chat or commit downloaded credentials to Git.
6. The current Google app uses **External / Testing**. Google exempts requests limited to `openid`, `email` and `profile` from the test-user allowlist requirement, so these sign-ins do not require adding every customer or publishing the app just for access. Recheck the rules before adding any other scope. Workspace administrator or account-protection policies can still block individual accounts.

| Environment | Website origin | Authorized redirect URI |
| --- | --- | --- |
| Production | `https://buywith-digimium.store` | `https://buywith-digimium.store/api/customer/google/callback` |
| Staging | `https://test.buywith-digimium.store` | `https://test.buywith-digimium.store/api/customer/google/callback` |

The integration requests identity scopes only: `openid`, `profile` and `email`. It does not need access to Drive, Gmail or Calendar. Do not assume the generic Testing notice in Google Cloud removes the documented basic-identity exception, and do not promise that every account or browser will show identical consent/warning screens.

[Google’s official OpenID Connect setup guide](https://developers.google.com/identity/openid-connect/openid-connect) · [Testing exception for basic identity scopes](https://support.google.com/cloud/answer/15549945?hl=en) · [OAuth app-state comparison](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

## Configure the Hostinger app

Set these server-side values on each app separately:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Web OAuth client ID for that environment |
| `GOOGLE_CLIENT_SECRET` | Secret belonging to that client |
| `APP_ORIGIN` | Exact HTTPS website origin from the table above |
| `ADMIN_AUTH_SECRET` | Existing stable application secret of at least 32 characters; keep its current value |

The example environment files contain blank Google keys. Both Google values are required. Restart/redeploy the Hostinger app after applying them, then inspect `GET /api/customer/google` for the public enabled/disabled capability result. That endpoint does not return the secret.

Do not rotate the existing application or fulfillment secrets just to add Google login; existing sessions, pending authentication state and encrypted order recovery depend on their configured keys. See [Hostinger setup](HOSTINGER.md) for backups and secret handling.

### Google database additions

The first Google flow creates the protocol challenge table from [google-auth-schema.sql](../hostinger/google-auth-schema.sql). Identity handling adds [google-identity-schema.sql](../hostinger/google-identity-schema.sql) and makes the existing customer `password_hash` column nullable for Google-only customers. Google identities still require verified email. Telegram-only customer rows may have null email and password, with their separate stable Telegram identity. Existing password hashes and purchase records are preserved.

The app database user needs **CREATE**, **REFERENCES** and **ALTER** privileges. Importing `CREATE TABLE IF NOT EXISTS` files alone does not change an existing non-null password column. Back up the customer, session, identity, challenge and order tables together before first activation; the app performs its checked migration on first use. Do not manually clear live tables to complete setup.

### Staging checks before public activation

1. Check a new Google customer and repeat sign-in into the same account.
2. Check a local email/password customer with the same Google email: the existing password must be required once before linking, and the old order history must remain with that account.
3. Check cancellation, a closed/blocked popup, expired state, wrong callback state, replay attempts and a missing profile name.
4. Check Account, Order history and checkout on desktop and a phone. Checkout must return to the original cart without submitting it.
5. Sign out and confirm private history is no longer available. Repeat the read-only availability checks on production after its own credentials are configured.

## Telegram login: choose the website code in the bot

The requested custom Bot API flow is implemented. It is separate from the standard Telegram login widget and from guest Telegram checkout. It remains unavailable until that Hostinger app has all three private Telegram settings and its dedicated bot webhook has been configured.

1. The customer chooses Telegram on the website. The website displays a four-digit comparison code, a five-minute countdown, **Open Telegram**, an optional QR view, **Refresh**, and **Cancel**.
2. The button or QR opens the environment’s login bot using a fresh challenge deep link. The bot shows the website domain and basic browser/device context, four distinct code choices including the website code, and **This was not me / Reject**.
3. The customer chooses the matching code. The original browser notices approval, consumes that request once, creates its customer session, and returns to the account/cart. Signing in does not place an order. Rejection, a wrong choice, expiry or cancellation does not sign in.

The visible digits are for human comparison, not a bearer login secret. A strong random token identifies the expiring request; the initiating browser’s secure HttpOnly cookie is also required. The bot webhook validates its secret header, the private chat, Telegram sender, original bot message and opaque choice. A wrong choice permanently rejects that request. Session issuance and challenge consumption are one database transaction, and completed-response recovery requires both the matching receipt and the same signed-in customer.

### Telegram account behavior

- The stable numeric Telegram user ID owns the account. Changing a username or display name does not move an identity to another customer or merge purchase histories.
- A new Telegram customer has a name and optional Telegram username, with **null email and no website password**. No fake Gmail address or password is created.
- Existing email/Google accounts are not automatically merged with Telegram accounts, even if names or usernames match. Full Account settings provides an explicit Telegram connection for a signed-in Google/email account. The code challenge binds to that exact customer/session and keeps its existing purchases. A Telegram identity already owned by another customer is rejected; no accounts are merged or transferred.
- Customer/admin views and account-purchase Telegram drafts identify Telegram customers by the saved name and Telegram identity when no email exists. Guest checkout remains a separate order flow.

### Bot and active environment

The owner approved one dedicated bot, **@digimium_login_bot**. It is used for a real staging check first, then deliberately moved to production. Telegram permits only one webhook per bot, so **only one environment can use this bot at a time**. After the move, remove the three Telegram provider settings from staging and apply/redeploy so its Telegram choice becomes unavailable. Use separate bots only if both environments need simultaneous Telegram login in the future. Do not reuse an ordering, support or unrelated bot.

The same bot handles sign-in and on-demand order/plan checks described below. It sends purchase information only in the requesting customer’s private chat. Automatic expiry reminders and account linking/merging are separate features.

| Private setting | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token issued by BotFather for the dedicated bot assigned to this active environment |
| `TELEGRAM_BOT_USERNAME` | The matching public bot username, with or without the leading `@` |
| `TELEGRAM_WEBHOOK_SECRET` | Private random 32–256-character secret containing letters, digits, `_` or `-` |
| `APP_ORIGIN` | Exact HTTPS origin of the selected staging or production app |
| `ADMIN_AUTH_SECRET` | Existing stable application secret; retain its current value |

A suitable webhook secret can be generated locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Keep completed environment files ignored by Git and restrict access to their contents. Import only this environment’s provider values into the corresponding Hostinger app, then apply/redeploy. Never paste bot tokens or webhook secrets into chat or source control.

The existing Hostinger Node app receives webhook requests itself. **No separate VPS, continuously running desktop process, or personal Telegram Web sign-in is needed.** Customers use their own Telegram app; BotFather is needed only to manage the bot.

### Order history and plan time in the bot

Use the bot’s menu buttons or these commands:

| Command / button | Behavior |
| --- | --- |
| `/start`, `/menu`, `/help` | Show the Myanmar menu and website link; a website login deep link still opens its four code choices |
| `/history` · **📋 အော်ဒါမှတ်တမ်း** | Show this Telegram-linked account’s pending and approved orders, purchase snapshots and totals |
| `/plans` · **⏳ Plan သက်တမ်း** | Show approved purchased plans with start/end dates, remaining days, status and a small remaining-time bar |

Long results use **နောက်ထပ် →** pages. **↻ ပြန်စစ်မယ်** fetches current order/date information; **အစမှ** returns to the first page and **🏠 Menu** returns to the menu. The website history link opens the customer’s ordinary authenticated website view.

The bot identifies the requester by the verified numeric Telegram sender ID and its existing website identity mapping on every read. It does not accept a customer ID, email, name or username as authority to view orders. Unmapped Telegram users receive website Telegram sign-in instructions; users without orders receive an empty state specific to this Telegram-linked account. Purchases made through a Google/email account stay with that original owner; once that same account explicitly connects Telegram, its earlier purchases are available through the bot. Neither command creates an account, merges identities, claims guest orders or approves an order.

Pending orders are labelled as waiting for confirmation. The plan view contains approved purchases only. Dates and remaining days use the existing **Asia/Yangon calendar-date rules**, matching the website: future terms have an upcoming label, the end date remains **ends today** for that entire Myanmar date, and expiry begins the following day. Missing/invalid dates show an unknown state rather than an invented expiry or progress value. Expired plans remain visible as expired purchases.

Bot messages contain purchase metadata and subscription dates only. Previously saved service-account passwords, delivery notes, encrypted fulfillment contents and customer contact fields are excluded. Stored term dates share the encrypted fulfillment record, so bounded server-side decryption extracts only line IDs and dates before creating the bot response. Messages are private-chat only, with protected content. Navigation callbacks are signed and bound to the requesting sender, private chat, original bot message and app origin; expired or mismatching buttons do not reveal purchase data. Refresh requests are rate limited.

This feature uses the existing production webhook and provider settings. It needs no additional VPS, bot, environment variable or webhook transfer. Keep the single production bot on production while testing code with disposable databases and mocked Telegram requests. Use a separate test bot if a future live staging bot check is required.

After deploying the bot menu/history routes, publish the private-chat slash menu once using the existing ignored production environment file:

```sh
node scripts/configure-telegram.mjs --env .env.telegram.production.local --commands-only
```

This mode verifies the bot ID/username, registers `/start`, `/menu`, `/history`, `/plans` and `/help` for private chats, verifies the saved command list and enables Telegram’s commands menu button. It does not read, replace or move the webhook and cannot be combined with `--move-from`. Its output excludes credentials. Reapply it only when the command menu changes.

### Register and verify the webhook

After the new routes and private environment settings are deployed, run the bundled setup script locally with Node 24. Put the selected environment’s values in a private file; use a separate file for each environment.

```sh
node scripts/configure-telegram.mjs --env path/to/private.env
# Equivalent Node environment-file option:
node --env-file=path/to/private.env scripts/configure-telegram.mjs
```

The script uses fixed Telegram Bot API endpoints. It checks `getMe` against the token’s bot ID and configured username, inspects the current webhook, and by default **refuses to overwrite a different webhook URL**. For an empty or matching webhook it calls `setWebhook` with the exact endpoint, `secret_token`, and only `message`/`callback_query` updates, retaining pending updates. It then verifies the URL and allowed updates with `getWebhookInfo`. Its output contains no token, secret header or provider response body. Do not run a second long-polling bot worker for this bot.

For the approved one-bot release, finish the real staging check, configure production’s private settings, then move only from the exact known staging origin:

```sh
node scripts/configure-telegram.mjs --env path/to/production.env --move-from https://test.buywith-digimium.store
```

The target comes from that private file’s production `APP_ORIGIN`. `--move-from` accepts an exact, different public HTTPS origin; paths, queries and insecure origins are rejected. The script proceeds only if Telegram currently reports precisely `SOURCE_ORIGIN/api/customer/telegram/webhook`. Any mismatch leaves the webhook unchanged. This is a deliberate environment transfer, not a general overwrite switch. If a previous successful move already points at the target, rerun without `--move-from` to verify/reapply the target. Disable Telegram settings on the old staging app after the move, and use production for subsequent customer logins.

| Environment | Webhook URL |
| --- | --- |
| Production | `https://buywith-digimium.store/api/customer/telegram/webhook` |
| Staging | `https://test.buywith-digimium.store/api/customer/telegram/webhook` |

`GET /api/customer/telegram` returns only whether required configuration is present. `enabled: true` alone does not prove Telegram can deliver to the webhook: finish the setup script and a real staging login check. The app must have CREATE, REFERENCES and ALTER privileges for its checked first-use migration. Back up customer/session/order data together with [Telegram identity](../hostinger/telegram-identity-schema.sql) and [challenge](../hostinger/telegram-auth-schema.sql) tables. Existing rows and password hashes are retained.

### Staging verification

Check a real new Telegram account and repeat login, then verify **Account**, **Order history** and checkout on a phone and computer. Test opening the QR on a phone while the original website remains on a computer. Verify refresh/cancel, expiry, Reject and a wrong code; no rejected or stale request should sign in. Checkout must preserve the original cart until explicit purchase. An existing email/Google account’s purchases must remain separate. Production checks should be read-only; run destructive/mutation test fixtures only against disposable local databases.

The bundled `tests/telegram.integration.mjs` and `tests/telegram-identity.integration.mjs` use isolated loopback MySQL data and mocked Telegram calls. The bot history checks cover cross-customer/guest isolation, navigation binding, bounded pagination, missing/expired dates and exclusion of delivery credentials. The pure `tests/telegram-history.test.mjs` checks formatting and Myanmar calendar boundaries. `node --test tests/configure-telegram.test.mjs` checks setup safety without contacting Telegram. These automated checks do not replace a real staging check of mobile Telegram delivery.

Official references: [bot deep links and keyboards](https://core.telegram.org/bots/features#deep-linking), [callback button API](https://core.telegram.org/bots/api#inlinekeyboardbutton), [HTTPS webhook secret](https://core.telegram.org/bots/api#setwebhook), [webhook diagnostics](https://core.telegram.org/bots/api#getwebhookinfo).

## Phone number: Coming soon

Choose an SMS verification service when phone login is scheduled. **Twilio Verify** is one option, not a service already purchased or connected to this project. It needs a funded account, a Verify Service, destination-country permissions, private service credentials, request limits and carrier delivery tests. The customer model already supports provider identities without invented emails/passwords; phone sign-in still needs its own verified identity mapping and secure delivery flow.

[Twilio Verify setup guide](https://www.twilio.com/docs/verify/quickstarts/node-express)

### Connect Telegram to an existing account

Open full Account settings → Telegram → Connect, approve the matching code in the bot and return to the same website session. The original session/customer and earlier orders are preserved. Signing out, switching sessions, expiry or cancellation invalidates completion. The settings page lists actual connected methods from provider identity tables; Google connection from a Telegram-only account remains labelled Coming soon. A three-step illustrated guide is linked from the giveaway. Agent verification uses only a mocked local webhook and never opens the Telegram app.
