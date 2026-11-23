import { Faivelo, FaiveloError } from 'faivelo'
import type { SendEmailRequest, SendEmailResponse } from 'faivelo'
import { createError, defineEventHandler, getHeader, readRawBody, setResponseStatus } from 'h3'
import type { EventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { captureEmail, consoleSummary, devResponse, renderEmailPage } from './preview'
import type { CapturedEmail } from './preview'
import { dispatchFaiveloEvent } from './events'
import type { FaiveloEvent, FaiveloWebhookHandlers } from './events'

interface FaiveloRuntimeConfig {
  apiKey?: string
  webhookSecret?: string
  from?: string
  devOutbox?: boolean
  /** Set by the module under `nuxi dev` only. */
  outboxDir?: string
}

function config() {
  const c = ((useRuntimeConfig() as { faivelo?: FaiveloRuntimeConfig }).faivelo ?? {})
  return {
    apiKey: c.apiKey || process.env.FAIVELO_API_KEY || '',
    webhookSecret: c.webhookSecret || process.env.FAIVELO_WEBHOOK_SECRET || '',
    from: c.from || process.env.FAIVELO_FROM || '',
    devOutbox: c.devOutbox !== false,
    outboxDir: c.outboxDir || ''
  }
}

let client: Faivelo | undefined
let clientKey: string | undefined

/**
 * The full Faivelo SDK (mailboxes, messages, domains, batches...), built
 * from FAIVELO_API_KEY. Server routes only.
 */
export function useFaivelo(): Faivelo {
  const { apiKey } = config()
  if (!apiKey) {
    throw new FaiveloError('FAIVELO_API_KEY is not set. Create a key at https://faivelo.com/settings/developers and set FAIVELO_API_KEY (or NUXT_FAIVELO_API_KEY).', 0)
  }
  if (!client || clientKey !== apiKey) {
    client = new Faivelo(apiKey, { baseUrl: process.env.FAIVELO_API_URL || undefined })
    clientKey = apiKey
  }
  return client
}

export type SendEmailOptions = Omit<SendEmailRequest, 'from'> & {
  /** Defaults to the module's `from` option or FAIVELO_FROM. */
  from?: string
}

/**
 * Send one email. In `nuxi dev` with no API key it lands in the dev outbox
 * (/_faivelo/outbox, and the Faivelo tab in Nuxt DevTools) instead.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResponse> {
  const cfg = config()
  const request = { ...options, from: options.from || cfg.from || undefined } as SendEmailRequest

  if (!cfg.apiKey && import.meta.dev && cfg.devOutbox && cfg.outboxDir) {
    const captured = captureEmail(request)
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(cfg.outboxDir, { recursive: true })
    await writeFile(`${cfg.outboxDir}/${captured.id}.json`, JSON.stringify(captured))
    console.info(consoleSummary(captured, `/_faivelo/outbox/${captured.id} (or the Faivelo tab in Nuxt DevTools)`))
    return devResponse(captured)
  }

  const client = useFaivelo()
  if (!request.from) {
    throw new FaiveloError('No `from` address. Set `faivelo: { from: \'Acme <hello@acme.com>\' }` in nuxt.config, FAIVELO_FROM, or pass `from`.', 0)
  }
  return client.emails.send(request)
}

export interface FaiveloWebhookOptions {
  /** Signing secret (whsec_...). Defaults to FAIVELO_WEBHOOK_SECRET / NUXT_FAIVELO_WEBHOOK_SECRET. */
  secret?: string
  /** Oldest signature accepted, in seconds. Default 300. */
  toleranceSeconds?: number
}

/**
 * A server route that verifies Faivelo's signature and calls the handler for
 * the event's type.
 *
 *   // server/api/faivelo.post.ts
 *   export default defineFaiveloWebhookHandler({
 *     'message.received': async (event) => { ... }
 *   })
 *
 * Bad signature → 400. A handler that throws → 500, and Faivelo retries
 * (up to a day, same event id). Events you did not list → 200.
 */
export function defineFaiveloWebhookHandler(handlers: FaiveloWebhookHandlers, options: FaiveloWebhookOptions = {}): EventHandler {
  return defineEventHandler(async (event) => {
    const secret = options.secret || config().webhookSecret
    if (!secret) {
      console.error('[faivelo] FAIVELO_WEBHOOK_SECRET is not set. Copy the endpoint\'s signing secret from Settings → Developers → Webhooks.')
      throw createError({ statusCode: 500, message: 'Webhook signing secret is not configured.' })
    }
    let verified: FaiveloEvent
    try {
      const raw = (await readRawBody(event, 'utf8')) ?? ''
      verified = await Faivelo.webhooks.verify(raw, getHeader(event, 'x-faivelo-signature'), secret, { toleranceSeconds: options.toleranceSeconds }) as unknown as FaiveloEvent
    } catch (err) {
      setResponseStatus(event, 400)
      return { error: err instanceof Error ? err.message : 'Invalid webhook.' }
    }
    try {
      return { received: true, handled: await dispatchFaiveloEvent(handlers, verified) }
    } catch (err) {
      console.error(`[faivelo] Webhook handler for ${verified.type} (${verified.id}) failed; Faivelo will retry.`, err)
      setResponseStatus(event, 500)
      return { error: 'Handler failed.' }
    }
  })
}

export async function readOutbox(): Promise<CapturedEmail[]> {
  const dir = config().outboxDir
  if (!dir) return []
  const { readdir, readFile } = await import('node:fs/promises')
  const files = await readdir(dir).catch(() => [] as string[])
  const all = await Promise.all(files.filter(f => f.endsWith('.json')).map(async f => JSON.parse(await readFile(`${dir}/${f}`, 'utf8')) as CapturedEmail))
  return all.sort((a, b) => b.at.localeCompare(a.at))
}

export { renderEmailPage }
