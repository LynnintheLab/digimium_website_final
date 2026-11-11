# Catalog administration

On the Hostinger testing site, open `/admin`, enter the owner email and type the six-digit code from your inbox in the same browser within 10 minutes. This browser profile stays signed in for up to 180 days. A new browser or device, clearing the site’s cookies, signing out, or an expired session requires another code. Use **Sign out** when finished on a shared device. Customers can browse the storefront without signing in. [Hostinger setup](HOSTINGER.md)

On the earlier Sites deployment, use ChatGPT sign-in with an account listed in the hosted `ADMIN_EMAILS` setting.

## Edit a service

1. Search or filter Services, then select a service.
2. Edit its name, category, English/Myanmar descriptions, price, duration, availability, and display options.
3. Manage its plans and logo as needed.
4. Choose **Save changes**. All draft catalog changes save together.

On phones and smaller tablets, the list and editor appear separately. **Back to services** returns to the list without discarding the draft. Save/Revert remain available in the bottom action area.

**Revert** restores the last loaded/saved catalog after confirmation. Leaving with unsaved changes triggers the browser's unsaved-work warning. Failed saves leave the draft available to correct or retry. If another editor saves first, reload the latest catalog and reapply your intended changes; stale saves are rejected.

## Add a product

Choose **Add service**, supply the required details, select a category, and review before publishing. The catalog supports up to 100 products. Each product has a stable ID; changing an ID manually can invalidate customer cart references.

- **Published** controls presence in the public catalog.
- **Featured** controls inclusion in the featured storefront collection.
- **Available**, **On request**, and **Unavailable** describe purchase availability. Unavailable services cannot be added to checkout.

## Plans and prices

Each product supports up to 30 plans. Add the plan name, price, and duration, then enable **Show on website** for the plans customers should see. Both the plan and service must be published. New plans begin as drafts.

Preserve the owner's selected public plan list. Existing hidden alternatives remain in admin; do not publish every imported option automatically.

Leave a price empty for a quote. The order flow displays the red Myanmar checkout guidance, with the additional price-enquiry sentence for unpriced selections. An unpriced selected plan remains an enquiry even if its parent product has a service-level price. A total appears only when every line can safely be read as an MMK amount. Unknown or unrecognized amounts require confirmation.

The card highlights its first visible plan. The product dialog lists all visible alternatives. A service without a visible plan can support a general enquiry using its service-level price/duration when available.

## Hide all short descriptions

In **Services**, turn on **Hide all short descriptions**, then **Save changes**. This hides English and Myanmar short descriptions from public cards, product dialogs, and the public catalog response.

The original text remains stored and editable in admin. Turn the setting off and save to show it again. It does not erase text, hide products, or change plans and prices.

## Upload and reuse logos

1. Under **Product logo**, choose **Upload logo** or **Replace logo**.
2. Select PNG, JPEG, or still WebP, up to 2 MiB and 4096 × 4096 pixels.
3. After upload succeeds, choose **Save changes** to attach it to the service.

The upload stores the image in Hostinger MySQL or Sites R2 and creates a path such as `/media/logos/<generated-id>.png`. **Copy path** copies this relative URL. **Use a saved logo path** reuses an existing upload from the same site's storage. Arbitrary external image URLs and SVG uploads are not supported.

The built-in icon is used when no upload is selected. Removing a logo detaches it after saving; it does not delete the stored file, preserving other products using that path. Uploaded files need backups separate from Git.

## Contact settings and orders

Use Settings to edit Telegram, email, and Viber contacts, then save. Enter a Telegram username, not a share link or bot token. That username determines the checkout DM.

The website prepares and copies an order; it does not send the customer's message. Large orders may be split into numbered drafts. Customers send each part in the same conversation. Clipboard restrictions have a manual-copy fallback.

## Data and recovery

Admin saves write a complete, versioned snapshot to MySQL on Hostinger or D1 on Sites. Seed JSON initializes an empty database only; changing seed files does not replace an existing saved catalog.

There is no automatic Git commit for admin edits and no built-in backup/export button. Use the authenticated catalog endpoint and supported storage tools described in [Deployment and recovery](DEPLOYMENT.md). Public catalog data is not a full backup because hidden products/plans and optionally descriptions are omitted.
