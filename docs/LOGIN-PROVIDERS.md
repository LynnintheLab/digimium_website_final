# Login methods and future setup

The current customer login screen offers email-first registration and sign-in. Google, Telegram and phone are disabled **Coming soon** options, as requested. Their account links, callback endpoints, SMS delivery and identity migrations are not implemented or activated in this release. Admin continues to use its separate owner-only email code.

Email flow: enter an email → existing account asks for its password; a new address shows that no account exists, asks for a new password (at least 10 characters), then a name. Customer creation happens only after the final submission. Account, checkout popup and Order history reuse the same form. The email routing endpoint returns only the next step, with same-origin checks, private responses and bounded request limits; it does disclose whether an email has an account to support this requested flow.

## Google

1. In Google Cloud, create or select a project and configure the Google Auth Platform branding, audience and OAuth consent details for Digimium.
2. Create an OAuth client of type **Web application**. The intended website origins are `https://buywith-digimium.store` and `https://test.buywith-digimium.store`; separate clients per environment simplify separation.
3. When the integration is implemented, register its exact HTTPS callback URL. The final callback paths must come from that implementation; none are active yet.
4. Store the client ID and secret in the corresponding Hostinger app’s private environment. The future login integration should request only identity scopes (`openid`, `profile`, `email`), validate signed identity tokens, and handle existing accounts without unsafe automatic merging.
5. Test with allowed test users on staging, then finish any required consent/publishing steps before public use.

[Google’s official OpenID Connect setup guide](https://developers.google.com/identity/openid-connect/openid-connect)

## Telegram

1. Create/select a Digimium bot through the official **@BotFather** account and give it a recognizable store name and logo.
2. Open the BotFather mini app, select that bot, and open **Login Widget**.
3. Add the website origins under **Allowed URLs**. When the integration exists, also add its exact callback URLs. Telegram rejects unregistered origins/redirects.
4. Keep the login **Client ID and Client Secret** from that section in Hostinger’s private environment. They are login credentials; having a bot API token alone is not the complete OIDC setup.
5. Implement and test the authorization-code flow with PKCE/state/nonce and signature validation before enabling the button. Telegram identities may not supply an email; the customer data model needs to support that without fabricated emails.

[Telegram’s official login and BotFather setup guide](https://core.telegram.org/bots/telegram-login)

## Phone number

Choose an SMS verification service first. **Twilio Verify** is one option, not a service already purchased or connected to this project.

1. Create a provider account, set up billing, and create a Verify Service with SMS enabled.
2. Configure the destination-country/geo permissions and a spending limit. Confirm support and requirements for the phone numbers your customers actually use.
3. Keep the Account SID, Auth Token and Verify Service SID in Hostinger’s private environment. Do not put real credentials in Git or chat.
4. Implement code sending/checking, rate limits, resend delays, expiring browser-bound challenges and customer-name completion. A phone-only customer must not receive an invented email or password.
5. Test delivery to real target-carrier numbers in staging before enabling phone login publicly. SMS verification has usage costs and delivery can vary by carrier.

[Twilio Verify setup guide](https://www.twilio.com/docs/verify/quickstarts/node-express)

## Release sequence

Prepare the provider accounts → implement identity/session and callback handling → test on the isolated staging database → configure the production app privately → enable each provider only after its own checks pass. The existing email and Telegram-only purchase routes can continue working throughout. Creating provider accounts alone will not activate the Coming soon buttons.
