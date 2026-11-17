# Paste-ready website continuation prompt

Copy the block below into a chat with access to the existing digimium-website checkout or canonical repository. Attach HANDOFF.md if the chat cannot initially read the folder. Private credentials and service sessions are separate.

~~~text
Continue my existing Digimium website. Read the current implementation before changing anything; completed features should be preserved.

Repository: https://github.com/LynnintheLab/digimium_website_final.git
Working branch: testing
Production: https://buywith-digimium.store
Staging: https://test.buywith-digimium.store

Read AGENTS.md, HANDOFF.md (updated 17 November 2026), the newest NOTES.md entries and README.md. Then consult the relevant Hostinger, development, Admin, login-provider and notification runbooks. Inspect Git status and run git pull --ff-only before editing. Use Node.js 24 and the committed lockfile.

The last application runtime, 6248c3f, was verified Hostinger Completed / Current on both hosts on 16 November. Testing subsequently received verification/handoff documentation; production runtime is unchanged. Public GET checks on 17 November showed 51 production products, hidden giveaway (JSON null), Google and Telegram enabled; staging had 54 products, a separate draft campaign, Google enabled and Telegram disabled. Private APIs rejected anonymous reads. Recheck the actual current branch/deployment rather than treating these labels as permanent.

The latest completed feature is Admin-created orders for customers who bought as guests before registering. Customers / Customer details / Orders → Create order selects an existing account, reviewed catalog offers and actual MMK prices, then creates a pending record. The existing editor handles historical dates, optional encrypted Account/Password/Manager/Username and customer-visible approval/rejection notes. Retries recover one order. Never auto-match email, reassign/delete the original guest record or send a new-checkout alert for manual recording.

Preserve all live data. Kosai Namti is the real customer I explicitly protected; I will clean test data myself through Admin. Use disposable loopback databases and mocked providers for mutation tests. Do not create fake live accounts/orders, send Telegram/provider messages, open Telegram launch links, alter prices/publication/provider settings or rotate keys during incidental QA.

The giveaway is postponed. Keep public surfaces hidden and joins disabled until I explicitly reopen it, preserving dates/participants. The separate digimium-otp-link PHP banner is also disabled and has its own repository/deployment.

Preserve Manrope/Wa Lone, the blue/lavender/navy brand, refined customer dark mode, Myanmar default with retained English choice, about 80% desktop width, four desktop columns/eight-card preview and two phone columns. Keep compact centered payment groups, Account last in top navigation and the mobile dock. Inline Account is read-only with two plan previews/two pending rows; the gear opens full settings without history. Full history has Approved/Pending/Rejected, logos, spaced dates and segmented semicircle remaining-DAY gauges. Sign out uses a red gradient. The scroll rail uses uniform black/white ticks with length-only position changes.

Google/email customers can explicitly connect an unclaimed Telegram identity through an exact-session challenge, without merging owners. Preserve the production bot's one existing webhook. Customer messages and expiry reminders use the website bell; owner alerts use the existing bot → my personal chat. The protected five-minute production job is already configured. Follow NOTIFICATIONS.md instead of creating another bot/job or exposing keys.

The last runtime passed clean-source strict lint, 103 units, build/typecheck, focused integrations and 320/390/1440px browser checks. Read the exact evidence/limits; do not invent fresh working-tree, physical-device, provider or production-mutation coverage. Admin documents deliberately use Referrer-Policy: same-origin for native OTP forms; customer/API responses retain no-referrer. Strict missing/null/foreign Origin rejection remains.

This Mac checkout contains unrelated untracked iCloud numbered duplicates and provider-identities.ts/showcase assets. Preserve them; avoid blanket staging/deletion/reset. Validate clean tracked source if duplicates/stale dependencies interfere. MySQL data, uploaded logos and ignored secrets are not in Git and must not be reseeded. The repository was PUBLIC at handoff; do not assume privacy or change visibility incidentally.

After authorized changes, update NOTES (Current status / Last thing done / Next steps), stage intended files, review for secrets, commit and push testing. Promote validated runtime changes through the existing production workflow and verify actual hosted activation separately from Git push. Use relative project paths and private secret storage.

First report that you loaded the handoff and the actual current repository state. Then continue with my next website request. Historical “next steps” in old reports are not unfinished features.
~~~

No passwords, tokens, private chat IDs or customer/database dumps are included. The full handoff contains the file map, runbooks, verification limits and access requirements.
