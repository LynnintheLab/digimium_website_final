# Moderate dependency security follow-up — 15 November 2026

## Result

All **15 Moderate dependency entries** from the previous [toolchain follow-up](SECURITY-TOOLCHAIN-FOLLOWUP-2026-11-15.md) are cleared. Fresh full and production-only npm audits both report **0 Critical, 0 High, 0 Moderate and 0 Low**. Source `ac0bcac` reached Hostinger **Completed/Current** on testing and production. Local and hosted verification passed.

## Changes and compatibility

The 15 entries were propagation from three vulnerable dependencies, not 15 independent application flaws. Exact overrides are scoped to their actual parents; unrelated consumers keep their supported ranges. No force install, legacy peer flags, advisory suppression or application authentication changes were used.

| Dependency path | Before | After | Verification |
| --- | --- | --- | --- |
| Drizzle Kit → esbuild-kit/core-utils → esbuild | 0.18.20 | 0.25.12 | Actual CJS/ESM TypeScript transforms, enums, top-level await and sourcemaps; real Drizzle config/schema loading, generate and check |
| Satori → fflate | 0.7.3 | 0.7.5 | Normal ZIP roundtrip, bounded malformed ZIP64 rejection, compressed WOFF font rendering and OG PNG generation |
| TypeScript Estree → minimatch | 10.2.6 | 11.0.1 | Actual typed parser project service accepts the intended dot-directory/brace glob and rejects an unrelated file |

Drizzle Kit also receives its 0.31.10 → 0.31.11 maintenance patch. The esbuild and minimatch overrides cross their parents' declared dependency ranges, so retain the compatibility tests when updating those parents. The esbuild-kit loader remains deprecated upstream; replace/remove its override when Drizzle supplies a supported patched loader. The actual core-utils path uses transform APIs, not esbuild's development server. Miniflare's previous Sharp/Undici overrides remain intact.

Primary advisories: [esbuild development-server origin access](https://github.com/advisories/GHSA-67mh-4wv8-2f99), [fflate ZIP64 infinite loop](https://github.com/advisories/GHSA-px8p-9vwx-vf98), [minimatch glob amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Bundled-code and hosting scanner review

`@vercel/og` 1.0.3 retains fflate 0.7.3 provenance comments inside its Node and Edge bundles. Both contain the tree-shaken DEFLATE/WOFF `inflateSync` routines; neither contains the advisory's vulnerable `unzipSync`/ZIP64 parser. The installed Satori dependency is patched to 0.7.5. No manual modification of unrelated bundled inflate code was made. A real compressed WOFF font renders identical SVG glyph paths to its original TTF, and OG produces a 640 × 320 PNG without network asset requests. The direct Node test harness supplies OG's expected require/asset bridges and restores them; application runtime code is unchanged.

Before this rollout, Hostinger's testing scan (17:30) showed five entries: old fflate/esbuild/minimatch findings plus two High entries for **GHSA-gv7w-rqvm-qjhr** against esbuild 0.18.20 and 0.25.12. The [official GitHub advisory](https://github.com/advisories/GHSA-gv7w-rqvm-qjhr) was withdrawn because it identified the wrong package/ecosystem. This project uses npm/Node, not the referenced Deno module. Do not force unrelated esbuild consumers across major/minor ranges just to clear that withdrawn scanner label. After `ac0bcac` deployed, testing (17:44) and production (17:47) each report **one High / zero Moderate** in the hosting scanner: only this withdrawn advisory against esbuild 0.25.12 remains. All three active root findings are absent. npm audit reports zero; the hosting scanner retains a withdrawn label. This difference is documented rather than suppressed or presented as an active unpatched npm issue.

## Verification

- Clean `npm run install:ci` passed on Node 24 using the committed lockfile, without force or legacy peer flags.
- **82 unit tests passed**, including four new compatibility/security tests. The ZIP64 regression uses a 149-byte local fixture in a child process with a two-second kill bound; no remote attack test was performed.
- Hostinger standalone build, packaging and TypeScript passed.
- Drizzle generate reports no schema changes; check passes and all committed migration bytes are unchanged. No database was connected or migrated by these CLI checks.
- Focused ESLint for the new test passes. Full lint retains **one pre-existing error and 17 warnings**: the logo editor's `useExistingPath` callback name is classified as a Hook; the same error reproduces on the previous dependency graph. It is not a new minimatch/parser regression. No unrelated UI changes were added to this security patch.
- All six fresh disposable Hostinger security suites passed on their first attempt: admin/OTP/session, commerce/history ownership, Telegram/link/history, giveaway, Google and direct Telegram identities. The concurrent link result is 200/409 with exactly one identity and owner. Every external provider fallback was blocked; provider responses came from local fake fixtures.
- Separate Sites build and fresh local D1/R2 catalog/admin/logo integrations passed. All twelve preview probes passed, including raw Host/origin rejection, safe return redirects, guarded bridge context/invoke, refused client imports and denied private/outside file canaries. Client import is refused with 500; unauthenticated bridge access returns 403 and no bridge secret is exposed.
- Actual Miniflare Worker GET, UTF-8 POST/header and local upstream requests passed. Its installed Undici 7.30.1 rejects a disposable self-signed TLS certificate; certificate validation was never disabled.
- Owned app/database/preview processes stopped; fake canaries, development variables and certificates were removed. Existing review server was untouched. No live orders, provider messages, account linking, giveaway launch/entries or Sites publication occurred.

Both hosts passed all **14 bounded read-only checks** after deployment: public catalog/giveaway responses, private API authorization, no-store/noindex, browser security headers, analytics isolation and denied source/config paths. Catalogs retain 54 services; the giveaway remains draft with its 2/3/1 prize allocation. Chrome verified plan dialogs and account controls with no captured browser errors. The existing production account session, English preference and two-item cart were preserved. Public proof is ignored at `outputs/moderate-security-live-storefront-2026-11-15.png`.

These results cover the tested dependency graph and bounded application paths, not an exhaustive penetration test or host operating-system audit. Native Windows was not exercised on this Mac.

Ignored local evidence is under `outputs/security/`: `moderate-audit-before-2026-11-15.json`, `moderate-audit-after-2026-11-15.json`, `moderate-runtime-audit-2026-11-15.json`, unit/build/typecheck/Drizzle/lint logs, the Hostinger suite summary, Sites/Miniflare/TLS evidence, both hosted read-only summaries and hosting-scanner comparisons.
