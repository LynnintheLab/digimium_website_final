# Customer login methods

Customer login has a shared form in Account, Order history and the checkout popup. Email registration/sign-in remains available. This build adds Google sign-in support, but the Google option is available only after that Hostinger app has working Google OAuth credentials. Having the source code deployed does not mean an OAuth client has been created or approved. Telegram and phone sign-in remain **Coming soon**.

Admin continues to use its separate owner-only email code. Customer Google sign-in does not grant admin access.

## Email and Google account behavior

- Email flow: enter an address → a password account asks for its existing password; a new address chooses a password of at least 10 characters, then a name. Customer creation happens only after final submission.
- A Google-only account does not have a fabricated website password. Email entry for that account directs the customer to Google.
- A new Google identity can create an account using its verified email and profile name. If a usable profile name is missing, the form asks for one.
- If the verified Google email already belongs to an email/password account, the customer must confirm that account’s existing password before Google is attached. Matching email text alone does not merge accounts or expose another customer’s orders.
- Subsequent Google sign-ins use the stable Google subject identifier. A changed Google email does not transfer an existing Google identity to a different website account.
- Checkout authentication returns to cart review. Signing in does not place an order automatically.

The email routing endpoint returns only the next sign-in step, with same-origin checks, private responses and request limits. It discloses whether an email has an account to support this requested flow.

## Set up Google in Google Cloud

Use a project owned by the business. Separate OAuth clients for staging and production keep their settings independent.

