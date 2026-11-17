# Host Digimium on Hostinger Business or Cloud

Use a **Node.js Web App** with a Hostinger MySQL database. The app serves the storefront, `/admin`, and the catalog and image APIs from the same HTTPS address. Hostinger can build it directly from the GitHub repository. You can complete these steps in hPanel without SSH.

Both Hostinger apps use email-code login for the owner admin. Customers use email/password, Google when Google OAuth is configured, or the Telegram code-choice bot when its private settings and webhook are configured. For an existing password-based deployment, keep its database connection, import the updated schema from step 2 into that database, then apply its own admin and Resend settings from step 3.

## 1. Create the web app

1. Open **Websites → Create site → Web App → Import Git Repository**. The option may be labelled **Node.js Web App**.
2. Connect the GitHub account that owns the repository. Give the Hostinger GitHub App access to `LynnintheLab/digimium_website_final` and select it in hPanel.
3. Choose **`production`** for the live shop at `https://buywith-digimium.store` or **`testing`** for staging at `https://test.buywith-digimium.store`.
4. Choose these build settings. Select the **Next.js server-side** preset if detection offers multiple frameworks.

| Setting | Value |
| --- | --- |
| Project root | Repository root (`.`) |
| Framework | Next.js |
| Node.js | 24.x |
| Package manager | npm (lockfile included) |
| Install command if shown | `npm ci --include=dev` |
| Build command | `npm run build` |
| Start command if shown | `npm start` |

The build produces a self-contained server in `.next/standalone/`, with `server.js` and all public assets inside. For an explicit output-folder and entry-file configuration, use **`.next/standalone`** and **`server.js`** relative to that output. If a field explicitly asks for an entrypoint relative to the repository root, the corresponding path is **`.next/standalone/server.js`**. The server listens on the port Hostinger assigns.

5. Click **Deploy**. The build works before database credentials exist. The catalog and admin require the remaining setup. Open the new website's dashboard and copy its exact HTTPS address.

