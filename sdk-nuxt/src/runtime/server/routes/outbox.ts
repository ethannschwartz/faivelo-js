// Dev only (the module registers it under `nuxi dev`): the emails sendEmail()
// kept instead of sending, at /_faivelo/outbox and /_faivelo/outbox/<id>.
import { createError, defineEventHandler, getRequestURL, setResponseHeader } from 'h3'
import { readOutbox, renderEmailPage } from '../utils/faivelo'
import { renderOutboxPage } from '../utils/preview'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  const id = getRequestURL(event).pathname.replace(/^.*\/_faivelo\/outbox\/?/, '').replace(/\/$/, '')
  const emails = await readOutbox()
  if (!id) return renderOutboxPage(emails, c => `/_faivelo/outbox/${c.id}`)
  const email = emails.find(c => c.id === id)
  if (!email) throw createError({ statusCode: 404, message: 'No captured email with that id.' })
  return renderEmailPage(email, '/_faivelo/outbox')
})
