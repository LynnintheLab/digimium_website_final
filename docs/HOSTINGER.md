# Host Digimium on Hostinger Business or Cloud

Use a **Node.js Web App** with a Hostinger MySQL database. The app serves the storefront, `/admin`, and the catalog and image APIs from the same HTTPS address. Hostinger can build it directly from the GitHub repository. You can complete these steps in hPanel without SSH.

Both Hostinger apps use email-code login. For an existing password-based deployment, keep its database connection, import the updated schema from step 2 into that database, then apply its own admin and Resend settings from step 3.

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

Customer registration and orders create their additional tables on first use. Give the app user CREATE and REFERENCES privileges on its database or import [customer-auth-schema.sql](../hostinger/customer-auth-schema.sql) followed by [order-schema.sql](../hostinger/order-schema.sql). Fresh tables use CREATE TABLE IF NOT EXISTS. Existing order tables also require ALTER permission: the app makes customer_id nullable and adds guest_key, guest_name and a unique guest/request index on first use. This preserves existing orders and encrypted fulfillment. Importing the CREATE statements alone does not migrate an existing table. Back up the customer and order tables together with the existing database.

[Hostinger's database connection guide](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)

## 3. Set the private application values

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

Store the effective order encryption secret in a private backup with the database recovery instructions. If orders were fulfilled using the fallback, set `ORDER_FULFILLMENT_SECRET` to the original admin secret before rotating `ADMIN_AUTH_SECRET`. Changing the effective encryption key requires re-encrypting existing fulfillment data.

Generate the secret locally and paste the output into the private environment settings.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Click **Apply changes** and **Restart** the running Node application. Use **Redeploy** if hPanel offers that action instead. Access `/admin` on the hostname in `APP_ORIGIN`.

[Hostinger's environment variable guide](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/)

## 4. Verify the live store

- In a private browser window, open `/` and search for a product. Select a plan and use **Add to cart**. Reopen the cart and check that **Continue to Telegram** offers a name-only guest form with an optional sign-in link and a notice about account history. In a test environment, register a customer, save an order, inspect the Telegram draft with its name/email/reference, approve it in admin, then verify dates in the customer account. Verify guest ordering in a disposable test environment, including a repeated request, and check the Guest label in admin. Open the storefront account panel for its three-plan preview and password settings; open Order history for all approved purchases and remaining time.
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
