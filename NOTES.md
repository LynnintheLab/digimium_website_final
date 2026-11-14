# Digimium project notes

## Current status

Telegram login now has a five-minute four-digit challenge, Open Telegram, locally generated optional QR, refresh/cancel controls and approval polling. The bot sends four distinct choices plus Reject; only the matching choice from the bound Telegram user/chat/message can approve. The original browser alone consumes that approval into a customer session. Telegram-only customers have real Telegram IDs and optional usernames, with nullable email/password; admin, checkout drafts and website order history support that identity. Existing email/Google identities and purchases are preserved.

The owner approved one new bot, @digimium_login_bot, which has been created and verified with the Bot API. Private credentials are in ignored owner-only .env.telegram.testing.local and .env.telegram.production.local files. The next setup is real staging authentication, then an explicit webhook move to production and removing Telegram settings from staging. One bot has one active webhook environment. Future Telegram order-history commands are planned separately; this release implements login only. No separate VPS or personal Telegram Web sign-in is required.

Account and history now use a clearer type hierarchy: bold customer/service names, separate plan/duration/unit-price lines, prominent totals and distinct pending/approved labels. Latin text uses Manrope and Myanmar glyphs use Wa Lone in account body and headings. Active terms use emerald, urgent/pending use amber, expired terms use muted red, and other states retain their labels. The white account panel keeps its heading/close control pinned while scrolling; pending Telegram instructions appear once per section with a clear action on each order.

Customer login uses one shared chooser in Account, Order history and checkout. Google OAuth is enabled on both Hostinger apps after deployment of implementation commit 655ff86 and private configuration of GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. The approved Digimium Store Web client has both live/staging origins and exact callbacks. Its credential pair remains private in the ignored .env.google.local file and an owner-only outputs/google-login.env import copy. Real Google sign-in succeeded on staging and the session persisted across reload. Both public capability endpoints return enabled true, both catalogs return 54 products, and the existing live password-based account remains signed in. Production checks were read-only; no production OAuth account was created or linked. Telegram code-choice login is implemented and stays unavailable until its bot credentials and webhook are configured. Phone remains Coming soon. Email-first sign-in remains available. See [LOGIN-PROVIDERS.md](docs/LOGIN-PROVIDERS.md) for setup and the requested future Telegram code-selection bot flow.

The storefront, Account and Order history default to Myanmar. An explicit English language selection persists. The initial HTML language matches that preference; the English admin subtree is marked separately.

Hostinger checkout offers Buy with an account or Buy on Telegram. Account login/registration stays inside the order popup and returns to the unchanged cart for review. Telegram-only checkout asks for no name or email and first explains that the purchase and expiry date will not appear in website history. That choice stays outside account history even if the browser is signed in. Both paths save an admin tracking record before opening a prepared Telegram message; customers send it and arrange payment and service access in the chat. Admin matches direct orders by reference and records dates. Older named guest orders and clients remain compatible. See [the deployment guide](docs/HOSTINGER.md) for schema permissions and backups.

Account opens inline and shows profile/password settings, a maximum of three recent approved subscription lines, and pending Telegram drafts. View all orders and the Order history navigation link beside Contact open `/order-history`. Both brief and full history show remaining days and a remaining-time bar. Calendar dates follow Myanmar time: an end date is Ends today until the next day, with separate upcoming, expired and unknown-date states. Historical access details are returned only by the full signed-in order view.

Ten floating service-logo tiles surround all four edges of the showcase, with mixed sizes, clustered placements and open gaps. Best Seller badges use a bright gold background and filled star. Marked plans have a pale gold gradient and amber border; the selected plan has a blue outline and checked radio. The large watermark is stationary. A footer motion control, page visibility and the system reduced-motion preference govern animation. Phones support horizontal swipes, and multiple slides retain arrow and dash navigation.

Both public catalogs returned 54 products at the start of this showcase update. Production had two published ChatGPT plans marked Best Seller. Offer selections and prices reflect each site's current MySQL data.

The original Best Seller and showcase release was `4eee1ff`. See [HANDOFF.md](HANDOFF.md) for the continuation guide and access inventory.

Products and plans have independent Best Seller flags. The landing showcase cycles every seven seconds through marked offers, gift promotions and discounted plans, then uses category collections when no promotion or discount is available. Offer links select the displayed plan. Motion pauses for interaction and respects reduced-motion preferences.

The current release includes editable gift durations and discounts. Services and individual plans support an optional gift duration and a discounted MMK price. The storefront, cart and Telegram draft use the selected offer’s paid and gift periods and its current sale price.

