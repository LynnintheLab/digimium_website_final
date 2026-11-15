# Lint warning cleanup — 15 November 2026

All **17 remaining ESLint warnings** are fixed. `npm run lint -- --max-warnings=0` exits zero with **0 errors and 0 warnings**. Testing/production rollout is pending.

## Changes

- Fourteen image nodes now use `next/image` with explicit dimensions. Local SVGs, small brand assets and uploaded logo paths retain direct delivery through `unoptimized`, consistent with the existing payment/account images and both deployment targets. No image optimizer, remote allowlist or authentication configuration changed.
- Width-only brand/watermark styles retain `height: auto`; fixed logo boxes retain `object-fit: contain`. Canva and Netflix keep their existing wider boxes. Header branding remains eager, and every existing `onError` fallback, alt text, class and decorative tile setting is preserved. No fill positioning or wrapper/CSS change was added.
- Three unused implementation parameters are omitted while explicit function types preserve the shared storage and session call contracts. Stored bytes/SQL and Sites session 404 responses are unchanged. No lint suppression or rule relaxation was introduced.

The [official Image reference](https://nextjs.org/docs/app/api-reference/components/image) documents intrinsic dimensions and responsive aspect ratios. The installed Next and Vinext implementations were checked for compatible image props.

## Verification

- Strict full lint: passed, zero warnings.
- Existing tests: **82 passed**, zero failures/skips.
- Node 24 standalone build/packaging and TypeScript: passed.
- Fresh disposable Hostinger catalog/admin/logo integration: passed, including real local upload/storage and persistence checks. Fake providers and a loopback-only fallback guard prevented outbound provider requests.
- Separate legacy Sites build, fresh local D1 and both catalog/logo-plan integration suites: passed; integration fixture content restored. Its existing Vinext dependency `INEFFECTIVE_DYNAMIC_IMPORT` bundler notice is separate from ESLint and remains unchanged.
- Chrome checked desktop and 390px rendering: correct image dimensions/proportions, loaded service/prize logos, no horizontal overflow and two product columns on the phone. Before deliberate failure tests, no captured application errors or image-size warnings appeared.
- Blocking only the local Canva asset produced the expected letter fallback in catalog, plan dialog and admin. A missing uploaded-logo path also fell back correctly in an unsaved local admin form; no Save action occurred. The browser connection restarted during the Revert confirmation, so successful Revert is not claimed. The form tab was closed; persisted local catalog validation and fixture cleanup are recorded separately.
- Screenshots are ignored at `outputs/warnings-phone-local-2026-11-15.png` and `outputs/warnings-phone-cards-local-2026-11-15.png`. Logs and sanitized integration summaries are under `outputs/security/warnings-*`.

Hosted read-only checks are pending. No live orders, account/provider links, giveaway entries/launch or Sites publication occurred. Physical iOS/Android and native Windows were not exercised.
