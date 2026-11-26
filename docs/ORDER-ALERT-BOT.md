# Dedicated order-alert bot

Use the dedicated bot with the owner’s private Telegram chat on the testing environment.

| Topic | Workflow |
| --- | --- |
| **Orders** | See new orders as soon as the website saves them. Alerts include the order reference, items, total and a protected Admin link. |
| **Payment approval** | View the submitted website receipt in the private topic and tap **Approve payment**. The protected Admin link opens the same order. |
| **Order send** | Tap **Send order** after payment approval, or as soon as a zero-total order is ready. Delivery appears in the customer’s website Order History. |
| **Registration** | See first-time website account registrations by email, Google or Telegram. Alerts include the account reference, sign-in method and a protected Admin link. |

When a delivery needs account details, open **Add or edit delivery details in Admin** from the Order send alert. Save dates, email, password, username, manager, a per-product note or an order note as needed. After saving, use the newest **Send order** button. The website encrypts delivery details and displays them in the owning customer's Order History. Sending without a draft starts the term on the send date in Myanmar time and uses its saved duration when available.

For a receipt that was submitted before photo alerts were enabled, use **Show receipt in Telegram** in the reviewing Admin order. The bot uploads the exact current proof to the configured private owner topic. New receipts appear there automatically.

| Environment variable | Value |
| --- | --- |
| `ORDER_ALERTS_TELEGRAM_BOT_TOKEN` | Dedicated alert bot token |
| `ORDER_ALERTS_TELEGRAM_CHAT_ID` | Owner’s positive numeric private Telegram user/chat ID |
| `ORDER_ALERTS_TELEGRAM_PAYMENT_TOPIC_ID` | Payment approval topic ID |
| `ORDER_ALERTS_TELEGRAM_ORDERS_TOPIC_ID` | Orders topic ID |
| `ORDER_ALERTS_TELEGRAM_REGISTRATION_TOPIC_ID` | Registration topic ID |
| `ORDER_ALERTS_TELEGRAM_FULFILLMENT_TOPIC_ID` | Order send topic ID |
| `ORDER_ALERTS_TELEGRAM_WEBHOOK_SECRET` | Dedicated random secret for the testing order bot webhook and signing buttons |
| `ORDER_ALERTS_TELEGRAM_BOT_USERNAME` | Optional public status-link handle. Testing defaults to `DigimiumTestingOrdersBot`. |

## Prepare Telegram