The admin editor accepts a duration quantity and a day, month or year for services and plans. Plans can be moved up or down. Saving the catalog sets the order customers see in the plan picker and the first visible plan on the service card.

The public storefront uses Google Tag Manager container `GTM-M7S62K8J` on both Hostinger domains. The recorded GA4 stream is `G-5LML9P3RE0`; authenticated Analytics delivery was not rechecked in this handoff session. In Analytics reports, filter the Host name to `buywith-digimium.store` for production traffic.

The live Hostinger shop at `https://buywith-digimium.store` tracks `production`. This release promotes the revised Myanmar storefront, mobile catalog, Telegram checkout and Resend email-code admin sign-in from `testing`. Each Hostinger app uses its own origin and database. See [the Hostinger guide](docs/HOSTINGER.md) for the production OTP settings and schema.

The storefront uses the original blue Digimium symbol as its favicon. The branded messaging preview supplies a title, description and 1200 × 630 image in the initial HTML.

The catalog shows two product cards per row up to 700px and three above. Hostinger checkout clears the cart on server confirmation. Sites checkout retains its Telegram draft handoff.

The shared catalog starts with 54 products and 104 plans, including the 50 approved visible plans. The bilingual storefront, cart, Telegram checkout, mobile UI and existing brand assets are included. On Hostinger, MySQL persists admin changes and uploaded logo bytes. The earlier ChatGPT Sites target retains separate D1/R2 storage and ChatGPT authorization. Its live data is outside Git.

## Last thing done

Implemented the Telegram protocol, identity storage, code/QR UI, order/admin compatibility and guarded webhook setup CLI. Node 24 standalone/Sites builds, 34 unit tests, focused ESLint, direct identity tests, disposable-MariaDB Telegram protocol/commerce suites and full Google protocol/race regression passed. Google and Telegram mutations serialize across form remounts; delayed cancellation cannot overwrite a newer binding. Explicit Google fallback suppresses Telegram auto-resume. Sites still returns 404 for provider endpoints and 54 public products.

Created the approved @digimium_login_bot through BotFather, captured its credential privately and verified its exact identity with getMe. No bot token or webhook secret is part of Git. The setup CLI validates bot identity, refuses another webhook and permits a move only from an explicitly supplied exact origin. Real bot integration and final UI regression checks are still pending at this checkpoint.

Implemented Google sign-in with PKCE, verified ID-token claims, stable Google identities, browser-bound expiring challenges and first-party customer sessions. Existing email/password accounts require their password once before linking; new Google-only accounts have no website password. Checkout returns to the unchanged cart. Cancellation, overlapping attempts and popup-close fallback are tied to the original flow, so late callbacks cannot complete a cancelled attempt or replace a newer attempt. Created the approved Google Cloud External/Testing app and Web client with only openid/email/profile scopes. Secrets are private and ignored; no provider credentials were added to Git. On the owner’s instruction, the existing approved Google client pair was added to both Hostinger apps and applied. The extension file upload was unavailable, so hPanel’s individual environment-variable controls were used without exposing secret values in chat. Staging Google authentication completed with the approved owner account, showed Signed in with Google and persisted after reload. Production was promoted and its saved Google settings and healthy capability/catalog/account responses were verified.

Node 24 standalone and Sites builds, type checking, focused ESLint, 23 unit tests, disposable-MariaDB commerce and Google protocol/race integration passed. Browser fixtures passed desktop English and WebKit 320px Myanmar, including actual popup origin/source checks, wrong-password linking/retry, missing-name completion, blocked/closed popups, stale responses, fixed fallback navigation, cart preservation and Google-only settings. Real staging Google authentication passed after the simulated protocol tests; production verification used read-only checks. The fresh local Sites Worker returned 404 for all Google endpoints and 200 with 54 public products, preserving the separate target. Sites build route types overwrite the Next generated declarations; regenerate with next typegen before a standalone typecheck after switching build targets.

Refined account/history clarity from the owner’s screenshots using the existing fonts, stronger weights, restrained status colors and clearer grouping. Localized unit prices/totals consistently, kept quantity separate, and removed repeated long Telegram guidance from each order. Kept all pending orders, the three-line history preview, full history dates and Telegram draft behavior. Node 24 standalone build, types, focused ESLint and all 23 unit tests passed. Chromium1440/390 English and WebKit320 Myanmar fixtures covered long emails/plans, duplicate-service subscriptions, active/expired/urgent states, three pending orders, no overflow and a pinned panel heading.

