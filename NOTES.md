# Digimium project notes

## Current status

The complete Digimium storefront and admin source is maintained in the private GitHub repository `LynnintheLab/digimium_website_final`. `production` holds the release baseline; `testing` is the working branch. Both start from this completed mobile release. GitHub pushes do not automatically publish the hosted site.

The site includes 54 products, 104 stored plans with 50 selected public plans, English/Myanmar browsing, blue/lavender surfaces, distinct clipped cursor lights, a persistent cart, Telegram ordering, and authenticated administration. D1 stores catalog edits; R2 stores uploaded logos. The hosting identity in `.openai/hosting.json` belongs to the currently connected account. The source and assets from previous accounts are retained.

## Last thing done

Compared the previous account checkouts and verified that their colors/features are present. Improved phone/tablet touch targets, safe-area/keyboard spacing, cart action visibility, and the admin list/editor experience. Corrected the unpriced-plan enquiry note. Added cross-platform Git settings, reusable test commands, detailed setup/admin/architecture/deployment documentation, and matching agent instructions.

TypeScript, six unit tests, both local integration suites, and production compilation passed. The source/history secret scan passed. Final visual mobile testing remains unavailable because local browser control is disabled in the connected account; see `qa/QA.md` for precise limits.

## Next steps

Continue development on `testing`, pull before editing on either computer, and promote verified changes to `production`. Publish production updates through the existing Sites project; branch pushes alone do not deploy. Keep runtime secrets and live D1/R2 backups outside Git. Enable browser access and finish the phone/tablet visual and physical-device checks listed in `qa/QA.md`.
