# Digimium project notes

## Current status

Digimium is deployed at `https://buywith-digimium.store` on Hostinger. The public catalog responds successfully. Admin sign-in is waiting on an hPanel configuration correction. `production` is the stable GitHub branch and `testing` is the working branch. The hPanel deployment steps, environment names, and database setup are in [the Hostinger guide](docs/HOSTINGER.md).

The shared catalog starts with 54 products and 104 plans, including the 50 approved visible plans. The bilingual storefront, cart, Telegram checkout, mobile UI and existing brand assets are included. On Hostinger, MySQL persists admin changes and uploaded logo bytes. The earlier ChatGPT Sites target retains separate D1/R2 storage and ChatGPT authorization. Its live data is outside Git.

## Last thing done

Checked the production catalog and signed-out admin API. The catalog read from MySQL succeeded. The signed-out admin API returned HTTP 503, which the Hostinger auth adapter returns before checking credentials when the runtime admin settings are incomplete or invalid.

Added an importable Hostinger-only environment template at `hostinger/.env.example` and documented the hPanel import flow. Completed environment files belong outside the repository.

Added the Node 24/Next.js standalone build, Hostinger database schema and storage adapter, and an independent admin login. The build includes CSS, fonts and logos. Updated the owner and developer guides for both targets.

Tested the Node 24 production server with disposable MariaDB, including concurrent saves, hidden plan/description filtering, image bytes, and data surviving an application restart. Verified sign-in, signed-out and forged-header denial, CSRF checks, sign-out and session invalidation, and a simulated HTTPS proxy with a Secure HttpOnly cookie. Unit tests, type checks, the separate Sites build, and local Sites catalog/logo integration suites passed. No real customer message was sent.

## Next steps

Update the admin password in hPanel to a private value between 16 and 256 characters, confirm the admin email and HTTPS origin, and apply the settings. Verify that a signed-out request to `/api/admin/catalog` returns 401 and that the owner can sign in. Then confirm Telegram drafts and admin persistence on the live domain. If the older site contains later admin edits or uploaded logos, migrate that data from an authorized backup. Keep development on `testing` and maintain MySQL backups separately from Git.