Replaced the separate login/register forms with a shared email-first flow and clearly disabled Coming soon provider choices, as requested. Added a private, same-origin, rate-limited email routing endpoint that returns only the next step. Retained the original session, registration, password and checkout behavior. Documented future Google, Telegram and SMS setup using official provider guides. Node 24 build, types, 23 unit tests and the full disposable-MariaDB commerce integration passed. Chromium desktop English and WebKit 320px Myanmar verified all four customer login surfaces, the registration/password/name sequence, no customer creation before final submission, existing-password errors/recovery, and checkout returning to the original cart. Rendered chooser, password and checkout views were inspected. Real providers are intentionally disabled; no SMS or provider account was created.

Made Myanmar the default and preserved explicit English across reloads and account/history routes. Replaced the guest-name step with a Telegram notice and two purchase choices in the cart. Reused login/register within the same native checkout dialog, with busy guards and a return to cart review. Text field focus uses a single fine border with an aligned keyboard outline. Narrow phones stack purchase buttons for readable Myanmar labels.

Verified the Node 24 standalone build, Sites build, types, 23 unit tests and expanded disposable-MariaDB commerce suite. Chromium desktop and WebKit 320px tested invalid-login recovery, sign-in/register, cart quantity preservation, no page navigation, busy Escape/close guards, and no order submission until explicit purchase. Actual guest API browser checks in Myanmar at 1280/320px and English at 390px verified no name fields, history notice, successful retries after a lost response and page reload, correct Telegram reference, and language persistence. The final 320px and 1280px review confirmed a single aligned 1px focus border, readable stacked purchase actions at 320px, and reachable submit controls at a short 450px viewport height. All external message navigation was intercepted; no real message was sent.

Added name-only guest checkout, admin guest identification, safe retry identity, and optional sign-in. Split account history into a three-plan preview and a dedicated full history page with subscription duration visuals. Node 24 standalone build, types, 23 unit tests, focused ESLint (existing image warnings only), and the expanded MariaDB commerce integration suite passed. Integration covers an existing-schema migration, customer/guest isolation, concurrent retries, rate limits, admin approval and history response scoping. Chromium at 390px and WebKit at 320px verified English/Myanmar guest forms, Telegram identity without invented email, lost-response retry and repeat checkout. The guest retry also retained its original order after a page reload. History fixtures covered desktop 1440px, English 390px, Myanmar WebKit 320px, and header layout at 900/1024/1280px in both languages. Telegram navigation was intercepted; no real message was sent.

Local iCloud duplicate source files with numbered names were preserved outside the build tree because TypeScript was compiling their stale copies. They are not part of the release. Runtime databases and test credentials remain outside Git.

Restored signed-in Telegram checkout with the customer’s name, email, order reference and purchase snapshot. Restoring the draft from a pending order reuses the same record. The store account button now opens an anchored panel for profile details, password changes and purchase records. The admin order editor groups each plan with its dates. Verified in local Chromium and WebKit using English and Myanmar test accounts, including expired sessions after password change and retries after a lost checkout response.

Verified the staging account page, MySQL-backed session lookup, storefront account link and protected order endpoints. Corrected a legacy Vinext resolution issue discovered during the Worker smoke test. A local build of the legacy target served all 54 seed products from its D1-backed catalog, used the Telegram checkout and returned 404 on customer account routes.

Connected storefront checkout, customer accounts, the admin order queue and private purchase history. Verified the real account and approval flow with a disposable local database and a simulated admin OTP, including lost checkout acknowledgements, concurrent requests, price snapshots, encrypted delivery details and customer isolation. Chromium covered mobile registration through delivery. WebKit checked the Myanmar account entry at 320px. See the Hostinger guide for first-use schema setup and credential backup.

Removed the gift box, 3D portal and sparkle artwork at the owner’s request. Strengthened Best Seller styling across the showcase, product cards, dialog and plan options. Node 24 build and types, 14 unit tests and Chromium/WebKit checks at 320, 390 and 1280px passed. English and Myanmar checks covered marked and ordinary plans, selected states, wrapping and full-card offer activation.

Enlarged the base tiles from 34px to 40px on desktop and from 30px to 35px on phones. Moved five tiles onto the sides and adjusted their positions around the offer text, controls and scroll ruler.

Adapted the ten original service icons from the Digimium profile pill to the storefront. Added transparent 3D renders, including a portal derived from the supplied brand outline. Checked the decorative hit areas, text clearance, reduced motion, hiding the tab and the footer control in Chromium and WebKit with English and Myanmar fixtures.