[Hostinger's GitHub deployment guide](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) · [Next.js webpack builds on Hostinger](https://www.hostinger.com/support/how-to-fix-next-js-16-turbopack-build-errors-on-hostinger/)

## 2. Set up the database

1. In GitHub, open [`hostinger/schema.sql`](../hostinger/schema.sql) from the branch you are deploying and choose **Download raw file**. Keep the `.sql` extension.
2. In your website dashboard, open **Databases → Management**. For a new app, create a MySQL database, a database user, and a unique password. For an existing shop, select its current database. Save the **full database name and username**, including Hostinger's prefix.
3. Open **phpMyAdmin** for that database. Select the database in the left sidebar, open **Import**, choose the downloaded SQL file, and run the import. For an existing database, import the updated schema before requesting a code. It adds the OTP tables alongside the catalog, logo and admin session tables. It preserves existing rows when rerun.
4. For a fresh database, leave the catalog table empty. The application starts with the bundled 54 products and 50 publicly visible plans. Its first successful admin save writes the catalog to MySQL.

Customer registration and orders create their additional tables on first use. Give the app user CREATE and REFERENCES privileges on its database or import [customer-auth-schema.sql](../hostinger/customer-auth-schema.sql) followed by [order-schema.sql](../hostinger/order-schema.sql). Fresh tables use CREATE TABLE IF NOT EXISTS. Existing order tables also require ALTER permission: the app makes customer_id nullable and adds guest_key, guest_name and a unique guest/request index on first use. This preserves existing orders and encrypted fulfillment. Importing the CREATE statements alone does not migrate an existing table. Back up the customer and order tables together with the existing database. Giveaway first use creates `digimium_giveaway_campaigns` and `digimium_giveaway_entries` from [giveaway-schema.sql](../hostinger/giveaway-schema.sql) using the same CREATE/REFERENCES privileges. The packaged server includes that schema. New campaigns remain drafts until the owner sets dates and clicks Launch; deployment does not launch a campaign.

[Hostinger's database connection guide](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)

## 3. Set the private application values

### Giveaway visibility

Admin → Giveaways → **Hide giveaway** removes the banner, promotion, prizes and countdown from the public storefront and stops new entries. Existing participants and schedule are retained. **Show giveaway** restores public visibility using the saved schedule. The first request after this release adds `is_visible` to an existing campaign table; the application database user needs ALTER privilege, as with existing migrations. Keep the postponed campaign hidden until the owner is ready to reopen it.

To send codes to your own Resend account inbox, set `RESEND_FROM_EMAIL=onboarding@resend.dev` and set `ADMIN_EMAIL` to the inbox associated with the Resend account that owns the API key. Resend delivers codes from this built-in sender only to that inbox. This setup skips DNS verification. [Resend’s testing sender](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)

To deliver codes to a different admin inbox, verify a domain you own in Resend, publish its supplied DNS records, and use a sender address on that domain. [Resend domains](https://resend.com/docs/dashboard/domains/introduction)

For a new deployment, download the [Hostinger environment template](../hostinger/.env.example), save a private copy with the extension `.env`, and fill in the values below. In **Review build settings → Environment variables → Edit**, choose **Import .env**, review the values, then select **Finish**. Hostinger keeps existing values for matching keys, so correct any earlier entries manually. [Hostinger’s import instructions](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)

For an existing deployment, you can enter the same values directly in the web app dashboard’s **Environment variables** section. Use the database and admin secret belonging to the selected app. Keep completed files outside the repository.

| Name | What to enter |
| --- | --- |
| `DB_HOST` | `127.0.0.1` for a database on this hosting plan |
| `DB_PORT` | `3306` |
| `DB_NAME` | Full database name from step 2 |
| `DB_USER` | Full database username from step 2 |
| `DB_PASSWORD` | Database user's password |
| `APP_ORIGIN` | `https://buywith-digimium.store` for production or `https://test.buywith-digimium.store` for staging |
| `ADMIN_EMAIL` | Owner inbox that receives the login codes |
| `ADMIN_AUTH_SECRET` | Private random secret of at least 32 characters. Generate one with the command below and keep it across redeploys. Rotating it revokes remembered sessions and pending codes. |
| `ORDER_FULFILLMENT_SECRET` | Optional private secret of at least 32 characters for encrypting delivered account details. Set it before approving the first order. When empty, the app derives its encryption key from `ADMIN_AUTH_SECRET`. |
| `RESEND_API_KEY` | Sending key from the Resend account used for this site |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` for the Resend account inbox, or an address on a verified sending domain |
| `GOOGLE_CLIENT_ID` | Optional customer Google OAuth Web client ID for this app; configure with the matching secret |
| `GOOGLE_CLIENT_SECRET` | Optional private Google OAuth client secret; both Google values are needed to enable customer Google sign-in |
| `TELEGRAM_BOT_TOKEN` | Optional private token for this app’s dedicated Telegram login bot |
| `TELEGRAM_BOT_USERNAME` | Matching public login bot username; a shared bot can serve only one active environment |
| `TELEGRAM_WEBHOOK_SECRET` | Private 32–256-character Telegram webhook secret using letters, digits, `_` or `-`; all three Telegram settings are required |

Store the effective order encryption secret in a private backup with the database recovery instructions. If orders were fulfilled using the fallback, set `ORDER_FULFILLMENT_SECRET` to the original admin secret before rotating `ADMIN_AUTH_SECRET`. Changing the effective encryption key requires re-encrypting existing fulfillment data.

Generate the secret locally and paste the output into the private environment settings.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Click **Apply changes** and **Restart** the running Node application. Use **Redeploy** if hPanel offers that action instead. Access `/admin` on the hostname in `APP_ORIGIN`.

[Hostinger's environment variable guide](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/)

### Enable customer Google sign-in

Create a Google Cloud OAuth **Web application** client and configure the exact callback `APP_ORIGIN/api/customer/google/callback`. In production that is `https://buywith-digimium.store/api/customer/google/callback`; in staging it is `https://test.buywith-digimium.store/api/customer/google/callback`. Add the two Google variables to each app privately and restart/redeploy. Validate staging before public activation. The current app uses External / Testing and requests only `openid email profile`, which Google exempts from the test-user allowlist requirement; publishing solely to permit these sign-ins is not required. Additional scopes change that rule, and Google Workspace/account restrictions can still apply. See [Google’s audience rules](https://support.google.com/cloud/answer/15549945?hl=en). Until valid credentials are configured, Google is unavailable. Telegram has its own setup below; phone remains Coming soon.

The first Google identity flow adds the identity/challenge tables and makes customer `password_hash` nullable, preserving existing hashes and orders. It requires CREATE, REFERENCES and ALTER privileges, or the equivalent administrator-applied migration. Back up these tables with the customer/session/order data. Existing local accounts are linked only after their password is confirmed. See [Google setup and Telegram code approval](LOGIN-PROVIDERS.md) for full setup and verification steps.

### Enable customer Telegram sign-in

The existing Hostinger app handles the login bot’s webhook at `APP_ORIGIN/api/customer/telegram/webhook`. No additional VPS or personal Telegram Web session is required. The approved **@digimium_login_bot** is tested on staging first, then deliberately moved to production. A bot has only one webhook, so only one environment can use it at a time; simultaneous staging/production login would require separate bots. Keep its token and webhook secret private, set the three Telegram environment variables above on the active app, and apply/redeploy.

With Node 24, register the webhook from a private local environment file:

```sh
node scripts/configure-telegram.mjs --env path/to/private.env
```

The script validates the bot ID/username, refuses by default to replace a webhook for a different URL, sends the secret with only `message`/`callback_query` updates, then verifies Telegram’s saved configuration. It does not print credentials or raw provider responses. See [the full login setup guide](LOGIN-PROVIDERS.md#telegram-login-choose-the-website-code-in-the-bot) for environment-specific URLs and real staging checks. `GET /api/customer/telegram` confirms configuration presence only; verify delivery with a real staging code selection before public activation.

After the real staging check, configure the production app and use its private environment file to perform the approved one-bot transfer:

```sh
node scripts/configure-telegram.mjs --env path/to/production.env --move-from https://test.buywith-digimium.store
```

The move is allowed only when the current webhook exactly matches that source origin’s Telegram webhook path; any other URL is left unchanged. After moving, remove the Telegram provider settings from staging and apply/redeploy. The same bot now supports on-demand order history and approved-plan remaining time. Adding or deploying these bot commands does not require changing the existing production webhook or moving the bot back to staging.

Customer bootstrap creates the Telegram identity table and makes existing customer email/password columns nullable without changing saved values. Telegram-only accounts use a stable numeric Telegram ID, a name, optional username and no invented email/password. They do not merge automatically with existing email/Google accounts. The protocol creates its expiring challenge table on first use. The app needs CREATE, REFERENCES and ALTER privileges; back up these tables with customer/session/order records.

### Check order history and remaining plan time in Telegram

The existing bot menu provides **📋 အော်ဒါမှတ်တမ်း** (`/history`) and **⏳ Plan သက်တမ်း** (`/plans`). `/start`, `/menu` and `/help` show the menu. History includes pending and approved orders; plans include approved purchases with dates, Myanmar-calendar remaining days, upcoming/ends-today/expired labels and a small visual time bar. Next, refresh, first-page and menu buttons keep long results readable.

The bot reads only the website customer mapped to the verified Telegram sender ID. Existing Google/email customers can use Connect Telegram in full Account settings through an exact-session-bound code challenge. Linking keeps their existing orders in the same account; identity conflicts are rejected without merging accounts or transferring orders. The bot does not claim guest orders or match purchases by email. An unlinked Telegram user receives website sign-in instructions. Purchase-account credentials and private delivery notes are excluded from bot messages. See [Telegram connection behavior](LOGIN-PROVIDERS.md#connect-telegram-to-an-existing-account) and [bot history behavior and verification](LOGIN-PROVIDERS.md#order-history-and-plan-time-in-the-bot).

Use local disposable databases and mocked webhook calls for isolation, pagination, date and credential-exclusion tests. Keep the single production bot’s webhook in production. After deployment, a customer may perform read-only menu/history/plan checks in their own private bot chat; do not create test purchases or approval records in production.

Publish the private-chat command list after deployment with Node 24:

```sh
node scripts/configure-telegram.mjs --env .env.telegram.production.local --commands-only
```

The private file is ignored by Git. This mode verifies the bot identity, registers and verifies the five commands and the commands menu button, and leaves the active webhook untouched. Do not use `--move-from` for this menu-only update.

### Customer and pending-order cleanup controls

Admin → Customers offers Edit and Delete. Editing changes name/email only; connected identity IDs remain read-only. Delete displays the account's order/entry counts and requires its exact displayed name, then permanently removes its owned data and sessions. Admin → Orders → Pending offers Remove, and Approved offers Delete, each with an exact order-reference confirmation. Approved deletion removes the stored order, plan dates and delivery details from subsequent customer history/plan reads. Conflicts require a fresh reload. The owner handles test-data cleanup himself; preserve Kosai Namti and inspect the selected account before confirming. See [customer controls](ADMIN-GIVEAWAY-LAYOUT-2026-11-15.md) and [approved-order deletion](APPROVED-ORDER-DELETION-2026-11-15.md).

## 4. Verify the live store

- In a private browser window, open `/`, search for a product and select a plan. **Buy / ဝယ်ယူမည်** opens checkout; **Add to cart** keeps selections for later. Signed-out checkout must show **Create account / အကောင့်ဖွင့်မည်** and **Buy on Telegram / Telegram မှဝယ်မည်**. The account form stays in the popup and returns to cart review after success without submitting an order. Telegram-only purchase displays the history notice and asks for no identity fields. Once signed in, show only **Place order / Order တင်မည်**, without the two signed-out choices.
- In a disposable test environment, submit an account order and verify that it first creates one pending record, then opens the Telegram draft with the order reference, selected plans and available verified name/email. The customer still sends the message and arranges payment and delivery in Telegram; admin approval records the subscription dates. Test a repeated guest request and the Guest label in admin without creating a customer account. Do not create test orders or approvals in production.
- Check the order-placed receipt and Telegram-open/copy fallback after returning to the website or reloading the same tab. Its bounded `sessionStorage` copy expires after 24 hours; an account receipt requires the original signed-in customer. Restoring it must not reopen Telegram automatically or clear a new cart, and must not imply payment or approval is complete.
- Open Account for its read-only inline profile, two recent purchased-plan previews and two pending rows. The overview API may supply up to three approved subscription lines, but the brief UI displays two. Open the gear button for full `/account` profile/settings, connected sign-in methods and the available password editor; this page omits order history. Open `/order-history` and switch between Approved, Pending and Rejected; pending orders can reopen their Telegram draft. Verify segmented semicircle remaining-day gauges, dates and upcoming/active/ends-today/expired/unknown-date labels against the saved dates.
- On mobile, check the floating Products / Cart / center Account / History / Help dock, its cart count and safe-area spacing. Account opens the inline panel; overlays and the keyboard hide the dock. Standalone account/history links return to the correct storefront panel. Confirm KBZPay, Wave, AYA Pay, UABpay and Binance logos are visible near the top and compactly in checkout, with no invented payment instructions or account details.
- If Google is configured, verify it using the separate staging checks in [the login guide](LOGIN-PROVIDERS.md): a new Google account, repeat sign-in, an existing-email password confirmation, cancellation, and checkout cart preservation. Do not use a live customer account for mutation tests.
- If Telegram is configured, verify a real staging sign-in with the four-digit website code and matching bot button, including QR cross-device use, Reject, wrong choice, refresh, cancellation and cart preservation. Repeated sign-in must use the same stable Telegram identity and must not silently merge email/Google accounts. Separately test full Account → Connect Telegram from an existing Google/email account: the challenge must require the same signed-in session, preserve its existing orders and reject an identity already connected elsewhere. See [the login guide](LOGIN-PROVIDERS.md#connect-telegram-to-an-existing-account).
- In the bot’s private chat, use `/history` and `/plans` for a Telegram-linked customer. Check pending versus approved status, dates and remaining time against that customer’s website history. Unknown users and other accounts must not see those purchases; no delivered account password should appear. Use the local mocked suites for cross-user and malformed-callback tests.
- Open `/admin`. Enter the configured admin email, then enter the six-digit code from the inbox in the same browser within 10 minutes. Close and reopen the same normal browser profile to confirm it remembers you. A fresh private window should ask for its own code. Open a product and confirm that the plan details match what you expect. Test an edit on an unpublished service, upload a small logo, save it and reload. The edit and logo should persist after a restart.
- Sign out. Opening `/admin` should ask you to sign in again. The customer storefront should still be accessible. A signed-out request to `/api/admin/catalog` should return `401`.

## 5. Connect a staging subdomain and release updates

To give staging a permanent address, choose **Connect domain** in its dashboard and enter a testing subdomain. Follow Hostinger’s DNS instructions, wait for HTTPS, update `APP_ORIGIN`, restart and request a fresh code on that hostname.

Staging tracks `testing`. To release verified changes to the live shop, merge them into `production` and push. Hostinger reads each app’s environment variables from its own dashboard. The active production catalog and uploaded logos stay in MySQL across code deployments. Back up the whole database so edits and image bytes can be restored together.

[Connecting a custom domain on Hostinger](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)

## If setup stalls

| Symptom | What to check |
| --- | --- |
| Private repository missing | In GitHub, edit the Hostinger GitHub App's repository access and select `digimium_website_final`. |
| App builds but catalog will not load | Check database host, prefixed database/user names, DB password and import success. `/api/catalog` should return JSON with HTTP 200. |
| Fonts or product images are missing | Build with the repository's `npm run build`, which adds `public` and `.next/static` to the server bundle. |
| Admin login or save fails after a domain change | Confirm `APP_ORIGIN` exactly matches the browser's HTTPS origin, including `www` or a subdomain. Apply changes and restart. |
| Code email missing | Check the configured owner inbox and its spam folder. In the Resend email log, check the sending domain, sender address, API key permissions and delivery status. Request another code in the same browser after the cooldown. |
| OTP sign-in unavailable | Confirm the OTP tables exist in the selected app’s database and the app has the full admin, Resend and database settings above. Restart the Node app after applying changes. |
| Auto-deploy did not start | Check the selected branch and the commit shown under Deployments. |

## Existing Sites data

Git includes the starting catalog, built-in marks, typography, cart and admin application. A separate hosted database may contain later edits, hidden plans or uploaded images. Back up the complete authenticated catalog and its uploaded images from the old account before moving that live data. For small catalogs, use the new admin to reapply edits and re-upload logos. Keep the old site available until you verify its replacements. See [deployment and recovery](DEPLOYMENT.md) for how source and runtime backups differ.
