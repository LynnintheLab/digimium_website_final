# Digimium project notes

## Current status

Digimium’s default deployment target is a Hostinger Business or Cloud Node.js Web App. `production` is the stable GitHub branch and `testing` is the working branch. The hPanel deployment steps, environment names, and database setup are in [the Hostinger guide](docs/HOSTINGER.md). Hostinger account setup and live deployment are pending.

The shared catalog starts with 54 products and 104 plans, including the 50 approved visible plans. The bilingual storefront, cart, Telegram checkout, mobile UI and existing brand assets are included. On Hostinger, MySQL persists admin changes and uploaded logo bytes. The earlier ChatGPT Sites target retains separate D1/R2 storage and ChatGPT authorization. Its live data is outside Git.

## Last thing done

Added the Node 24/Next.js standalone build, Hostinger database schema and storage adapter, and an independent admin login. The build includes CSS, fonts and logos. Updated the owner and developer guides for both targets.

Tested the Node 24 production server with disposable MariaDB, including concurrent saves, hidden plan/description filtering, image bytes, and data surviving an application restart. Verified sign-in, signed-out and forged-header denial, CSRF checks, sign-out and session invalidation, and a simulated HTTPS proxy with a Secure HttpOnly cookie. Unit tests, type checks, the separate Sites build, and local Sites catalog/logo integration suites passed. No real customer message was sent.

## Next steps

Connect the private GitHub repository to Hostinger, select `production`, import `hostinger/schema.sql`, and enter the owner’s private values in hPanel. Confirm HTTPS, storefront browsing, Telegram drafts, and admin persistence on the actual domain. If the older site contains later admin edits or uploaded logos, migrate that data from an authorized backup. Keep development on `testing` and maintain MySQL backups separately from Git.
