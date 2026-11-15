# Admin controls, giveaway visibility and desktop width

Implemented on 15 November 2026. Final local verification passed; hosted rollout is pending.

## Owner controls

- **Admin → Customers → Edit:** update display name and email. Connected identity IDs remain read-only. An email/password account must retain an email.
- **Admin → Customers → Delete:** review order/entry counts, then type the exact displayed customer name. This permanently removes that customer's account, sessions, connected identities, orders, giveaway entries and provably owned Telegram challenges. Cancel leaves data intact. Deletion is not a ban: later verified sign-in can create a new empty account.
- **Admin → Orders → Pending → Remove:** type the displayed order reference. Approved orders have no Remove control. Stale data must be reloaded before retrying.

The owner will clean test data himself. No live customer/order edits or deletions were performed; **Kosai Namti must remain untouched**. No name-based protection was added: check the selected customer and impact counts before using the controls. Keep database backups before manual permanent cleanup.

## Giveaway and layout

The giveaway section uses a white/gold surface and navy countdown strip, distinct prize logos and readable labels. Joined participants see exactly one confirmation: **Giveaway တွင် ပါဝင်ပြီးပါပြီ**. English shows “You have joined the giveaway.”

Winner-selection countdown targets the existing campaign **end time** in Myanmar time. No extra date field or schema migration was added. Missing dates show a placeholder; elapsed countdown announces that selection time has arrived and results will follow. It does not automatically pick or claim winners. Campaign settings, launch state and entries remain unchanged.

At viewport widths of 1280px and above, the storefront header and main sections align to **80% viewport width**, without a fixed maximum. Hero/brand paragraphs retain readable line lengths. Existing smaller-screen gutters and two phone product columns remain.

## Security and verification

- New routes require admin authorization, same-origin mutations, strict bounded JSON, UUID validation and sanitized no-store responses. Customer writes bind to a current SHA-256 version and run in a locked transaction. Pending removal binds to the current revision, locks the row and rejects approved orders.
- Customer deletion preserves unrelated users and guest records. Unowned encrypted Google flows cannot safely be attributed and are not indiscriminately removed; pending/completion routes recheck customer/session state, so old receipts cannot recover deleted accounts or data.
- **87 tests**, strict full lint (**0 errors / 0 warnings**), Node 24 standalone build/packaging and TypeScript passed.
- All **seven** fresh disposable Hostinger integrations passed: catalog/admin, commerce, Telegram/link/history, giveaway, Google, direct Telegram identity and customer administration. Coverage includes authorization, malformed/oversized input, stale writes, duplicates, rollback, isolation, session revocation and concurrent approval/removal and customer updates/deletion.
- Direct identity's first run exposed an existing test-harness rejection-handler timing race. The unchanged expected-rejection assertion now attaches immediately; the fresh-database rerun passed. Authentication behavior and rejection mode were not relaxed.
- Legacy Sites build, fresh D1 and catalog/logo integrations passed. Disabled customer routes returned 404 without data. The final deterministic-date change passed a separate Sites rebuild. The existing Vinext dependency bundler notice remains separate from ESLint.
- Chrome measured exactly 80% for seven storefront sections at 1280, 1440 and 2560px; 320/390px retained two catalog columns without horizontal overflow. Local fake-customer edit, typed-confirmation guards, Cancel, keyboard focus and approved-order control visibility passed. Destructive behavior was exercised only in disposable local integration fixtures.
- Fresh Myanmar browser load had no captured errors/warnings after correcting Node/browser locale differences. Dates use deterministic Myanmar-time formatting, including year rollover; countdown advances and joined confirmation appears once.

Ignored evidence lives under `outputs/security/admin-giveaway-*`; screenshots are `outputs/admin-giveaway-desktop-final-local-2026-11-15.png` and `outputs/admin-giveaway-phone-final-local-2026-11-15.png`. Owned local app/database processes stopped and fake configuration was removed; unrelated review server remained untouched. Physical Windows/iOS/Android devices were not exercised. No Telegram app/provider links, real orders, giveaway entries/launch or Sites publication were triggered.