Added persistent background motion, a directional slide transition, tappable position dashes and phone swipe navigation. Verified the Node 24 standalone build, types and 14 unit tests. Local Chromium and WebKit checks covered single and multiple slides, reduced motion, arrows, dashes and opening the selected plan. Chromium touch emulation covered swipe, tap and vertical scrolling at phone widths.

Pulled `testing` for the continuation session and verified that both remote branches contained handoff commit `38d74f6`. Ran all 14 unit tests on Node 24 and checked each public catalog with the storefront’s showcase selection function.

Prepared `HANDOFF.md` for the next chat with the verified release, repository/site links, completed features, current limits, environment key names, database authority, relevant file map, and required access. Updated the architecture guide for offers and best-seller fields. No secrets are included in these documents. GitHub metadata confirms that the repository is currently public (default branch `production`); its visibility was not changed. The owner received a separate local file/chat-access inventory outside Git.

Added Best Seller controls, public badges and the automatic landing showcase. Verified independent save, reload and removal of product/plan flags against disposable local MySQL, including hidden plans and unchanged default plan selection. Chromium checks covered English/Myanmar at 320px and 390px, timed rotation, pause, reduced motion, gift/discount plan selection and category fallback. The Node 24 build, type checks, 14 unit tests and expanded Hostinger integration suite passed.

After pushing `4eee1ff`, checked production and testing over HTTPS. Both served the new release assets, readable 54-product catalogs and the admin sign-in page. No live catalog edits, live OTP delivery test, or authenticated hPanel/Resend changes were performed in that verification.

### Earlier work (historical)

Rechecked both live domains after deployment of `fecfebc`. Each returned the new gift and discount admin styles and a readable public catalog with 54 products. Both GitHub branches matched the release.

Added editable gift periods and sale prices. Verified saving, reopening and ending promotions against a disposable MySQL catalog. English and Myanmar Chromium checks covered desktop and 360px mobile layouts, crossed-out prices, and a 65,000 MMK checkout with multiple quantities. The Node 24 standalone build, type checks, 11 unit tests and Hostinger integration suite passed.

Added duration selectors and plan ordering. Tested in Chrome with a disposable MySQL catalog at 320, 390 and 1024 pixels. Saving and reloading preserved plan IDs, visibility and previously entered promotional durations. The storefront displayed the saved order and selected the first published plan.

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

Finish the targeted provider-switch/Google-fallback browser regressions, configure all three TELEGRAM_BOT settings on staging and apply/redeploy. Run scripts/configure-telegram.mjs with the private staging env; test the real Telegram code choice in the original browser. Promote to production, configure its private values and use the exact staging --move-from origin to move the single bot webhook. Remove all three Telegram settings from staging afterward, verify production capability/catalog and retain the current live customer session.

Google setup is complete on staging and production. Existing customers with the same Google email confirm their website password once when linking. Check Google sign-in on a physical phone, and keep existing application/database/fulfillment secrets stable. Back up the customer, session, Google identity/challenge and order tables together. Google remains External/Testing with only basic identity scopes; see the documented exception before changing audience or scopes.

Future Telegram bot commands should look up website orders by the verified stable Telegram ID and preserve customer isolation. Do not auto-link earlier guest orders or email/Google accounts by names/usernames. Phone login still needs a chosen SMS provider and carrier tests.

Check the checkout choices and account popup on a physical phone with its software keyboard and Telegram app. Guests refer to the Telegram order message; there is no automatic later account linking. Keep ALTER privilege on the order table for the first deployment migration and retain database backups.

Match the Telegram order reference with **Admin → Orders → Pending**, complete payment and account delivery in Telegram, then confirm subscription dates and approve its tracking record. Use **Customers** to look up the customer and their orders.

Check the new Best Seller badge and plan treatment on a physical phone. For future changes, read `HANDOFF.md`, this file, `AGENTS.md` and the relevant target guide, then pull `testing` before editing.

Mark the desired products and plans as **Best Seller** and save. Gift durations and discount prices automatically qualify the corresponding published offers for the landing showcase.

When a promotion is ready, edit the relevant offer in **Admin → Services**, set the gift duration or discount price, and save.

Open Google Analytics **Reports → Realtime** to see recent storefront activity.

Use the plan arrows to set the preferred order for each service, then save and check its storefront card and plan picker.

The legacy Sites target can be checked on a phone running Telegram.
