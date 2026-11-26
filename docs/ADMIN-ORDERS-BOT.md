# Digimium Admin Orders bot

Use [Digimium Admin Orders](https://t.me/DigimiumAdminOrdersBot) as the private owner bot for the main store. The bot shows new orders as soon as the website saves them.

| Topic | What appears |
| --- | --- |
| Orders | New standard storefront orders with a labeled Order ID, order time in Myanmar time, products, total, and an Admin link |
| Running HUB Orders | New Running HUB API Key reservations, original payment receipts with the approval button, and payment confirmations. Each shows the Order ID and original order time in Myanmar time. |
| Account Registration | New website accounts with the sign-up method, name, available email and verified Telegram username, Telegram display name for Telegram sign-ups, registration time in Myanmar time, and an Admin link |

Each alert starts with one icon and a bold heading. The account or order ID and original timestamp are grouped at the top. The relevant account or order details follow underneath.

Website Telegram order drafts show the customer's verified `@username` if available. The order reference can be used to look up the record in Admin.

Enable Threaded mode and the topic sidebar for the dedicated bot in Telegram. Create the topics in the store owner's existing private chat and retain their IDs. Keep `callback_query_mode` set to `default` for the existing approval buttons. [Telegram bot settings](https://core.telegram.org/bots/api#setmysettings)

Create an ignored owner-only setup file with a generated webhook secret:

```sh
node scripts/configure-admin-orders-bot.mjs --init
```

Add the bot token and owner's positive numeric Telegram ID in `.env.admin-orders-bot.local`. To look up the ID on a new bot, run the following after pressing **Start**, using the owner's Telegram username:

```sh
node --env-file=.env.admin-orders-bot.local scripts/configure-admin-orders-bot.mjs --discover-owner @yourusername
```

Set the private values as individual runtime variables on the **production** Hostinger app for `buywith-digimium.store`. Add the three topic IDs in the same Hostinger environment update. Leave an existing legacy payment-topic setting in place so older signed buttons can still be used.

| Variable | Value |
| --- | --- |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN` | Token of the shared Digimium Admin Orders bot |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID` | Numeric Telegram ID of the store owner |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET` | Random secret in the ignored setup file |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_ORDERS_TOPIC_ID` | Private Orders topic ID |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_RUNNINGHUB_TOPIC_ID` | Private Running HUB Orders topic ID |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_REGISTRATION_TOPIC_ID` | Private Account Registration topic ID |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_PAYMENT_TOPIC_ID` | Optional legacy payment topic ID, used for older signed approvals |

For existing installations, verify the bot and webhook using `--check`. For a fresh installation, connect and verify the webhook after the production deployment has the matching settings:

```sh
node --env-file=.env.admin-orders-bot.local scripts/configure-admin-orders-bot.mjs --apply
```

A receipt alert identifies the product as **Running HUB API Key** and includes the submitted image, order reference, payment method and expected amount. Check the transfer amount and recipient in the receiving wallet, then tap **Approve payment** on the receipt alert. This records the decision and issues the reserved key to the buyer’s website account in one action. If the exact same screenshot was already used for an approved order, the bot identifies it as a duplicate. Get the payment-specific receipt before approving a different transfer.

After a successful approval, the Running HUB Orders topic gets a confirmation with the order reference and available contact label. Telegram customers are shown by their verified username when available. Email accounts can be identified by their registered email. The buyer opens the issued key on the website.

The standalone scheduler retries receipts and approval confirmations, and queues still-pending receipts when the bot is first enabled. For an older alert whose signing secret has been changed, review the order through the Admin website. The original receipt stays available to the owner in the private Telegram chat and the Admin order.
