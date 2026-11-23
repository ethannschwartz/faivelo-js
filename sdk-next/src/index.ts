/**
 * @faivelo/next — email from your Next.js app on your own domain.
 *
 *   // app/actions.ts
 *   'use server'
 *   import { sendEmail } from '@faivelo/next'
 *   await sendEmail({ to: user.email, subject: 'Welcome', react: <Welcome name={user.name} /> })
 *
 *   // app/api/faivelo/route.ts
 *   import { faiveloWebhook } from '@faivelo/next'
 *   export const POST = faiveloWebhook({ 'message.received': e => console.log(e.data.subject) })
 *
 * Reads FAIVELO_API_KEY, FAIVELO_FROM and FAIVELO_WEBHOOK_SECRET from the
 * environment. With no API key in development, emails are captured to
 * .faivelo/outbox instead of sent.
 */
import { Faivelo, FaiveloError, FaiveloWebhookError } from 'faivelo'
import type { FaiveloOptions, SendEmailRequest, SendEmailResponse } from 'faivelo'
import { captureEmail, consoleSummary, devResponse, renderEmailPage, renderOutboxPage } from './preview'
import type { CapturedEmail } from './preview'
import { dispatchFaiveloEvent } from './events'
import type { FaiveloEvent, FaiveloWebhookHandlers } from './events'

export { Faivelo, FaiveloError, FaiveloWebhookError }
export type * from 'faivelo'
export type * from './events'
export type { CapturedEmail } from './preview'

function assertServer(what: string) {
  if (typeof window !== 'undefined') {
    throw new FaiveloError(`${what} runs on the server only (a Server Action, Route Handler or Server Component). Your API key must never reach the browser.`, 0)
  }
}

const env = (name: string) => (typeof process !== 'undefined' ? process.env[name]?.trim() || undefined : undefined)
const isProduction = () => env('NODE_ENV') === 'production'

let client: Faivelo | undefined
let clientKey: string | undefined

/**
 * The full Faivelo SDK (mailboxes, messages, domains, batches...), built
 * from FAIVELO_API_KEY. Throws with setup steps when the key is missing.
 */
export function getFaivelo(options: FaiveloOptions & { apiKey?: string } = {}): Faivelo {
  assertServer('getFaivelo()')
  const apiKey = options.apiKey ?? env('FAIVELO_API_KEY')
  if (!apiKey) {
    throw new FaiveloError('FAIVELO_API_KEY is not set. Create a key at https://faivelo.com/settings/developers and add it to .env.local (and to your host\'s environment for production).', 0)
  }
  if (options.apiKey || options.baseUrl || options.timeoutMs) {
    return new Faivelo(apiKey, { baseUrl: options.baseUrl ?? env('FAIVELO_API_URL'), timeoutMs: options.timeoutMs })
  }
  if (!client || clientKey !== apiKey) {
    client = new Faivelo(apiKey, { baseUrl: env('FAIVELO_API_URL') })
    clientKey = apiKey
  }
  return client
}

/**
 * `faivelo.mailboxes.list()`, `faivelo.messages.get()`... the SDK client,
 * created on first use so importing this module never needs the key.
 */
export const faivelo: Faivelo = new Proxy({} as Faivelo, {
  get(_, prop) {
    const c = getFaivelo()
    const value = Reflect.get(c, prop, c)
    return typeof value === 'function' ? value.bind(c) : value
  }
})

/** A React element, kept loose so this package does not need @types/react. */
type ReactNodeLike = { type: unknown, props: unknown } | Record<string, unknown>

export type SendEmailOptions = Omit<SendEmailRequest, 'from'> & {
  /** Defaults to FAIVELO_FROM, e.g. "Acme <hello@acme.com>". */
  from?: string
  /** A React Email component, rendered to `html` (and `text` when you leave it out). Needs `@react-email/render`. */
  react?: ReactNodeLike
}

async function renderReact(element: ReactNodeLike): Promise<{ html: string, text: string }> {
  let mod: { render: (el: unknown, opts?: { plainText?: boolean }) => string | Promise<string> }
  try {
    mod = await import('@react-email/render')
  } catch {
    throw new FaiveloError('Sending a `react` email needs @react-email/render: npm install @react-email/render (or pass `html` instead).', 0)
  }
  const [html, text] = await Promise.all([mod.render(element), mod.render(element, { plainText: true })])
  return { html, text }
}

