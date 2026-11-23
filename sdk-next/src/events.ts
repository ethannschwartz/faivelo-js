// Typed webhook events. Same file as sdk-next/src/events.ts (copied, not
// imported, so each package stands alone); server/utils/framework-events.test.ts
// keeps the two copies identical and every live catalog event typed.

export interface WebhookEnvelope<T extends string, D> {
  /** evt_... Stable across retries and resends: use it to ignore repeats. */
  id: string
  type: T
  /** When it happened (ISO 8601), not when it was delivered. */
  created_at: string
  /** Partner endpoints only: the customer the event is about. */
  customer_id?: string
  data: D
}

export interface Address {
  name?: string | null
  address: string
}

export interface MessageEventData {
  mailbox: string
  /** Permanent id: pass it to messages.get() in place of a UID. */
  message_id: string
  thread_id: string
  folder: string
  from: Address
  to: Address[]
  subject: string
  snippet: string
  received_at: string
  attachments: Array<{ name: string, content_type: string, size: number }>
}

export interface SendEventData {
  email_id: string
  from: string
  to: string[]
  subject: string
}

export interface FaiveloEventMap {
  'message.received': MessageEventData
  'message.sent': MessageEventData
  'email.delivered': SendEventData & { delivered_at: string }
  'email.bounced': SendEventData & { bounce: { type: 'permanent' | 'transient' | string, reason: string } }
  'email.complained': SendEventData & { complained_at: string }
  'email.opened': SendEventData & { opened_at: string }
  'email.clicked': SendEventData & { url: string, clicked_at: string }
  'mailbox.created': { mailbox: string, domain: string, display_name?: string | null }
  'mailbox.deleted': { mailbox: string, domain: string }
  'mailbox.quota_warning': { mailbox: string, percent: number, [key: string]: unknown }
  'account.sending_paused': { reason: string, detail: string, mailboxes_paused: number, resumes_at: string | null }
  'account.sending_resumed': { mailboxes_restored: number }
  'account.storage_warning': { percent: number, used_gb: number, limit_gb: number }
  'domain.verified': { domain: string, verified_at: string }
  'domain.dns_broken': { domain: string, record: { type: string, expected: string, found: string | null } }
  'domain.expiring': { domain: string, expires_at: string, auto_renew: boolean }
  'intake.message': Record<string, unknown>
}

export type FaiveloEventType = keyof FaiveloEventMap

export type FaiveloEvent<T extends FaiveloEventType = FaiveloEventType> =
  { [K in T]: WebhookEnvelope<K, FaiveloEventMap[K]> }[T]

type Awaitable<T> = T | Promise<T>

/**
 * One function per event you care about. `'*'` catches every event without
 * its own handler. Events with no handler are acknowledged and dropped.
 */
export type FaiveloWebhookHandlers = {
  [K in FaiveloEventType]?: (event: FaiveloEvent<K>) => Awaitable<unknown>
} & {
  '*'?: (event: FaiveloEvent) => Awaitable<unknown>
}

export async function dispatchFaiveloEvent(handlers: FaiveloWebhookHandlers, event: FaiveloEvent): Promise<boolean> {
  const handler = (handlers as Record<string, ((e: FaiveloEvent) => unknown) | undefined>)[event.type] ?? handlers['*']
  if (!handler) return false
  await handler(event)
  return true
}
