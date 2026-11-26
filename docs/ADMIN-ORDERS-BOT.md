# Digimium Admin Orders bot

Use [Digimium Admin Orders](https://t.me/DigimiumAdminOrdersBot) as the private owner bot for the main store. Running HUB is its first payment approval integration. Add later website checkout flows to the same bot and webhook.

Create a separate bot with [BotFather](https://core.telegram.org/bots/features#botfather) and press **Start** in its private chat from the store owner's account. Use a normal private chat, or enable Threaded mode and supply the ID of its existing private **Payment approval** topic.

Create an ignored owner-only setup file with a generated webhook secret:

```sh
node scripts/configure-admin-orders-bot.mjs --init
```

Add the bot token and owner's positive numeric Telegram ID in `.env.admin-orders-bot.local`. To look up the ID on a new bot, run the following after pressing **Start**, using the owner's Telegram username:

```sh
node --env-file=.env.admin-orders-bot.local scripts/configure-admin-orders-bot.mjs --discover-owner @yourusername
```

Set the private values as individual runtime variables on the **production** Hostinger app for `buywith-digimium.store`. Preserve the app's current settings. Leave the last variable blank for an ordinary private chat.

| Variable | Value |
| --- | --- |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_BOT_TOKEN` | Token of the shared Digimium Admin Orders bot |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_OWNER_ID` | Numeric Telegram ID of the store owner |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_WEBHOOK_SECRET` | Random secret in the ignored setup file |
| `DIGIMIUM_ADMIN_ORDERS_TELEGRAM_PAYMENT_TOPIC_ID` | Optional existing private Payment approval topic ID |

After the production deployment has the matching values, connect and verify the webhook:

```sh
node --env-file=.env.admin-orders-bot.local scripts/configure-admin-orders-bot.mjs --apply
```

A receipt alert contains the submitted image, the order reference, the payment method and the expected amount. Check the transfer amount and recipient in the receiving wallet, then tap **Approve payment** on the receipt alert. This records the decision and issues the reserved key to the buyer’s website account in one action. If the exact same screenshot was already used for an approved order, the bot identifies it as a duplicate. Get the payment-specific receipt before approving a different transfer.

After a successful approval, the same private Admin chat gets a payment confirmation with the order reference, the customer account name, and their registered email or verified Telegram username when available. The buyer opens the issued key on the website.

The standalone scheduler retries receipts and approval confirmations, and queues still-pending receipts when the bot is first enabled. For an older alert whose signing secret has been changed, review the order through the Admin website. The original receipt stays available to the owner in the private Telegram chat and the Admin order.
