# Notes

## Current status
2026-11-10: Digimium storefront now uses soft blue/lavender gradients and original-color logos, with Manrope English and Wa Lone Myanmar. The /admin panel manages the catalog and contact details with persistent D1 storage. Ordering remains email/Viber; checkout is deferred.

## Last thing done
Implemented server-protected catalog editing, schema migration, published/featured controls, prices/durations, availability, contact settings, and new sourced service marks. Integration checks passed authorization, input validation, cross-origin protection, persistent edits, storefront updates, hidden services, stale revisions, and concurrent saves. Local test content was restored. Browser automation was unavailable because browser use is disabled in Work settings, so updated visual layouts await user review. Publication attempt is blocked because the Sites connector now returns project_not_found for the existing project. The original site ID is preserved; do not create a replacement site.

## Next steps
- Review storefront and /admin after signing in with the site owner's account.
- Enter verified current plans and prices through admin.
- Add checkout later with an agreed payment provider.
- Optional personal private GitHub mirror for Mac/Windows sync remains undecided; the Sites source repository is already versioned.
