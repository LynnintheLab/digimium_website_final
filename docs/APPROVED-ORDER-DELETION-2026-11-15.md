# Approved-order deletion

Runtime **`070fa92`** reached **Hostinger Completed/Current on testing and production** on 15 November 2026. Final local and bounded hosted verification passed.

## Owner workflow

Open **Admin → Orders → Approved → Delete**, or open an approved order and choose **Delete approved order**. Review its reference, products and total, then type the displayed reference (including `#`) to enable **Delete order**. Cancel or Escape closes the dialog and restores focus. Pending orders retain their existing Remove action.

Deletion permanently removes the selected order, its snapshot, saved plan dates and encrypted purchased-account details. Subsequent customer history/plan reads and Telegram history/plan commands omit that order. Other orders, customer accounts, sessions and connected identities remain intact. Already-open views require their existing refresh/reopen behavior. Historical Telegram messages and the existing tab-local checkout receipt are separate copies; deleting a database record does not erase those copies or manage delivered service access.

The owner will delete test/real records himself. **No live order or customer was edited/deleted, and Kosai Namti was untouched.**

## Protection and verification

- Admin authorization, same-origin mutation checks, strict 1KB JSON, full UUID confirmation and exact revision remain enforced. A transaction locks the same row used by approval/fulfillment updates, then deletes by ID/revision. Stale confirmation returns 409; missing/deleted orders return 404. No schema, provider or dependency changes.
- Three fresh disposable integrations passed on their first attempt: commerce, customer administration and Telegram protocol/history. New cases cover approved customer/guest removal, complete history/plan disappearance, unchanged unrelated rows, pending-confirmation staleness after approval, approved fulfillment-update/deletion races and concurrent duplicate deletes. The backend deletes were performed only in these local fixtures.
- Existing **87 unit tests**, strict full lint (**0 errors / 0 warnings**), Node 24 standalone build/packaging/typecheck and separate Sites build passed. The existing Vinext dependency bundler notice remains separate from ESLint.
- Chrome local checks cover list/detail Delete controls, blank/wrong confirmation disabled, exact confirmation enabled, Cancel/Escape and restored focus, pending Remove, and the dialog fitting a 390px viewport without horizontal overflow. No final destructive browser button was clicked. Final single-line confirmation-label build/check also passed with no captured application errors. Owned fixtures stopped, fake configuration/cookies were removed and the unrelated review server was preserved. Both hosts passed six bounded read-only GET checks, with public campaign dates/status/prizes unchanged. Production Chrome verified Delete controls on all five visible approved rows, the pending Remove control, no open deletion dialog and no captured application errors. Kosai Namti remained present after the customer directory finished loading. No live mutation or destructive-control click occurred.

Ignored evidence is under `outputs/security/approved-removal-*`. The synthetic confirmation screenshot is `outputs/approved-order-delete-dialog-local-2026-11-15.png`. Physical Windows/iOS/Android devices were not exercised. Provider apps/links were not opened.
