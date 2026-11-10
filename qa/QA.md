# Verification — 2026-11-11

## Current release checks

- `npm run typecheck`: passed.
- `npm test`: all six cart/order and bilingual-copy tests passed. They cover repeated checkout, hidden/unavailable offers, current prices, enquiry totals, multipart Telegram messages, and translated plan details.
- `TEST_BASE_URL=http://127.0.0.1:5189 npm run test:integration`: both suites passed. Catalog checks cover admin authorization, CSRF/origin validation, input validation, saved prices, description visibility in both languages, revision conflicts, and atomic concurrent writes. Logo checks cover uploaded bytes, saved/reopened paths, public plan filtering, and invalid file/path rejection. Original local catalog content was restored.
- Production compilation passed with all six routes: storefront, admin, both catalog APIs, logo upload API, and uploaded-logo retrieval.
- Local HTML contains `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`.
- Previous-account recovery audit: the current checkout contains the older blue, catalog-store, and website-current features/assets. The former blue version differs only by newer mobile refinements. No rollback was needed.
- Hosted release before this final mobile refinement returned 54 public products and 50 public plans. Its delivered CSS hashes matched the local production build exactly. Anonymous admin API returned 401 and admin page redirected to sign-in.
- GitHub preparation scanned the tracked tree and prior Git history: no detected secrets, nested repositories, files over 50 MB, or hardcoded user-machine paths. The supplied empty repository was made private to follow the owner's sync instructions.

## Mobile improvements covered by source review

- Sticky phone navigation with cart and language controls; compact search and wrapped filters.
- Single-column product cards on narrow phones, retaining readable product/plan text.
- Safe-area spacing; 44px touch controls on phones and tablets; 16px inputs.
- Scrollable product/cart content with reachable action footers; short landscape support.
- Unpriced plans show the additional red enquiry sentence even if a parent product has a quoted price.
- Mobile admin uses list/editor navigation, retained drafts, a bottom Save/Revert bar, wrapping service names and feedback, and a scrollable sidebar on short screens.
- Full WOFF2 font encodings retain Myanmar shaping and reduce aggregate font bytes by 60.6%.

## Verification limits

Browser control remains disabled in the connected account's Work settings. The final responsive layout has not been visually inspected or exercised with synthesized touch, physical iOS/Android devices, or a Windows runtime. Source and HTTP checks do not establish visual or gesture correctness. No payment or customer Telegram message was sent.

Earlier browser checks, before the final mobile refinement, verified adding ChatGPT and Canva, cart persistence after reload, Myanmar translation, and opening a Telegram draft with both selections without sending it.

## Remaining visual review

When browser access is enabled, check 320px and 390px portrait, short phone landscape, a tablet, and desktop in English and Myanmar. Review search/filter use, the plan picker, cart quantities/removal, long plan names, keyboard opening, safe areas, and admin list/editor/Save behavior. Use a physical iPhone and Android phone for final keyboard and touch confirmation.
