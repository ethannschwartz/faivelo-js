# @faivelo/next

Email for your Next.js app, sent from your own domain. Send welcome emails, receipts and sign-in links from a Server Action with React Email, and get replies and delivery events back as typed, signed webhooks.

```bash
npm install @faivelo/next
```

It works before you have an account: with no API key in development, every email is saved to a local outbox you can open in the browser, not sent.

## Send an email

```ts
// app/actions.ts
'use server'
import { sendEmail } from '@faivelo/next'

export async function signUp(formData: FormData) {
  const email = String(formData.get('email'))
  // ...create the user...
  await sendEmail({
    to: email,
    subject: 'Welcome to Acme',
    html: '<p>Your account is ready.</p>',
  })
}
```

`from` defaults to `FAIVELO_FROM`. Pass `from` to override it per email.

### With React Email

```bash
npm install @react-email/render @react-email/components
```

```tsx
import { sendEmail } from '@faivelo/next'
import WelcomeEmail from '@/emails/welcome'

await sendEmail({
  to: user.email,
  subject: 'Welcome to Acme',
  react: <WelcomeEmail name={user.name} />,
})
```

The component becomes the HTML body and a plain-text version is made from it.

### Everything else `emails.send` takes

`cc`, `bcc`, `replyTo`, `attachments`, `templateAlias` with `variables`, and `idempotencyKey` all work. They are the options of [`faivelo.emails.send`](https://www.npmjs.com/package/faivelo).

## Set up

`.env.local`:

```bash
FAIVELO_API_KEY=fvl_live_...            # Settings → Developers in Faivelo
FAIVELO_FROM="Acme <hello@acme.com>"    # any address on a domain you added
FAIVELO_WEBHOOK_SECRET=whsec_...        # only if you receive webhooks
```

No domain yet? `npx faivelo init acme.com` adds it and gets the DNS records in place: one click where your DNS host allows it, copy-ready values otherwise.

Add the same variables to your host's environment for production. In production a missing key is an error, never a silent capture.

## The dev outbox

With no `FAIVELO_API_KEY` and `NODE_ENV` not `production`, `sendEmail()` saves the email instead of sending it and returns a normal response with an id starting `dev_`. The terminal prints a link:

```
[faivelo] Email captured, not sent (no FAIVELO_API_KEY in development).
  to:      ada@example.com
  subject: Welcome to Acme
  preview: file:///…/.faivelo/outbox/dev_….html
```

Open `.faivelo/outbox/index.html` to see every captured email. The folder has its own `.gitignore`, so it is never committed. Add the API key and the same code sends for real.

## Receive replies and delivery events

```ts
// app/api/faivelo/route.ts
import { faiveloWebhook } from '@faivelo/next'

export const POST = faiveloWebhook({
  'message.received': async (event) => {
    // Someone wrote to one of your mailboxes, or replied to your app's email.
    const { from, subject, mailbox } = event.data
  },
  'email.bounced': async (event) => {
    await markUndeliverable(event.data.to)
  },
})
```

Then add `https://your-app.com/api/faivelo` as an endpoint in **Settings → Developers → Webhooks** and put its signing secret in `FAIVELO_WEBHOOK_SECRET`.

- Every request is checked against the signature before your code runs. A bad or old signature gets a 400.
- Each handler gets the event typed for its name: `event.data.from.address`, `event.data.bounce.reason`, and so on.
- `'*'` handles any event without its own handler. Events you did not list get a 200 and are dropped.
- If your handler throws, the answer is a 500 and Faivelo tries again for up to a day. A retry has the same `event.id`, so use it to skip repeats.

Webhooks come with the Growth, Pro and Business plans. `message.received` and `message.sent` need Pro or Business. The handler uses the standard `Request` and `Response`, so it also works in Hono, Remix and other web-standard servers.

## The full API

`faivelo` is the full [Faivelo SDK](https://www.npmjs.com/package/faivelo) client, made from `FAIVELO_API_KEY` when you first use it:

```ts
import { faivelo } from '@faivelo/next'

const { messages } = await faivelo.messages.list('support@acme.com', { limit: 10 })
await faivelo.mailboxes.create({ domain: 'acme.com', localPart: 'agent' })
```

Use `getFaivelo({ apiKey })` to make a client with a different key.

Everything in this package runs on the server only. The key never reaches the browser, and calling it from a Client Component throws.

## Links

- [Next.js guide](https://faivelo.com/docs/developers/nextjs/?via=npm)
- [Webhook events](https://faivelo.com/docs/developers/webhooks/?via=npm)
- [API reference](https://faivelo.com/docs/api?via=npm)
- Nuxt app? Use [`@faivelo/nuxt`](https://www.npmjs.com/package/@faivelo/nuxt).

MIT licensed.
