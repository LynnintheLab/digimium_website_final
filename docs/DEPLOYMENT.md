# Deployment and recovery

## Branches

The GitHub repository is `LynnintheLab/digimium_website_final`.

- `testing` is the working branch for implementation and verification.
- `production` is the default branch and stable source selected for release.

Both begin at the same completed website revision. They do not create separate websites/databases. Publishing `testing` to the existing Site would still change the live Site. Use local preview for unfinished work, or explicitly provision a separate staging Site and storage.

## Daily workflow

```sh
git switch testing
git pull --ff-only
```

After changes and validation, update `NOTES.md` (Current status, Last thing done, Next steps), then commit and push:

```sh
git add -A
git commit -m "Describe the completed change"
git push origin testing
```

Review before promoting. When `production` has no independent changes:

```sh
git switch production
git pull --ff-only
git merge --ff-only testing
git push origin production
```

If branches diverge, inspect and resolve through a normal merge or pull request. Never force-push or discard another machine's work. Branch protection and automatic deployment are not implied by the names.

## Sites publication

The live website is managed by Sites. Preserve the identity and storage bindings in `.openai/hosting.json`. Configure production `ADMIN_EMAILS` through Sites runtime settings; real values are not in this repository.

1. Open the existing Site through the Sites workflow and synchronize its source before editing or reconciling changes.
2. Bring in validated release source, preserving that Site's identity and audience.
3. Run required checks and build. Output includes `dist/server/index.js`, client assets, and hosting/migration metadata.
4. Use the Sites source workflow to commit/push the exact source and package its archive. Keep credentials in the tool session, never source or shell history.
5. Save/deploy that exact revision. Use owner-private publication while the Site remains owner-private.
6. Follow deployment to success/failure, verify the deployed URL, and record the outcome.

Sites source and GitHub are separate synchronization destinations. A GitHub push does not publish a Sites release. Use installed Sites tooling for packaging/publication; do not invent IDs or replace the current identity because a different account cannot see it.

Sites applies included migrations during deployment. Review schema changes; do not replay applied migrations or reset storage as a troubleshooting shortcut.

## What Git backs up

| Included in Git | Stored separately |
| --- | --- |
| Source and tests | Current saved D1 catalog |
| Original/imported seed catalog | R2 uploaded logos |
| Built-in images and fonts | Runtime secrets and credentials |
| Schema and migrations | Browser cart/language preference |
| Documentation and history | Local state and generated build output |

## Runtime backups

Use a supported D1 export/snapshot mechanism where available. An authorized admin can also open `/api/admin/catalog` while signed in and save its complete JSON as a dated backup. Store backups privately outside source. `/api/catalog` is not complete: it omits hidden products/plans and may omit descriptions.

Back up R2 `logos/` objects with the catalog. Preserve keys and bytes so saved `/media/logos/...` paths work. Record date, Site identity, catalog revision, and storage environment. JSON alone leaves uploaded-image references without their files.

There is no admin backup/restore button in this release. Restore through supported storage tools or an authenticated, validated catalog save. For API restoration, read the destination's latest revision and send backed-up products/settings with that current `expectedRevision`. Restore referenced logo objects first, because saves reject missing images.

## Recovery and account changes

- Source regression: use reviewed Git history and a release; retain newer catalog data unless data restoration is also intended.
- Catalog mistake: restore a verified complete backup, preserving later legitimate edits.
- Logo issue: restore matching R2 objects or upload replacements and save the new paths.
- Account change: local source remains available, but previous hosted Site/storage access does not transfer automatically. Use authorized tools for the connected account and preserve local copies before reconciling.

A source rollback does not roll back D1 or R2. Back up storage before destructive migrations or bulk replacement.

## Release verification

Run build/relevant automated tests, then inspect the deployed storefront and admin authorization. Record mobile/browser checks honestly. Matching served CSS and catalog data establishes deployment content, not visual layout or physical touch behavior.
