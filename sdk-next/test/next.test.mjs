// Runs against the built package: npm run build && npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { faiveloWebhook, sendEmail } from '../dist/index.js'

const SECRET = 'whsec_test'
function signed(body, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return new Request('http://x/api/faivelo', { method: 'POST', body, headers: { 'x-faivelo-signature': `t=${t},v1=${sig}` } })
}
const event = (type, data = {}) => JSON.stringify({ id: 'evt_1', type, created_at: '2026-11-02T00:00:00Z', data })

test('webhook: verified event reaches its handler', async () => {
  let got
  const POST = faiveloWebhook({ 'message.received': e => { got = e } }, { secret: SECRET })
  const res = await POST(signed(event('message.received', { subject: 'Hi' })))
  assert.equal(res.status, 200)
  assert.equal(got.data.subject, 'Hi')
  assert.deepEqual(await res.json(), { received: true, handled: true })
})

test('webhook: catch-all and unhandled events answer 200', async () => {
  const seen = []
  const POST = faiveloWebhook({ '*': e => { seen.push(e.type) } }, { secret: SECRET })
  assert.equal((await POST(signed(event('email.bounced')))).status, 200)
  assert.deepEqual(seen, ['email.bounced'])
  const none = faiveloWebhook({}, { secret: SECRET })
  assert.deepEqual(await (await none(signed(event('email.opened')))).json(), { received: true, handled: false })
})

test('webhook: wrong secret is 400, handler failure is 500, missing secret is 500', async () => {
  const POST = faiveloWebhook({ 'email.delivered': () => { throw new Error('db down') } }, { secret: SECRET })
  assert.equal((await POST(signed(event('email.delivered'), 'whsec_other'))).status, 400)
  assert.equal((await POST(signed(event('email.delivered'), SECRET, Math.floor(Date.now() / 1000) - 3600))).status, 400)
  assert.equal((await POST(signed(event('email.delivered')))).status, 500)
  delete process.env.FAIVELO_WEBHOOK_SECRET
  assert.equal((await faiveloWebhook({})(signed(event('email.delivered')))).status, 500)
})

test('sendEmail: no key in development captures to .faivelo/outbox', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fv-next-'))
  const cwd = process.cwd()
  process.chdir(dir)
  delete process.env.FAIVELO_API_KEY
  process.env.NODE_ENV = 'development'
  process.env.FAIVELO_FROM = 'Acme <hello@acme.com>'
  try {
    const res = await sendEmail({ to: 'ada@example.com', subject: 'Welcome <3', html: '<p>Hi Ada</p>' })
    assert.match(res.id, /^dev_/)
    assert.equal(res.from, 'Acme <hello@acme.com>')
    const page = readFileSync(join(dir, '.faivelo/outbox', `${res.id}.html`), 'utf8')
    assert.match(page, /Welcome &lt;3/)
    assert.match(page, /Hi Ada/)
    assert.ok(existsSync(join(dir, '.faivelo/outbox/index.html')))
    assert.equal(readFileSync(join(dir, '.faivelo/.gitignore'), 'utf8'), '*\n')
  } finally { process.chdir(cwd) }
})

test('sendEmail: production with no key fails loudly instead of capturing', async () => {
  delete process.env.FAIVELO_API_KEY
  process.env.NODE_ENV = 'production'
  await assert.rejects(sendEmail({ to: 'a@b.co', subject: 's', text: 't' }), /FAIVELO_API_KEY is not set/)
  process.env.NODE_ENV = 'test'
})

test('sendEmail: renders a React Email element', async () => {
  const React = await import('react').catch(() => null)
  if (!React) return
  const dir = mkdtempSync(join(tmpdir(), 'fv-next-'))
  const cwd = process.cwd(); process.chdir(dir)
  try {
    const el = React.createElement('p', null, 'Hello from React')
    const res = await sendEmail({ to: 'ada@example.com', subject: 'R', react: el })
    const saved = JSON.parse(readFileSync(join(dir, '.faivelo/outbox', `${res.id}.json`), 'utf8'))
    assert.match(saved.html, /Hello from React/)
    assert.match(saved.text, /Hello from React/)
  } finally { process.chdir(cwd) }
})
