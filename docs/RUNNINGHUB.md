# Running HUB API Key

Running HUB has its own checkout at `/runninghub` on the Hostinger storefront. Buyers create a Digimium account or sign in at checkout before reserving a bundle. The two packs are 10 USD for 70,000 MMK and 20 USD for 138,000 MMK. The checkout supports KPay and AYA Pay.

## Prepare sales

1. Open **Admin → Running HUB → Payment settings**. Save the verified account name and receiving number for each wallet and enable the methods you want to show.
2. Set the key’s usage limit in RunningHub to match its bundle. In Digimium Admin, open **Inventory** and select that bundle. Enter its name, such as **Key 1 / 10 USD**, in **Key name (optional)** and paste the value in **API keys**. To import several unnamed keys, leave the name blank and paste one key per line. The website stores key values encrypted. Checkout requires available stock and a saved payment destination.
3. Confirm the two pack prices and review the purchase flow using synthetic stock and receipts in a disposable local database. Run `npm run build`, then `npm run test:runninghub` with the same empty loopback database setup used by the other Hostinger integrations.

## Review and deliver

The signed-in buyer chooses a pack and wallet. Their order holds one key for 30 minutes while they pay and upload the original receipt. A submitted receipt keeps the key reserved until payment review finishes.

Open a pending receipt in **Admin → Running HUB → Orders**. Check the amount, payee and transaction against the actual wallet record. Select **Approve payment & issue key**. Approval and key assignment happen in the same database transaction. The same submitted image cannot approve a second order. Rejection releases the key for another order.

The customer can open a pending or purchased Running HUB order from Order history. The details page shows the current status. After approval, **View API key** shows the saved name above the key. **Copy API key** copies the key value. **Check Balance** opens [Keymeter](https://keymeter.lynninthelab.space/) in a new tab for a manual balance check. **Copy Website Link** copies the public checker URL. Admin Inventory shows each saved name, and the approved order record shows the name and stock ID. The Admin reveal control opens the exact key for a single issued order if needed.

The Hostinger app uses the dedicated `hostinger/runninghub-schema.sql` tables with the existing website database, authentication and fulfillment encryption secret. Back up the database and keep that secret available for previously imported stock and delivered keys.

## Telegram approval

The shared [Digimium Admin Orders bot](ADMIN-ORDERS-BOT.md) can receive Running HUB payment receipts and approve Running HUB orders. The buyer receives the issued key on the website.
