# Faivelo for Nuxt

`@faivelo/nuxt` is the official [Faivelo](https://faivelo.com/?via=nuxt-modules) module for Nuxt. It sends transactional email (welcome emails, password resets, receipts, sign-in links) from your own domain with one auto-imported function, `sendEmail()`, and delivers replies and delivery events back to your server as typed, signed webhooks. Until you add an API key, emails go to a local dev outbox, so you can build and test email flows before you sign up.

- **Send** from any address on your domain, from any server route. Nothing to import.
- **Receive** replies, new mail and bounces with `defineFaiveloWebhookHandler()`, typed per event.
- **Test locally** in the dev outbox at `/_faivelo/outbox` and in a Nuxt DevTools tab.
- **Full API** with `useFaivelo()`: real mailboxes, reading mail, domains and DNS.

Works with Nuxt 3 and Nuxt 4.

## Install

```bash
npm install @faivelo/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@faivelo/nuxt'],
  faivelo: {
    from: 'Acme <hello@acme.com>', // default sender
  },
})
```

## How do I send an email from a Nuxt server route?

```ts
// server/api/signup.post.ts
export default defineEventHandler(async (event) => {
  const { email } = await readBody(event)
  // ...create the user...
  await sendEmail({
    to: email,
    subject: 'Welcome to Acme',
    html: '<p>Your account is ready.</p>',
  })
  return { ok: true }
})
```

`sendEmail()` also takes `from`, `cc`, `bcc`, `replyTo`, `text`, `attachments`, `templateAlias` with `variables` (for templates you design in the Faivelo dashboard), and `idempotencyKey`, so a retried request never sends twice.

## How do I test emails locally without sending them?

Run `nuxi dev` with no API key. `sendEmail()` keeps each email instead of sending it, and returns a normal response with an id starting `dev_`. Open **`/_faivelo/outbox`**, or the **Faivelo outbox** tab in Nuxt DevTools (Shift + Option + D), to see each email as the recipient would.

Add the key and the same code sends for real. The outbox exists only in development. In production, a missing key is an error, never a silent capture. Turn the outbox off with `faivelo: { devOutbox: false }`.

## How do I receive replies and bounces?

```ts
// server/api/faivelo.post.ts
export default defineFaiveloWebhookHandler({
  'message.received': async (event) => {
    // Someone wrote to one of your mailboxes, or replied to your app's email.
    const { from, subject, mailbox } = event.data
  },
  'email.bounced': async (event) => {
    await markUndeliverable(event.data.to)
  },
})
```

Add `https://your-app.com/api/faivelo` as an endpoint in **Settings → Developers → Webhooks** in Faivelo, and put its signing secret in `FAIVELO_WEBHOOK_SECRET`.

- The signature is checked before your code runs. A bad or old signature gets a 400.
- Each handler gets its event fully typed: `event.data.from.address`, `event.data.bounce.reason`, and so on.
- `'*'` handles every event without its own handler. Events you did not list get a 200.
- If your handler throws, the answer is a 500 and Faivelo tries again for up to a day. A retry keeps the same `event.id`, so you can skip repeats.

Events include `message.received`, `message.sent`, `email.delivered`, `email.bounced`, `email.complained`, `domain.verified` and `mailbox.created`. [All events](https://faivelo.com/docs/developers/webhooks/?via=nuxt-modules).

Webhooks come with the Growth, Pro and Business plans. `message.received` and `message.sent` need Pro or Business.

## Configuration

`.env`:

```bash
FAIVELO_API_KEY=fvl_live_...          # Settings → Developers in Faivelo
FAIVELO_WEBHOOK_SECRET=whsec_...      # only if you receive webhooks
FAIVELO_FROM="Acme <hello@acme.com>"  # optional, instead of the nuxt.config option
```

The `NUXT_FAIVELO_API_KEY`, `NUXT_FAIVELO_WEBHOOK_SECRET` and `NUXT_FAIVELO_FROM` names work too. Keys live in server-only runtime config and never reach the browser.

| Option | Default | What it does |
| --- | --- | --- |
| `from` | none | Default sender, e.g. `'Acme <hello@acme.com>'`. Any address on a domain you added to Faivelo. |
| `devOutbox` | `true` | Keep emails in the dev outbox when there is no API key during `nuxi dev`. |

## The full Faivelo API

`useFaivelo()` returns the [Faivelo SDK](https://www.npmjs.com/package/faivelo) client, made from your API key:

```ts
export default defineEventHandler(async () => {
  const faivelo = useFaivelo()
  return faivelo.messages.list('support@acme.com', { limit: 10 })
})
```

Event types are exported: `import type { FaiveloEvent } from '@faivelo/nuxt'`.

## FAQ

**What is Faivelo?**
Faivelo is email hosting for your own domain with an API. One account covers mailboxes for your team (IMAP, SMTP and webmail) and email sent by your code, with replies coming back as webhooks. AI agents can use it too, through the Faivelo MCP server.

**Do I need a mailbox to send?**
No. Any address on a domain you added to Faivelo can send, for example `noreply@acme.com`, with no mailbox behind it.

**How do I add my domain?**
Run `npx faivelo init acme.com`. It adds the domain and gets the DNS records in place: one click where your DNS host allows it, copy-ready values otherwise.

**Can I move from Nodemailer or another email API?**
Yes. `sendEmail()` takes `from`, `to`, `subject`, `html`, `text`, `cc`, `bcc`, `replyTo` and `attachments` (`{ filename, content }`), the same fields Nodemailer's `sendMail` uses. Usually you change the import and remove the SMTP setup.

**Can I write emails as Vue components?**
Not in this module yet. Send `html` you build yourself, or design a template in the Faivelo dashboard and send it with `templateAlias`.

**Where does it run?**
On the server, in any server route, server middleware or Nitro task. Tested with Node.js server builds on Nuxt 3 and Nuxt 4.

## Links

- [Nuxt guide](https://faivelo.com/docs/developers/nuxt/?via=nuxt-modules)
- [Webhook events](https://faivelo.com/docs/developers/webhooks/?via=nuxt-modules)
- [API reference](https://faivelo.com/docs/api?via=nuxt-modules)
- Building with Next.js? Use [`@faivelo/next`](https://www.npmjs.com/package/@faivelo/next).

MIT licensed.