async function writeOutbox(c: CapturedEmail): Promise<string> {
  try {
    const { mkdir, writeFile, readdir, readFile } = await import('node:fs/promises')
    const { join, resolve } = await import('node:path')
    const dir = resolve(process.cwd(), '.faivelo', 'outbox')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, '..', '.gitignore'), '*\n')
    await writeFile(join(dir, `${c.id}.json`), JSON.stringify(c))
    await writeFile(join(dir, `${c.id}.html`), renderEmailPage(c, 'index.html'))
    const all: CapturedEmail[] = []
    for (const f of await readdir(dir)) {
      if (f.endsWith('.json')) all.push(JSON.parse(await readFile(join(dir, f), 'utf8')))
    }
    all.sort((a, b) => b.at.localeCompare(a.at))
    await writeFile(join(dir, 'index.html'), renderOutboxPage(all.slice(0, 200), e => `${e.id}.html`))
    return `file://${join(dir, `${c.id}.html`)}`
  } catch {
    return '(could not write .faivelo/outbox; email shown above only)'
  }
}

/**
 * Send one email. `from` defaults to FAIVELO_FROM. With no FAIVELO_API_KEY
 * outside production the email is captured to .faivelo/outbox and logged,
 * not sent, so you can build the flow before you have an account.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResponse> {
  assertServer('sendEmail()')
  const { react, ...rest } = options
  const request = { ...rest, from: rest.from ?? env('FAIVELO_FROM') } as SendEmailRequest
  if (react) {
    const rendered = await renderReact(react)
    request.html ??= rendered.html
    request.text ??= rendered.text
  }

  if (!env('FAIVELO_API_KEY') && !isProduction()) {
    const captured = captureEmail(request)
    console.info(consoleSummary(captured, await writeOutbox(captured)))
    return devResponse(captured)
  }

  const client = getFaivelo()
  if (!request.from) {
    throw new FaiveloError('No `from` address. Pass `from` or set FAIVELO_FROM, e.g. FAIVELO_FROM="Acme <hello@acme.com>" (any address on a domain verified in Faivelo).', 0)
  }
  return client.emails.send(request)
}

export interface FaiveloWebhookOptions {
  /** Signing secret (whsec_...). Defaults to FAIVELO_WEBHOOK_SECRET. */
  secret?: string
  /** Oldest signature accepted, in seconds. Default 300. */
  toleranceSeconds?: number
}

/**
 * A Route Handler that verifies Faivelo's signature and calls the handler
 * for the event's type. Works with any framework that speaks the web
 * `Request`/`Response` API.
 *
 *   // app/api/faivelo/route.ts
 *   export const POST = faiveloWebhook({
 *     'message.received': async (event) => { ... },
 *     'email.bounced': async (event) => { ... }
 *   })
 *
 * A bad signature answers 400. A handler that throws answers 500 so Faivelo
 * retries (for up to a day, same event id). Events you did not list are
 * acknowledged with 200.
 */
export function faiveloWebhook(handlers: FaiveloWebhookHandlers, options: FaiveloWebhookOptions = {}): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const secret = options.secret ?? env('FAIVELO_WEBHOOK_SECRET')
    if (!secret) {
      console.error('[faivelo] FAIVELO_WEBHOOK_SECRET is not set. Copy the endpoint\'s signing secret from Settings → Developers → Webhooks.')
      return Response.json({ error: 'Webhook signing secret is not configured.' }, { status: 500 })
    }
    let event: FaiveloEvent
    try {
      const raw = await request.text()
      event = await Faivelo.webhooks.verify(raw, request.headers.get('x-faivelo-signature'), secret, { toleranceSeconds: options.toleranceSeconds }) as unknown as FaiveloEvent
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : 'Invalid webhook.' }, { status: 400 })
    }
    try {
      const handled = await dispatchFaiveloEvent(handlers, event)
      return Response.json({ received: true, handled })
    } catch (err) {
      console.error(`[faivelo] Webhook handler for ${event.type} (${event.id}) failed; Faivelo will retry.`, err)
      return Response.json({ error: 'Handler failed.' }, { status: 500 })
    }
  }
}
