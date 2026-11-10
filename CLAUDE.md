# Digimium contributor instructions

Digimium is a bilingual digital subscription catalog with a persistent browser cart, Telegram order drafts, and an authenticated catalog/logo admin panel. React and TypeScript run through Vinext/Vite on Cloudflare Workers; D1 stores the catalog and R2 stores uploaded logos.

## Start here

- Read `NOTES.md`, `README.md`, and the relevant guide under `docs/`.
- Preserve the established blue/lavender gradient, navy panels, colored logos, Manrope, and Wa Lone.
- Keep current product/plan publication flags unless the owner asks to change them. Do not invent prices or delivery promises.
- Preserve the red Myanmar checkout guidance and the extra unpriced-selection sentence.
- Checkout prepares a Telegram draft; customers send it. Do not describe it as automatic messaging or payment processing.
- Keep `.openai/hosting.json` bound to the existing Site for updates. GitHub pushes and Sites publication are separate actions.

## Commands

Use Node.js 24. Run from the repository root:

```sh
npm run install:ci
npm run dev -- --host 127.0.0.1 --port 5185
npm test
npm run typecheck
npm run build
```

See `docs/DEVELOPMENT.md` for one-time local D1 initialization, `.dev.vars`, and `npm run test:integration` with a local `TEST_BASE_URL`. Never run mutation tests against production. Run checks appropriate to the change; record browser/device checks that remain unverified.

## Branches

- `testing`: working changes and verification.
- `production`: default branch and stable release source.
- Promote validated changes through a normal merge or pull request. Never force-push to resolve a rejected push.
- These branches do not automatically publish or create independent data environments.

## Sync rules (Mac <-> Windows via GitHub)

This project is worked on from both a Mac and a Windows PC. GitHub is the source of truth.

- **Start of every session:** run `git pull` before changing anything. Prefer `git pull --ff-only` so divergence is visible.
- **Before ending a session:** update `NOTES.md` (Current status, Last thing done, Next steps), then commit and push:
  `git add -A && git commit -m "<what changed>" && git push`
- Use **relative paths only**. Never hardcode machine-specific home directories or drive paths in code, config, or docs.
- Never commit secrets. Real values live in git-ignored environment files; `.env.example` lists keys with empty or placeholder values. Add new environment keys to `.env.example`.
- Line endings are handled by `.gitattributes` (LF everywhere, CRLF for `.bat`, `.cmd`, and `.ps1`). Do not change it.
- After pulling on a new machine, reinstall dependencies; they are not in Git.
- Live D1 catalog changes and R2 uploads are not included in a source push. Follow `docs/DEPLOYMENT.md` for backups and recovery.
