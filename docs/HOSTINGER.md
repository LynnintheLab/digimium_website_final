# Host Digimium on Hostinger Business or Cloud

Use a **Node.js Web App** with a Hostinger MySQL database. The app serves the storefront, `/admin`, and the catalog and image APIs from the same HTTPS address. Hostinger can build it directly from the private GitHub repository. You can complete these steps in hPanel without SSH.

## 1. Create the web app

1. Open **Websites → Create site → Web App → Import Git Repository**. The option may be labelled **Node.js Web App**.
2. Connect the GitHub account that owns the repository. Give the Hostinger GitHub App access to `LynnintheLab/digimium_website_final` and select it in hPanel.
3. Choose branch **`production`**. Use a temporary domain to verify the store before pointing your shop domain at it.
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

1. In GitHub, open [`hostinger/schema.sql`](../hostinger/schema.sql) on `production` and choose **Download raw file**. Keep the `.sql` extension.
2. In your website dashboard, open **Databases → Management**. Create a MySQL database, a database user, and a unique password. Save the **full database name and username**, including Hostinger's prefix.
3. Open **phpMyAdmin** for that database. Select the database in the left sidebar, open **Import**, choose the downloaded SQL file, and run the import. The script creates the catalog, logo and admin authentication tables. It preserves existing rows when rerun.
4. Leave the new catalog table empty. The application starts with the bundled 54 products and 50 publicly visible plans. Its first successful admin save writes the catalog to MySQL.

[Hostinger's database connection guide](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)

## 3. Set the private application values

Open the web app dashboard's **Environment variables** section. Enter each name and value separately. Use a password manager to generate distinct database and admin passwords. Keep these values in hPanel.

| Name | What to enter |
| --- | --- |
| `DB_HOST` | `127.0.0.1` for a database on this hosting plan |
| `DB_PORT` | `3306` |
| `DB_NAME` | Full database name from step 2 |
| `DB_USER` | Full database username from step 2 |
| `DB_PASSWORD` | Database user's password |
| `APP_ORIGIN` | Exact HTTPS address customers will visit, such as `https://shop.example.com`, without `/admin` or a trailing slash |
| `ADMIN_EMAIL` | Email you want to use for Digimium admin |
| `ADMIN_PASSWORD` | A unique generated password of at least 16 characters for that login |

Click **Apply changes** and **Restart** the running Node application. Use **Redeploy** if hPanel offers that action instead. Access `/admin` on the hostname in `APP_ORIGIN`.

[Hostinger's environment variable guide](https://www.hostinger.com/support/how-to-edit-or-add-environment-variables-after-deployment/)

## 4. Verify the live store

- In a private browser window, open `/` and search for a product. Select a plan and use **Add to cart**. Reopen the cart and check that **Checkout on Telegram** prepares a draft for the store's Telegram contact.
- Open `/admin`. Sign in with the store credentials from step 3. Open a product and confirm that the plan details match what you expect. Test an edit on an unpublished service, upload a small logo, save it and reload. The edit and logo should persist after a restart.
- Sign out. Opening `/admin` should ask you to sign in again. The customer storefront should still be accessible. A signed-out request to `/api/admin/catalog` should return `401`.

## 5. Connect your shop domain and release updates

Once the temporary address works, choose **Connect domain** in the Node app's dashboard. Follow Hostinger's DNS instructions and wait for HTTPS to work. Update `APP_ORIGIN` to that final HTTPS address, apply changes, restart, and repeat the admin login and save check on the new hostname. Leave the existing shop/DNS in place until you're ready to switch.

Develop on `testing`. When a change is ready, merge it into `production` and push. In hPanel, enable automatic deployments for **`production`** or redeploy that branch manually. An independent staging website needs its own database, credentials and origin. The active production catalog and uploaded logos stay in MySQL across code deployments. Back up the whole database so edits and image bytes can be restored together.

[Connecting a custom domain on Hostinger](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)

## If setup stalls

| Symptom | What to check |
| --- | --- |
| Private repository missing | In GitHub, edit the Hostinger GitHub App's repository access and select `digimium_website_final`. |
| App builds but catalog will not load | Check database host, prefixed database/user names, DB password and import success. `/api/catalog` should return JSON with HTTP 200. |
| Fonts or product images are missing | Build with the repository's `npm run build`, which adds `public` and `.next/static` to the server bundle. |
| Admin login or save fails after a domain change | Confirm `APP_ORIGIN` exactly matches the browser's HTTPS origin, including `www` or a subdomain. Apply changes and restart. |
| Auto-deploy did not start | Check the selected branch and the commit shown under Deployments. |

## Existing Sites data

Git includes the starting catalog, built-in marks, typography, cart and admin application. A separate hosted database may contain later edits, hidden plans or uploaded images. Back up the complete authenticated catalog and its uploaded images from the old account before moving that live data. For small catalogs, use the new admin to reapply edits and re-upload logos. Keep the old site available until you verify its replacements. See [deployment and recovery](DEPLOYMENT.md) for how source and runtime backups differ.
