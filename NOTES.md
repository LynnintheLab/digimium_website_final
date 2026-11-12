# Digimium project notes

## Current status

The public storefront uses Google Tag Manager container `GTM-M7S62K8J` on both Hostinger domains. It sends visitor activity to GA4 stream `G-5LML9P3RE0`. In Analytics reports, filter the Host name to `buywith-digimium.store` for production traffic.

The live Hostinger shop at `https://buywith-digimium.store` tracks `production`. This release promotes the revised Myanmar storefront, mobile catalog, Telegram checkout and Resend email-code admin sign-in from `testing`. Each Hostinger app uses its own origin and database. See [the Hostinger guide](docs/HOSTINGER.md) for the production OTP settings and schema.

The storefront uses the original blue Digimium symbol as its favicon. The branded messaging preview supplies a title, description and 1200 × 630 image in the initial HTML.

The catalog shows two product cards per row up to 700px and three above. Checkout empties the browser cart immediately and keeps the full order available on the Telegram handoff screen.

The shared catalog starts with 54 products and 104 plans, including the 50 approved visible plans. The bilingual storefront, cart, Telegram checkout, mobile UI and existing brand assets are included. On Hostinger, MySQL persists admin changes and uploaded logo bytes. The earlier ChatGPT Sites target retains separate D1/R2 storage and ChatGPT authorization. Its live data is outside Git.

## Last thing done

Installed the owner's Google tag on the customer storefront. The admin login opens the shop in a fresh document so admin navigation stays outside storefront analytics.

Promoted the tested storefront through `f3ae54d` to production. The Node 24 build, type checks and all eight unit tests passed.

Restored the original transparent blue favicon for storefront and admin tabs at the owner's request.

Added the storefront share card using the Digimium logo, blue gradient and “Digital. Premium. Make Simple.” tagline. Verified the packaged Hostinger response and image with Telegram, WhatsApp, Facebook, Slack and X crawler user agents. Type checking, eight unit tests and the Hostinger build passed.

Rechecked the imported catalog and logo against the three earlier checkouts. Updated the Myanmar search prompt to “Product (သို့) Plan ရှာမယ်” and replaced the previous product term across storefront labels. Hid the native page scrollbar while retaining normal scrolling and the custom ruler. Verified the packaged storefront with WebKit at 320, 390, 768 and 1280px. A two-tab Chromium check verified cart clearing, clipboard contents, a fresh subsequent order and the empty cart after reload. Hostinger and Sites builds, type checking and all eight unit tests passed.

The owner imported all six staging tables. The private testing environment file now uses the assigned test origin, the staging database, and Resend’s built-in sender. The configured receiving inbox must match the Resend account email.

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

Open Google Analytics **Reports → Realtime** to see recent storefront activity.

Verify delivery of a production admin sign-in code to the owner inbox. The live app needs its own OTP tables and private Resend settings as described in [the Hostinger guide](docs/HOSTINGER.md).

Check the share preview and a checkout draft on a phone running Telegram.
