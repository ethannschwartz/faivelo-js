# Faivelo for Next.js and Nuxt

[![CI](https://github.com/ethannschwartz/faivelo-js/actions/workflows/ci.yml/badge.svg)](https://github.com/ethannschwartz/faivelo-js/actions/workflows/ci.yml)

Official [Faivelo](https://faivelo.com/?via=github) packages for sending transactional email from your own domain in Next.js and Nuxt apps, and receiving replies and delivery events as typed, signed webhooks. Until you add an API key, emails go to a local dev outbox, so you can build and test email flows before you sign up.

| Package | For | Install |
| --- | --- | --- |
| [`@faivelo/next`](./sdk-next) | Next.js: Server Actions, Route Handlers, React Email | `npm install @faivelo/next` |
| [`@faivelo/nuxt`](./sdk-nuxt) | Nuxt 3 and 4: auto-imported `sendEmail()`, DevTools outbox | `npm install @faivelo/nuxt` |

Both are built on the [`faivelo`](https://www.npmjs.com/package/faivelo) Node.js SDK, which covers the full API: mailboxes, reading mail, domains and DNS.

## Next.js

```ts
'use server'
import { sendEmail } from '@faivelo/next'

await sendEmail({ to: user.email, subject: 'Welcome to Acme', react: <WelcomeEmail name={user.name} /> })
```

## Nuxt

```ts
// server/api/signup.post.ts
export default defineEventHandler(async (event) => {
  const { email } = await readBody(event)
  await sendEmail({ to: email, subject: 'Welcome to Acme', html: '<p>Your account is ready.</p>' })
})
```

## Links

- [Next.js guide](https://faivelo.com/docs/developers/nextjs?via=github)
- [Nuxt guide](https://faivelo.com/docs/developers/nuxt?via=github)
- [Webhook events](https://faivelo.com/docs/developers/webhooks?via=github)
- [API reference](https://faivelo.com/docs/api?via=github)
- [Examples](https://github.com/ethannschwartz/faivelo-examples)

This repo is published from the Faivelo monorepo. Issues and pull requests are welcome here.

MIT licensed.
