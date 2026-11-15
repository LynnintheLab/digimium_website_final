# Build and preview security follow-up — 15 November 2026

## Result and scope

The deployed lockfile clears all **eight High** dependency entries from the previous [Zod follow-up](SECURITY-ZOD-FOLLOWUP-2026-11-15.md). The full audit reports **0 Critical, 0 High, 15 Moderate and 0 Low**; it is **not completely clean**. Runtime source `830373c` reached Hostinger Completed/Current on testing and production. Final local and hosted verification passed.

## Changes

| Previously High package | Previous lockfile | Patched lockfile |
| --- | --- | --- |
| brace-expansion | 1.1.14 / 5.0.6 | 1.1.22 / 5.0.13 |
| browserslist | 4.28.2 | 4.29.5 |
| image-size | 2.0.2 | Removed with the Vinext parent update |
| js-yaml | 4.1.1 | 4.3.2 |
| undici | 7.24.8 | 7.30.1, scoped to Miniflare |
| vinext | 1.0.0-beta.5 | 1.0.0 |
| vite | 8.0.13 | 8.1.6 |
| ws | 8.18.0 | 8.21.0 |

Compatible transitive updates use normal npm resolution. No `--force` or `--legacy-peer-deps` flags were used. Vinext 1.0.0 removes its image-size dependency and replaces the old Open Graph dependency with `@vercel/og` 1.0.3. Its required RSC plugin is pinned to 0.5.34, while the existing matching React/DOM/RSC 19.2.9 patches remain unchanged.

Cloudflare's official last Miniflare 4 parent combination is pinned together: `@cloudflare/vite-plugin` 1.49.0, Wrangler 4.116.0 and Miniflare 4.20260730.0. Wrangler's optional Workers Types peer is satisfied by `@cloudflare/workers-types` 5.20260730.1. This is a type-package update; the local runtime remains Miniflare **4**, not 5.

Miniflare 4.20260730.0 still pins vulnerable Undici 7.28.0 upstream, so the existing Miniflare-only overrides retain Sharp 0.35.5 and add **Undici 7.30.1**. This stays within Undici 7.x instead of forcing an unrelated major across the dependency tree. Keep the override explicit and tested; remove it when a supported parent combination supplies a patched Undici itself. New parent releases may change the internal HTTP behavior, so recheck local Worker dispatch, D1/R2, preview and TLS behavior when updating it.

Primary advisory references: [brace expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [Browserslist](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [image-size](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [JS-YAML](https://github.com/advisories/GHSA-2883-xcg3-v3hh), [Undici](https://github.com/advisories/GHSA-2m5v-pch6-74hx), [Vite/launch-editor](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [WebSocket fragmentation](https://github.com/advisories/GHSA-96hv-2xvq-fx4p). The lockfile contains the exact tested versions and integrity hashes.

## Verification status

- A clean `npm run install:ci` passed without force or legacy peer flags.
- **78 unit tests passed** on the candidate dependency graph.
- The final Node 24 standalone build, TypeScript and packaging passed.
- Sites/Worker build passed; fresh local D1/R2 catalog/admin and logo/plan integrations passed. Twelve development security checks verified raw Host/origin rejection, safe redirects, guarded bridge context/invoke, refused client import, and denied fake private/outside files. The client virtual module is refused with HTTP 500; unauthenticated bridge requests return 403. No bridge secret was exposed.
- All six fresh disposable Hostinger security suites passed: catalog/admin, commerce, Telegram/link/history, giveaway, Google and direct identities. The Telegram race returned 200/409 with exactly one identity and owner. External provider fallback was blocked; providers used fake fixtures.
- Fresh production-only audit: zero findings. The full `npm audit --audit-level=high` gate exits zero while retaining the 15 Moderate findings below. Focused ESLint for the new tests has zero errors/warnings.
- Testing and production deployed runtime `830373c` as Hostinger Completed/Current. Each passed 14 bounded read-only checks: public responses, private API authorization/cache/headers, analytics isolation and denied source/config files. `/.env` and `/.git/config` returned 403; package manifests returned 404. Catalogs retain 54 services and the giveaway remains draft.
- Chrome verified plan dialogs and account controls on staging (Myanmar) and production (English), with no captured browser errors. The original production sign-in, English preference and two-item cart were preserved. Public proof is ignored at `outputs/toolchain-security-live-storefront-2026-11-15.png`.
- An initial post-deploy staging batch returned 503 from `/api/admin/catalog` instead of 401. The subsequent complete batch passed all 14 checks; the initial cause was not established. Production's complete batch passed.

Actual Miniflare Worker GET, UTF-8 POST/header roundtrips and loopback upstream fetch passed. Resolving Undici through Miniflare confirms 7.30.1, and a request through that installed copy rejected a disposable self-signed HTTPS certificate with `DEPTH_ZERO_SELF_SIGNED_CERT`; TLS validation was never disabled.

All mutation verification used disposable local fixtures. No real orders, account links, giveaway launch/entries, provider messages or Sites publication occurred. All owned local app/database/preview processes stopped, and fake canaries/certificates were removed. Native Windows behavior was not exercised on this Mac; the Vite patch version is verified against the advisory.

## Remaining findings

The **15 Moderate** audit entries remain in lint/parser dependencies, Drizzle's development loader, and Open Graph/Satori dependencies. They need separate review and compatible fixes; clearing the requested High entries does not resolve them. npm audit measures the package graph, not every reachable code path or vendored copy. A clean severity category is not a guarantee that the hosting environment or application is free of security issues.

Local ignored evidence: `outputs/security/toolchain-audit-before-2026-11-15.json`, `outputs/security/toolchain-audit-after-2026-11-15.json`, the high-severity audit gate, runtime audit, Hostinger suite summary, Sites/Miniflare/TLS checks and both hosted read-only summaries in the same directory. These record the full audit moving from **26 entries / 8 High** to **15 entries / 0 High**.
