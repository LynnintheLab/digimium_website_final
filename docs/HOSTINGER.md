# Host Digimium on Hostinger Business or Cloud

Use a **Node.js Web App** with a Hostinger MySQL database. The app serves the storefront, `/admin`, and the catalog and image APIs from the same HTTPS address. Hostinger can build it directly from the private GitHub repository. You can complete these steps in hPanel without SSH.

This guide on `testing` sets up email-code login for a separate staging site. The live shop uses the configuration in the [production branch guide](https://github.com/LynnintheLab/digimium_website_final/blob/production/docs/HOSTINGER.md).

## 1. Create the web app

1. Open **Websites → Create site → Web App → Import Git Repository**. The option may be labelled **Node.js Web App**.
2. Connect the GitHub account that owns the repository. Give the Hostinger GitHub App access to `LynnintheLab/digimium_website_final` and select it in hPanel.
3. Choose branch **`testing`** for a separate staging web app. Use its temporary HTTPS address or a testing subdomain.
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

1. In GitHub, open [`hostinger/schema.sql`](../hostinger/schema.sql) on `testing` and choose **Download raw file**. Keep the `.sql` extension.
2. In your website dashboard, open **Databases → Management**. Create a MySQL database, a database user, and a unique password. Save the **full database name and username**, including Hostinger's prefix.
3. Open **phpMyAdmin** for that database. Select the database in the left sidebar, open **Import**, choose the downloaded SQL file, and run the import. For an existing staging database, import the updated schema on this branch before requesting a code. It adds the OTP tables alongside the catalog, logo and admin session tables. It preserves existing rows when rerun.
4. Leave the new catalog table empty. The application starts with the bundled 54 products and 50 publicly visible plans. Its first successful admin save writes the catalog to MySQL.

[Hostinger's database connection guide](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)

## 3. Set the private application values

In Resend, add the domain or subdomain you want to send from. Copy the DNS records Resend gives you into your DNS provider and wait until the domain shows **Verified**. Create a **Sending access** API key scoped to that domain and copy it into the staging app’s private settings. The sender can be an address such as `admin@auth.example.com` if `auth.example.com` is verified. The receiving admin inbox can be a Gmail address. [Resend domains](https://resend.com/docs/dashboard/domains/introduction) · [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction)

For a new deployment, download the [Hostinger environment template](../hostinger/.env.example), save a private copy with the extension `.env`, and fill in the values below. In **Review build settings → Environment variables → Edit**, choose **Import .env**, review the values, then select **Finish**. Hostinger keeps existing values for matching keys, so correct any earlier entries manually. [Hostinger’s import instructions](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)

For an existing deployment, you can enter the same values directly in the web app dashboard’s **Environment variables** section. Use the database belonging to the testing app. Keep completed files outside the repository.

| Name | What to enter |
| --- | --- |
| `DB_HOST` | `127.0.0.1` for a database on this hosting plan |
| `DB_PORT` | `3306` |
| `DB_NAME` | Full database name from step 2 |
| `DB_USER` | Full database username from step 2 |
| `DB_PASSWORD` | Database user's password |
| `APP_ORIGIN` | Exact HTTPS origin for this testing web app, such as `https://testing.example.com`, without a path |
| `ADMIN_EMAIL` | Owner inbox that receives the login codes |
| `ADMIN_AUTH_SECRET` | Private random secret of at least 32 characters. Generate one with the command below and keep it across redeploys. Rotating it revokes remembered sessions and pending codes. |
| `RESEND_API_KEY` | Resend sending key for the verified domain |
| `RESEND_FROM_EMAIL` | Sender address on the verified domain |

Generate the secret locally and paste the output into the private environment settings.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Click **Apply changes** and **Restart** the running Node application. Use **Redeploy** if hPanel offers that action instead. Access `/admin` on the hostname in `APP_ORIGIN`.

[Hostinger's environment variable guide](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/)

## 4. Verify the live store

- In a private browser window, open `/` and search for a product. Select a plan and use **Add to cart**. Reopen the cart and check that **Checkout on Telegram** prepares a draft for the store's Telegram contact.
- Open `/admin`. Enter the configured admin email, then enter the six-digit code from the inbox in the same browser within 10 minutes. Close and reopen the same normal browser profile to confirm it remembers you. A fresh private window should ask for its own code. Open a product and confirm that the plan details match what you expect. Test an edit on an unpublished service, upload a small logo, save it and reload. The edit and logo should persist after a restart.
- Sign out. Opening `/admin` should ask you to sign in again. The customer storefront should still be accessible. A signed-out request to `/api/admin/catalog` should return `401`.

## 5. Connect a staging subdomain and release updates

To give staging a permanent address, choose **Connect domain** in its dashboard and enter a testing subdomain. Follow Hostinger’s DNS instructions, wait for HTTPS, update `APP_ORIGIN`, restart and request a fresh code on that hostname.

The staging app can track `testing`. The live shop tracks `production`. A future OTP release to the live shop requires importing its new schema and setting its own Resend and admin variables before promoting the branch. The active production catalog and uploaded logos stay in MySQL across code deployments. Back up the whole database so edits and image bytes can be restored together.

[Connecting a custom domain on Hostinger](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)

## If setup stalls

| Symptom | What to check |
| --- | --- |
| Private repository missing | In GitHub, edit the Hostinger GitHub App's repository access and select `digimium_website_final`. |
| App builds but catalog will not load | Check database host, prefixed database/user names, DB password and import success. `/api/catalog` should return JSON with HTTP 200. |
| Fonts or product images are missing | Build with the repository's `npm run build`, which adds `public` and `.next/static` to the server bundle. |
| Admin login or save fails after a domain change | Confirm `APP_ORIGIN` exactly matches the browser's HTTPS origin, including `www` or a subdomain. Apply changes and restart. |
| Code email missing | Check the configured owner inbox and its spam folder. In the Resend email log, check the sending domain, sender address, API key permissions and delivery status. Request another code in the same browser after the cooldown. |
| OTP sign-in unavailable | Confirm the testing schema is installed and the app has the full admin, Resend and database settings above. Restart the Node app after applying changes. |
| Auto-deploy did not start | Check the selected branch and the commit shown under Deployments. |

## Existing Sites data

Git includes the starting catalog, built-in marks, typography, cart and admin application. A separate hosted database may contain later edits, hidden plans or uploaded images. Back up the complete authenticated catalog and its uploaded images from the old account before moving that live data. For small catalogs, use the new admin to reapply edits and re-upload logos. Keep the old site available until you verify its replacements. See [deployment and recovery](DEPLOYMENT.md) for how source and runtime backups differ.
