# Digimium contributor instructions

Digimium is a bilingual digital subscription catalog with a persistent browser cart, customer accounts, order history, and authenticated catalog and order administration. The default deployment runs Next.js on Hostinger’s managed Node.js service. MySQL stores the catalog, uploaded logos, and admin session state. The existing ChatGPT Sites target runs through Vinext with D1 and R2.

## Start here

- Read `NOTES.md`, `README.md`, and the guide for the target environment. Hostinger deployment is documented in `docs/HOSTINGER.md`.
- Preserve the established blue/lavender gradient, navy panels, colored logos, Manrope, and Wa Lone.
- Keep current product/plan publication flags unless the owner asks to change them. Do not invent prices or delivery promises.
- Preserve the red Myanmar checkout guidance and the extra unpriced-selection sentence.
- The storefront defaults to Myanmar and retains an explicit English choice. Signed-out Hostinger checkout offers **Create account / အကောင့်ဖွင့်မည်** and **Buy on Telegram / Telegram မှဝယ်မည်**. Account sign-in/register stays in the order popup and returns to cart review without submitting. Signed-in checkout shows only **Place order / Order တင်မည်**. Telegram-only purchase asks for no name or email and explains that website history is unavailable.
- Checkout saves a pending tracking record, then opens a Telegram draft containing the order reference and selected offers (plus verified customer name/email when available). Customers send the final message; payment and account delivery happen in Telegram. Keep the website’s order-placed receipt and draft/copy fallback available after returning from Telegram. This receipt does not mean payment or admin approval is complete. Admin approval records subscription dates. Guest orders remain admin-only and do not create customer accounts. The Sites target uses its original Telegram drafts.
- Account opens an inline panel with account/password settings and a three-plan purchase preview. `/order-history` separates approved purchases and pending orders with filters; both the preview and full purchases use circular remaining-time meters and clear dates/status labels. The floating mobile dock has Products, Cart with its count, raised center Account, History and Help; hide it while an overlay or keyboard needs the space. Keep the five verified payment logos near the top and compactly in checkout without inventing payment details.
- Google-to-Telegram account linking is deferred. Do not merge identities or claim previous or guest orders automatically.
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
