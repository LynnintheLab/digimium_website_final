# Dedicated order-alert bot

Use the dedicated alert bot with the owner’s private Telegram chat on the testing environment. The three topics are **Payment approval**, **Orders** and **Registration**.

| Environment variable | Value |
| --- | --- |
| `ORDER_ALERTS_TELEGRAM_BOT_TOKEN` | Dedicated alert bot token |
| `ORDER_ALERTS_TELEGRAM_CHAT_ID` | Owner’s positive numeric private Telegram user/chat ID |
| `ORDER_ALERTS_TELEGRAM_PAYMENT_TOPIC_ID` | Payment approval topic ID |
| `ORDER_ALERTS_TELEGRAM_ORDERS_TOPIC_ID` | Orders topic ID |
| `ORDER_ALERTS_TELEGRAM_REGISTRATION_TOPIC_ID` | Registration topic ID |

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
```

## Create the three topics

Run from the repository root with Node.js 24 after the owner has pressed Start.

```sh
node scripts/setup-order-alert-bot.mjs --env-file=.env.order-alerts.testing.local
```

The helper verifies the bot identity, its `has_topics_enabled` flag and the exact private chat destination. It creates missing topics with `createForumTopic` and stores each returned `message_thread_id` in the environment file. Existing IDs are reused. Normal application delivery addresses a category through `sendMessage.message_thread_id`. [Official Bot API](https://core.telegram.org/bots/api#createforumtopic)

The helper calls `getMe`, `getChat` and `createForumTopic`. Telegram displays the resulting topic-creation service entries. The helper writes a mode-0600 environment file, a matching private `.topics.json` progress journal and a temporary `.setup.lock`. Keep the journal with the local environment during setup and recovery. On Windows, keep these files in the owner’s private user folder and preserve its access permissions.

## Resume interrupted setup

Rerun the same command after a confirmed API rejection or local interruption. Completed IDs are recovered from the journal and reused.

If topic creation has an uncertain network outcome, setup stops with the affected category. Check the bot’s private chat before continuing. When a topic link is available, its final numeric segment is the topic ID in `https://t.me/<bot_username>/<message_thread_id>`. Enter that value in the corresponding environment variable and rerun. Telegram documents this link format for private bot topics. [Official topic links](https://core.telegram.org/bots/api#createforumtopic)

If inspection confirms that the topic was never created, retry that specific pending category. Substitute `orders` or `registration` when indicated by the helper.

```sh
node scripts/setup-order-alert-bot.mjs --env-file=.env.order-alerts.testing.local --retry-pending=payment
```

If a terminated process left a `.setup.lock`, first confirm that setup has ended, then remove that lock file and rerun. Retain `.topics.json` so known and uncertain operations remain recoverable. Changing the configured bot or owner requires a separate matching private environment and journal.

## Configure testing

Import the five `ORDER_ALERTS_TELEGRAM_*` values into the testing Hostinger application’s private environment settings, then deploy the reviewed testing revision. Keep the environment file and journal outside Git. The existing notification runner delivers queued alerts through the configured categories.

During implementation, verify routing with intercepted Telegram responses and disposable local data. Record actual hosted delivery separately when the owner authorizes a real alert. The production customer-login configuration continues to use its existing `TELEGRAM_BOT_*` and webhook settings.

This runbook and helper were prepared from the official Telegram documentation on 22 November 2026. A successful local mock test establishes helper behavior. Actual BotFather settings, topic creation and hosted delivery require their own observed results.