1. Open [Google Cloud Console](https://console.cloud.google.com/), select or create the project, and open **Google Auth Platform**.
2. Configure **Branding** with the Digimium application name, support/contact email and website details. Configure **Audience** for the customers who should be allowed to sign in. A public shop normally needs **External**, rather than an organization-only audience.
3. Open **Clients → Create client**, choose **Web application**, and give it an environment-specific name such as `Digimium staging`.
4. Add the corresponding origin and exact redirect URI from the table below. They must match the Hostinger app’s `APP_ORIGIN`; do not add a trailing slash to the callback path.
5. Keep the client ID and secret in that app’s private Hostinger environment. Do not paste secrets into chat or commit downloaded credentials to Git.
6. The current Google app uses **External / Testing**. Google exempts requests limited to `openid`, `email` and `profile` from the test-user allowlist requirement, so these sign-ins do not require adding every customer or publishing the app just for access. Recheck the rules before adding any other scope. Workspace administrator or account-protection policies can still block individual accounts.

| Environment | Website origin | Authorized redirect URI |
| --- | --- | --- |
| Production | `https://buywith-digimium.store` | `https://buywith-digimium.store/api/customer/google/callback` |
| Staging | `https://test.buywith-digimium.store` | `https://test.buywith-digimium.store/api/customer/google/callback` |

The integration requests identity scopes only: `openid`, `profile` and `email`. It does not need access to Drive, Gmail or Calendar. Do not assume the generic Testing notice in Google Cloud removes the documented basic-identity exception, and do not promise that every account or browser will show identical consent/warning screens.

[Google’s official OpenID Connect setup guide](https://developers.google.com/identity/openid-connect/openid-connect) · [Testing exception for basic identity scopes](https://support.google.com/cloud/answer/15549945?hl=en) · [OAuth app-state comparison](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

## Configure the Hostinger app

Set these server-side values on each app separately:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Web OAuth client ID for that environment |
| `GOOGLE_CLIENT_SECRET` | Secret belonging to that client |
| `APP_ORIGIN` | Exact HTTPS website origin from the table above |
| `ADMIN_AUTH_SECRET` | Existing stable application secret of at least 32 characters; keep its current value |

The example environment files contain blank Google keys. Both Google values are required. Restart/redeploy the Hostinger app after applying them, then inspect `GET /api/customer/google` for the public enabled/disabled capability result. That endpoint does not return the secret.

Do not rotate the existing application or fulfillment secrets just to add Google login; existing sessions, pending authentication state and encrypted order recovery depend on their configured keys. See [Hostinger setup](HOSTINGER.md) for backups and secret handling.

### Google database additions

The first Google flow creates the protocol challenge table from [google-auth-schema.sql](../hostinger/google-auth-schema.sql). Identity handling adds [google-identity-schema.sql](../hostinger/google-identity-schema.sql) and makes the existing customer `password_hash` column nullable for Google-only customers. Customer email remains required. Existing password hashes and purchase records are preserved.

The app database user needs **CREATE**, **REFERENCES** and **ALTER** privileges. Importing `CREATE TABLE IF NOT EXISTS` files alone does not change an existing non-null password column. Back up the customer, session, identity, challenge and order tables together before first activation; the app performs its checked migration on first use. Do not manually clear live tables to complete setup.

### Staging checks before public activation

1. Check a new Google customer and repeat sign-in into the same account.
2. Check a local email/password customer with the same Google email: the existing password must be required once before linking, and the old order history must remain with that account.
3. Check cancellation, a closed/blocked popup, expired state, wrong callback state, replay attempts and a missing profile name.
4. Check Account, Order history and checkout on desktop and a phone. Checkout must return to the original cart without submitting it.
5. Sign out and confirm private history is no longer available. Repeat the read-only availability checks on production after its own credentials are configured.

## Planned Telegram login: choose the website code in the bot

This is the owner’s requested next flow, based on the supplied screenshots. It is a future custom Bot API flow, not the standard Telegram login widget, and is not implemented or activated in this Google release.

1. The customer chooses Telegram on the website. The website displays a four-digit comparison code, a five-minute countdown, **Open Telegram**, optional QR, **Refresh**, and a cancel action.
2. The button/QR opens the store’s login bot using a fresh challenge deep link. The bot shows a login request with basic browser/device context, four distinct code choices including the website code, and **This was not me / Reject**.
3. The customer chooses the matching code. The original website notices approval, consumes that request once, creates its customer session, and returns to the account/cart. Rejection, a wrong choice, expiration or cancellation does not sign in.

### Requirements for that future implementation

- Use a fresh cryptographically random challenge token in the bot deep link. The four visible digits are for human comparison; they are not a bearer login secret and cannot identify a login request by themselves.
- Store expiring challenge state in the database. Bind it to the initiating browser’s secure HttpOnly cookie and to the Telegram user who opens it. Refresh/cancel invalidates the previous request.
- Use a dedicated bot and HTTPS webhook. Verify the webhook secret header before accepting updates, then validate the challenge, callback choice, Telegram sender, chat/message and current request state. A webhook secret alone does not authorize an arbitrary approval payload.
- Keep callback data compact and opaque, and look up the authoritative request on the server. A wrong choice should invalidate the challenge rather than allowing the four options to be tried in sequence. Reject and stale buttons must be harmless.
- Authenticate by Telegram’s stable numeric user ID, never by an editable username or display name. Existing website accounts need an explicit authenticated linking flow; do not merge by matching names or invent an email/password for a Telegram-only customer.
- Limit new requests, bot responses, approval attempts and polling. Use a short polling interval with backoff and stop on expiry, cancellation, approval or hidden-page inactivity. Do not expose the bot token or raw browser cookie to frontend code.
- Approval and final session consumption must be atomic and single-use. Polling may reveal status only to the initiating browser; session creation must also prove that browser binding. Forged, replayed and cross-browser completion requests must fail.
- Request context helps the customer recognize the login. Do not silently add a third-party location lookup or expose precise location. Test the cross-device case where the website is on a computer and Telegram is on a phone.

Prepare a Digimium bot through the official **@BotFather** account when that work begins. Its bot token and webhook secret belong in private Hostinger settings, not in source or chat. No bot has been created, webhook registered or Telegram login message sent by this release.

Official references: [bot deep links and inline keyboards](https://core.telegram.org/bots/features#deep-linking), [callback button API](https://core.telegram.org/bots/api#inlinekeyboardbutton), [HTTPS webhook secret verification](https://core.telegram.org/bots/api#setwebhook).

## Phone number: Coming soon

Choose an SMS verification service when phone login is scheduled. **Twilio Verify** is one option, not a service already purchased or connected to this project. It needs a funded account, a Verify Service, destination-country permissions, private service credentials, request limits and carrier delivery tests. A phone-only identity also needs an account model without invented emails/passwords.

[Twilio Verify setup guide](https://www.twilio.com/docs/verify/quickstarts/node-express)
