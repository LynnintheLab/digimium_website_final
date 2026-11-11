# Digimium project notes

## Current status

The live Hostinger shop at `https://buywith-digimium.store` tracks `production` and uses password-based admin sign-in. The `testing` branch includes the revised Myanmar storefront, a sticky blurred menu, aligned Telegram and Viber contact links, Resend admin sign-in and Telegram checkout with ordinary spaces. Staging setup, private environment variables and database import steps are in [the Hostinger guide](docs/HOSTINGER.md).

The shared catalog starts with 54 products and 104 plans, including the 50 approved visible plans. The bilingual storefront, cart, Telegram checkout, mobile UI and existing brand assets are included. On Hostinger, MySQL persists admin changes and uploaded logo bytes. The earlier ChatGPT Sites target retains separate D1/R2 storage and ChatGPT authorization. Its live data is outside Git.

## Last thing done

Prepared the owner's private testing environment file with a proposed staging database name, matching user, generated database password and Resend sender. The owner still needs to create that database user, verify the sending domain, and enter the assigned staging HTTPS origin and Resend key in the private file before deploying.

Compared the three earlier saved site folders with this checkout. All four have identical imported catalog data and the same logo, with 54 initial products, 104 plans and 50 published plans. The GitHub checkout also has the Hostinger build and the later OTP and Telegram draft fixes.

Applied the owner’s Myanmar hero, catalog, About, ordering and contact copy. The testing storefront uses Digimium’s Persian Blue, Egyptian Blue and Navy palette. The social buttons use the two services’ colors and logos. Verified the sticky menu, aligned contacts, product picker and cart checkout at 320, 390, 768, 1024 and 1440px in Chromium. Checked the revised guide and contact anchor in both languages on phones, tablets and desktop.

Added a fixed 37-tick scroll-position indicator to the right gutter. Chromium checks covered wheel scrolling, clicking and dragging the desktop rail, keyboard navigation, mobile touch scrolling, and hiding the indicator when a menu or order dialog opens. Mobile uses a narrower, display-only ruler.

Updated Telegram checkout links to encode spaces as `%20`. Product dialogs, the cart and links for reopening an order use the same encoding. Long orders now account for the extra URL length when splitting into messages. All eight unit tests passed. A 390px browser check on the packaged Hostinger app confirmed that both Canva checkout links decode to the exact three lines on the clipboard. Native Telegram rendering still needs a device check.

Added a two-step email sign-in to the Hostinger testing build. Verified browsers receive a persistent session. The featured collection divider now spans the full panel width, with the existing product-row padding preserved. Browser layout checks measured both divider ends at 320, 390, 620, 768, 1024 and 1440 pixels.

On Node 24, both deployment builds, type checking and six unit tests passed. The packaged Hostinger server passed the OTP and catalog integration suite against disposable MariaDB with simulated Resend delivery. A separate mobile-sized Chromium test submitted a code, closed and reopened the browser, verified the original profile stayed signed in, and confirmed a second profile and the signed-out first profile each needed a code. The login forms also fit a 320px viewport. Live inbox delivery still needs a configured staging sender.

The previous production check found the public catalog readable and the signed-out admin API returning 503 due to its runtime admin configuration.

Added an importable Hostinger-only environment template at `hostinger/.env.example` and documented the hPanel import flow. Completed environment files belong outside the repository.

Added the Node 24/Next.js standalone build, Hostinger database schema and storage adapter, and an independent admin login. The build includes CSS, fonts and logos. Updated the owner and developer guides for both targets.

Tested the Node 24 production server with disposable MariaDB, including concurrent saves, hidden plan/description filtering, image bytes, and data surviving an application restart. Verified sign-in, signed-out and forged-header denial, CSRF checks, sign-out and session invalidation, and a simulated HTTPS proxy with a Secure HttpOnly cookie. Unit tests, type checks, the separate Sites build, and local Sites catalog/logo integration suites passed. No real customer message was sent.

## Next steps

Open a Canva checkout from the testing build on a device running Telegram and check the draft’s spacing before release.

Connect a separate Hostinger staging app to `testing`, import the branch’s schema into the staging database, and configure its private Resend sender, API key, admin secret, owner inbox and HTTPS origin. Verify delivery to the real inbox, reopening the same browser, signing in from a second profile, and sign-out. The live shop continues to use the password-based setup in the production branch guide.
