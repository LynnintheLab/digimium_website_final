# Running HUB API Key

Running HUB has its own checkout at `/runninghub` on the Hostinger storefront. It uses the existing website account. The two packs are 10 USD for 70,000 MMK and 20 USD for 138,000 MMK. The checkout supports KPay and AYA Pay.

## Prepare sales

1. Open **Admin → Running HUB → Payment settings**. Save the verified account name and receiving number for each wallet and enable the methods you want to show.
2. Open **Inventory**, select the matching pack, and enter one valid, funded Running HUB API key per line. Import the keys through this form so the website stores them encrypted. Available stock and a saved payment destination are required before checkout will accept an order.
3. Confirm the two pack prices and review the purchase flow using synthetic stock and receipts in a disposable local database. Run `npm run build`, then `npm run test:runninghub` with the same empty loopback database setup used by the other Hostinger integrations.

## Review and deliver

The signed-in buyer chooses a pack and wallet. Their order holds one key for 30 minutes while they pay and upload the original receipt. A submitted receipt keeps the key reserved until payment review finishes.

Open a pending receipt in **Admin → Running HUB → Orders**. Check the amount, payee and transaction against the actual wallet record. Enter the transaction reference and approve. Approval and key assignment happen in the same database transaction. A wallet reference can be used once per method. Rejection releases the key for another order.

The customer can open the completed order and copy the assigned key in the same checkout page. Admin Orders shows the customer and assigned stock ID. The Admin reveal control opens the exact key for a single issued order if needed. The regular lists show stock IDs and counts.

The Hostinger app uses the dedicated `hostinger/runninghub-schema.sql` tables with the existing website database, authentication and fulfillment encryption secret. Back up the database and keep that secret available for previously imported stock and delivered keys.

## Connect the dedicated Admin Telegram bot

Create a separate bot with [BotFather](https://core.telegram.org/bots/features#botfather) and press **Start** in its private chat from the store owner's account. Use a normal private chat, or enable Threaded mode and supply the ID of its existing private **Payment approval** topic.

Create an ignored owner-only setup file with a generated webhook secret:

```sh
node scripts/configure-runninghub-admin-bot.mjs --init
```

Add the bot token and owner's positive numeric Telegram ID in `.env.runninghub-admin-bot.local`. To look up the ID on a new bot, run the following after pressing **Start**, using the owner's Telegram username:

```sh
node --env-file=.env.runninghub-admin-bot.local scripts/configure-runninghub-admin-bot.mjs --discover-owner @yourusername
```

Set the private values as individual runtime variables on the **production** Hostinger app for `buywith-digimium.store`. Preserve the app's current settings. Leave the last variable blank for an ordinary private chat.

| Variable | Value |
| --- | --- |
| `RUNNINGHUB_ADMIN_TELEGRAM_BOT_TOKEN` | Token of the dedicated bot |
| `RUNNINGHUB_ADMIN_TELEGRAM_OWNER_ID` | Numeric Telegram ID of the store owner |
| `RUNNINGHUB_ADMIN_TELEGRAM_WEBHOOK_SECRET` | Random secret in the ignored setup file |
| `RUNNINGHUB_ADMIN_TELEGRAM_PAYMENT_TOPIC_ID` | Optional existing private Payment approval topic ID |

After the production deployment has the matching values, connect and verify the webhook:

```sh
node --env-file=.env.runninghub-admin-bot.local scripts/configure-runninghub-admin-bot.mjs --apply
```

A receipt alert contains the submitted image, the order reference, the payment method and the expected amount. **Approve payment** opens a private reply prompt for the transaction reference checked in the receiving wallet. Reply to that specific message. The order service records the approval and issues the reserved key to the buyer's website account.

The standalone scheduler retries delivery and queues still-pending receipts when the bot is first enabled. For an older alert whose signing secret has been changed, review the order through the Admin website. Treat the private Telegram receipt and transaction reply as payment records in that chat.
