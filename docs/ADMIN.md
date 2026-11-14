# Catalog administration

On either Hostinger site, open `/admin`, enter the owner email and type the six-digit code from your inbox in the same browser within 10 minutes. This browser profile stays signed in for up to 180 days. A new browser or device, clearing the site’s cookies, signing out, or an expired session requires another code. Use **Sign out** when finished on a shared device. Customers can browse the storefront without signing in. [Hostinger setup](HOSTINGER.md)

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
- **Feature this service** includes the service in the featured storefront collection.
- **Best Seller** under **On your website** adds a badge to the published product. Each plan has its own checkbox.
- **Available**, **On request**, and **Unavailable** describe purchase availability. Unavailable services cannot be added to checkout.

## Plans and prices

Each product supports up to 30 plans. Enter a plan name and price. For a service or plan duration, enter a whole number and choose **Day**, **Month**, or **Year**. Leave the number empty for an unspecified duration. Existing offers with custom durations keep their original wording until you edit them.

For a bonus period, enter the paid duration, choose **Add gift duration**, then enter the gift quantity and unit. For example, 3 months with a 1-month gift appears as **3 months + 1 month free** in English and **3 လ + 1 လ လက်ဆောင်** in Myanmar. **Remove gift** leaves the paid duration in place.

To run a sale, enter the **Regular price** with its MMK currency and a lower **Discount price**. For example, enter **30,000 MMK** and **25,000**. Customers see the original price crossed out and pay 25,000 MMK per item. The cart and Telegram order use this price. Clear the discount price and save to end the sale.

Use the up and down arrows beside a plan to move it one position. Enable **Show on website** for the plans customers should see, then choose **Save changes**. The storefront shows published plans in the saved order. Both the plan and service must be published. New plans begin as drafts.

Select **Best Seller** under an individual plan to label that option in the plan picker. You can mark multiple plans and set each badge independently of the product badge. Clear a checkbox and save to remove its badge.

Preserve the owner's selected public plan list. Existing hidden alternatives remain in admin; do not publish every imported option automatically.

Leave a price empty for a quote. The order flow displays the red Myanmar checkout guidance, with the additional price-enquiry sentence for unpriced selections. An unpriced selected plan remains an enquiry even if its parent product has a service-level price. A total appears only when every line can safely be read as an MMK amount. Unknown or unrecognized amounts require confirmation.

The card shows the first published plan’s price. If you mark plans as **Best Seller**, the card also identifies the first marked, published plan in the saved order. The product dialog lists all visible alternatives with their individual badges. A service without a visible plan can support a general enquiry using its service-level price/duration when available.

## Landing page showcase

The first panel rotates through marked best sellers, plans with gift time, and discounted offers. Clicking an offer opens its plan. A product with published plans uses those plans’ gift durations and prices. A product without published plans uses its own. Only published, orderable products appear here.

When there are no active gifts or discounts, category collections rotate alongside any marked best sellers. The catalog filters below the panel stay available in either case.

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

## Guest and account orders

Orders includes both registered customers and guests. A Telegram-only row shows **Telegram guest** and has no email or customer account; older named guest orders keep their supplied nickname. Search by the order reference, match it to the customer’s Telegram message, and confirm payment and deliver access there. Approve the plan dates in admin afterward. Guest dates stay in the admin record; signed-in purchases appear in that customer’s Order history with time remaining. The customer’s Account panel previews three recent plans and links to the full history.

## Data and recovery

Admin saves write a complete, versioned snapshot to MySQL on Hostinger or D1 on Sites. Seed JSON initializes an empty database only; changing seed files does not replace an existing saved catalog.

There is no automatic Git commit for admin edits and no built-in backup/export button. Use the authenticated catalog endpoint and supported storage tools described in [Deployment and recovery](DEPLOYMENT.md). Public catalog data is not a full backup because hidden products/plans and optionally descriptions are omitted.