1. Open the verified **@BotFather** account. Create the dedicated bot with `/newbot` if needed, then save its token privately. Telegram also provides the BotFather Mini App for managing bots. [Official BotFather guide](https://core.telegram.org/bots/features#botfather)
2. Select that bot in BotFather’s settings and enable **Threaded mode**. Telegram’s official documentation uses this setting name. BotFather’s current interface is the authority for the surrounding menu labels. [Official private-topic configuration](https://core.telegram.org/api/forum#bot-forums)
3. Open the new bot from the owner’s Telegram account and press **Start**. Use that account’s existing verified positive numeric ID for the private chat destination. [Official bot interaction guide](https://core.telegram.org/bots/features#global-commands)
4. Create `.env.order-alerts.testing.local` with owner-only access, then enter the dedicated token and owner ID. Keep topic variables empty on first setup, or retain their existing IDs when continuing a previous setup. The repository ignores this filename.

```dotenv
ORDER_ALERTS_TELEGRAM_BOT_TOKEN=
ORDER_ALERTS_TELEGRAM_CHAT_ID=
ORDER_ALERTS_TELEGRAM_PAYMENT_TOPIC_ID=
ORDER_ALERTS_TELEGRAM_ORDERS_TOPIC_ID=
ORDER_ALERTS_TELEGRAM_REGISTRATION_TOPIC_ID=
ORDER_ALERTS_TELEGRAM_FULFILLMENT_TOPIC_ID=
ORDER_ALERTS_TELEGRAM_WEBHOOK_SECRET=
ORDER_ALERTS_TELEGRAM_BOT_USERNAME=
```

## Create the four topics

Run from the repository root with Node.js 24 after the owner has pressed Start.

```sh
node scripts/setup-order-alert-bot.mjs --env-file=.env.order-alerts.testing.local
```

The helper verifies the bot identity, its `has_topics_enabled` flag and the exact private chat destination. It creates missing topics with `createForumTopic` and stores each returned `message_thread_id` in the environment file. Existing IDs are reused. Normal application delivery addresses a category through `sendMessage.message_thread_id`. [Official Bot API](https://core.telegram.org/bots/api#createforumtopic)

The helper calls `getMe`, `getChat` and `createForumTopic`. Telegram displays the resulting topic-creation service entries. The helper writes a mode-0600 environment file, a matching private `.topics.json` progress journal and a temporary `.setup.lock`. Keep the journal with the local environment during setup and recovery. On Windows, keep these files in the owner’s private user folder and preserve its access permissions.

## Resume interrupted setup

Rerun the same command after a confirmed API rejection or local interruption. Completed IDs are recovered from the journal and reused.

If topic creation has an uncertain network outcome, setup stops with the affected category. Check the bot’s private chat before continuing. When a topic link is available, its final numeric segment is the topic ID in `https://t.me/<bot_username>/<message_thread_id>`. Enter that value in the corresponding environment variable and rerun. Telegram documents this link format for private bot topics. [Official topic links](https://core.telegram.org/bots/api#createforumtopic)

If inspection confirms that the topic was never created, retry that specific pending category. Substitute `orders`, `registration` or `fulfillment` when indicated by the helper.

```sh
node scripts/setup-order-alert-bot.mjs --env-file=.env.order-alerts.testing.local --retry-pending=payment
```

If a terminated process left a `.setup.lock`, first confirm that setup has ended, then remove that lock file and rerun. Retain `.topics.json` so known and uncertain operations remain recoverable. Changing the configured bot or owner requires a separate matching private environment and journal.

## Configure testing

Generate the webhook secret with 32 random bytes encoded as base64url and save it privately. Import all seven `ORDER_ALERTS_TELEGRAM_*` values into the testing Hostinger application’s environment settings, then deploy the testing revision. Keep the environment file and journal outside Git. The notification outbox delivers queued alerts through the configured topics.

For **the dedicated testing bot**, configure `setWebhook` with URL `https://test.buywith-digimium.store/api/internal/order-bot/webhook`, `allowed_updates: ["callback_query", "message"]`, and `secret_token` matching the private testing environment value. Keep the bot’s `callback_query_mode` set to `default` so the callback includes its source topic message. Verify the URL and allowed update types with `getWebhookInfo`. [Official Bot API webhook settings](https://core.telegram.org/bots/api#setwebhook) · [Official bot settings](https://core.telegram.org/bots/api#setmysettings)

Buttons bind the owner, private topic and exact proof or delivery draft. An earlier button cannot act on a newer screenshot or a changed draft. Alerts created under the earlier workflow may still show an Approve order button. Review the payment and use the current Send order alert.

Customers with a verified linked Telegram identity can open the testing order bot from Account, checkout or Order History and press **Start** once. The bot sends a private message when a website order is created, its payment or quote status changes, it is delivered, or it is rejected. Each message includes the order reference, product and plan names, the current status and a link to the protected website. Delivery credentials and API key values are available in the customer’s website Order History.

Customers can send `/status` at any time to see the current status of their latest orders, including existing orders added by Admin. If the bot could not reach a private chat before **Start**, the command shows the current state and future status changes can arrive automatically. When the testing [notification job](NOTIFICATIONS.md#schedule-every-five-minutes) is configured, it retries recoverable delivery failures. Superseded status updates are discarded.

During implementation, verify routing with intercepted Telegram responses and disposable local data. Record actual hosted delivery separately when the owner authorizes a real alert. The production customer-login configuration continues to use its existing `TELEGRAM_BOT_*` and webhook settings.

The dedicated action webhook is enabled only for Digimium’s testing origin. Checkout and the existing Admin website workflow work independently of this bot.
