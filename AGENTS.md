# Digimium contributor instructions

Digimium is a bilingual digital subscription catalog with a persistent browser cart, customer accounts, order history, and authenticated catalog and order administration. The default deployment runs Next.js on Hostinger’s managed Node.js service. MySQL stores the catalog, uploaded logos, and admin session state. The existing ChatGPT Sites target runs through Vinext with D1 and R2.

## Start here

- Read `NOTES.md`, `README.md`, and the guide for the target environment. Hostinger deployment is documented in `docs/HOSTINGER.md`.
- Preserve the established blue/lavender gradient, navy panels, colored logos, Manrope, and Wa Lone.
- Keep the phone catalog at two products per row, as the owner requested. The mobile dock uses the language control’s white selected pill; Products/Help selection follows navigation and the visible section, including repeated same-URL anchor taps.
- Keep current product/plan publication flags unless the owner asks to change them. Do not invent prices or delivery promises.
- Preserve the red Myanmar checkout guidance and the extra unpriced-selection sentence.
- The storefront defaults to Myanmar and retains an explicit English choice. Signed-out Hostinger checkout offers **Create account / အကောင့်ဖွင့်မည်** and **Buy on Telegram / Telegram မှဝယ်မည်**. Account sign-in/register stays in the order popup and returns to cart review without submitting. Signed-in checkout shows only **Place order / Order တင်မည်**. Telegram-only purchase asks for no name or email and explains that website history is unavailable.
- Checkout saves a pending tracking record, then opens a Telegram draft containing the order reference and selected offers (plus verified customer name/email when available). Customers send the final message; payment and account delivery happen in Telegram. Keep the website’s order-placed receipt and draft/copy fallback available after returning from Telegram. This receipt does not mean payment or admin approval is complete. Admin approval records subscription dates. Guest orders remain admin-only and do not create customer accounts. The Sites target uses its original Telegram drafts.
- Account opens an inline read-only profile panel with two recent purchased-plan previews and two brief pending rows. The round gear button opens the full `/account` profile/settings page, which omits order history and retains the existing password editor and connected sign-in methods. Sign out uses a readable red gradient button. `/order-history` separates approved purchases and pending orders with filters; both the preview and full purchases use segmented semicircle remaining-day gauges, product logos and separately spaced dates/status labels. Full customer pages use about 80% of desktop width. The floating mobile dock has Products, Cart with its count, raised center Account, History and Help; hide it while an overlay or keyboard needs the space. Keep the five verified payment logos near the top and compactly in checkout without inventing payment details.
- Google/email customers can connect Telegram from full Account settings using an exact-session-bound code challenge. Existing orders retain their original owner; identity conflicts are rejected, never merged/transferred. Other provider connections must be labelled honestly.
- Admin may create a new pending order for a registered customer who bought earlier as a guest. Select the exact existing customer, currently published offers, quantities and actual whole-MMK unit prices; default to saved catalog prices and validate its revision. Use the existing approval editor for historical dates, optional credentials and customer-visible notes. Keep stable retry request IDs, parent-customer locking and server-only snapshots. Never auto-match email or reassign an old guest record; manual recording sends no checkout alert or Telegram message.
- Admin may optionally save Account, Password, Manager and Username per purchased item. Encrypt them in the existing order/owner-bound fulfillment envelope; expose them only in that owner’s approved full history, with passwords hidden initially. Never include them in previews, pending responses, checkout receipts or Telegram messages.
- Giveaway prizes are Gemini Pro 3 months ×2, Canva EDU Pro 12 months ×3, and ChatGPT Go Own Mail 1 month ×1. A website account and verified Telegram link are required to join. Keep one entry per campaign/customer and Telegram identity. Admin controls Myanmar-time dates and explicit Launch; new campaigns remain drafts. Do not launch a live campaign during tests.
- Admin → Giveaways → Hide giveaway postpones the campaign: all public giveaway surfaces disappear and the server rejects entries, while saved dates and participants remain. Show giveaway restores visibility under the saved schedule. Keep the campaign hidden until the owner explicitly requests reopening; account connection guidance stays neutral.
- A saved receipt never automatically reopens on normal store/Account/History navigation. Keep explicit Cart → View saved order recovery for 24 hours.
- Keep `.openai/hosting.json` bound to the existing Site for updates. GitHub pushes and Sites publication are separate actions.

## Commands

Use Node.js 24. Run from the repository root:

```sh
npm run install:ci
npm run dev -- --hostname 127.0.0.1 --port 3000
npm test
npm run typecheck
npm run build
```

See `docs/DEVELOPMENT.md` for local MySQL setup and Hostinger integration checks. The legacy Sites target uses `dev:sites`, `build:sites`, `start:sites`, local D1 and `.dev.vars`. Never run mutation tests against production. Run checks appropriate to the change; record browser/device checks that remain unverified.

## Branches

- `testing`: working changes and verification.
- `production`: default branch and stable release source.
- Promote validated changes through a normal merge or pull request. Never force-push to resolve a rejected push.
- Hostinger auto-deployment follows the branch configured in hPanel. Use separate storage for staging deployments.

## Sync rules (Mac <-> Windows via GitHub)

This project is worked on from both a Mac and a Windows PC. GitHub is the source of truth.

- **Start of every session:** run `git pull` before changing anything. Prefer `git pull --ff-only` so divergence is visible.
- **Before ending a session:** update `NOTES.md` (Current status, Last thing done, Next steps), then commit and push:
  `git add -A && git commit -m "<what changed>" && git push`
- Use **relative paths only**. Never hardcode machine-specific home directories or drive paths in code, config, or docs.
- Never commit secrets. Real values live in git-ignored environment files; `.env.example` lists keys with empty or placeholder values. Add new environment keys to `.env.example`.
- Line endings are handled by `.gitattributes` (LF everywhere, CRLF for `.bat`, `.cmd`, and `.ps1`). Do not change it.
- After pulling on a new machine, reinstall dependencies; they are not in Git.
- Back up the Hostinger MySQL database or Sites D1 and R2 independently of Git. Follow `docs/DEPLOYMENT.md` for backups and recovery.
