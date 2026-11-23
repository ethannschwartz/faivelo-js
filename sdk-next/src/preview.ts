// Dev capture: with no API key outside production, sendEmail() keeps the
// email here instead of failing, so an app can wire up email before anyone
// signs up. The same file ships in @faivelo/next and @faivelo/nuxt.

export interface CapturedEmail {
  id: string
  at: string
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  replyTo?: string
  subject: string
  html?: string
  text?: string
  templateAlias?: string
  variables?: Record<string, unknown>
  attachments: string[]
}

const list = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v])

export function captureEmail(email: {
  from?: string, to: string | string[], cc?: string | string[], bcc?: string | string[], replyTo?: string,
  subject?: string, html?: string, text?: string, templateAlias?: string, variables?: Record<string, unknown>,
  attachments?: Array<{ filename: string }>
}): CapturedEmail {
  return {
    id: `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    from: email.from ?? '(no from address)',
    to: list(email.to),
    cc: list(email.cc),
    bcc: list(email.bcc),
    replyTo: email.replyTo,
    subject: email.subject ?? (email.templateAlias ? `Template "${email.templateAlias}"` : '(no subject)'),
    html: email.html,
    text: email.text,
    templateAlias: email.templateAlias,
    variables: email.variables,
    attachments: (email.attachments ?? []).map(a => a.filename)
  }
}

export function devResponse(c: CapturedEmail) {
  return { id: c.id, from: c.from, to: c.to, subject: c.subject, status: 'sent' as const, messageId: `<${c.id}@dev.faivelo>`, suppressed: [] as string[] }
}

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ch]!))

export const SETUP_HINT = 'Set FAIVELO_API_KEY to send for real. Get one at https://faivelo.com/settings/developers (npx faivelo init yourdomain.com sets up the domain).'

export function consoleSummary(c: CapturedEmail, where: string): string {
  return [
    `[faivelo] Email captured, not sent (no FAIVELO_API_KEY in development).`,
    `  to:      ${c.to.join(', ')}`,
    `  subject: ${c.subject}`,
    `  preview: ${where}`,
    `  ${SETUP_HINT}`
  ].join('\n')
}

const PAGE_CSS = `
  :root { color-scheme: light dark; --bg:#fff; --fg:#1c1b19; --muted:#6f6b64; --line:#e7e4df; --panel:#f6f5f3; --accent:#1c1b19 }
  @media (prefers-color-scheme: dark) { :root { --bg:#141413; --fg:#f2f0ec; --muted:#a29d94; --line:#2c2b28; --panel:#1c1b19; --accent:#f2f0ec } }
  * { box-sizing: border-box }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif }
  .wrap { max-width:880px; margin:0 auto; padding:24px 16px 48px }
  .brand { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px }
  .brand b { font-size:15px } .muted { color:var(--muted) }
  .note { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin-bottom:20px }
  .note a { color:inherit }
  .meta { margin:0; border:1px solid var(--line); border-radius:12px 12px 0 0; padding:14px 16px; display:grid; grid-template-columns:72px 1fr; gap:4px 12px }
  .meta h1 { grid-column:1/-1; font-size:18px; margin:0 0 6px }
  .meta dt { color:var(--muted) } .meta dd { margin:0; overflow-wrap:anywhere }
  iframe { display:block; width:100%; height:70vh; border:1px solid var(--line); border-top:0; border-radius:0 0 12px 12px; background:#fff }
  pre { white-space:pre-wrap; margin:0; padding:16px; border:1px solid var(--line); border-top:0; border-radius:0 0 12px 12px }
  ul.list { list-style:none; margin:0; padding:0; border:1px solid var(--line); border-radius:12px; overflow:hidden }
  ul.list li + li { border-top:1px solid var(--line) }
  ul.list a { display:grid; grid-template-columns:1fr auto; gap:2px 12px; padding:12px 16px; color:inherit; text-decoration:none }
  ul.list a:hover { background:var(--panel) }
  .subj { font-weight:600 } .to { color:var(--muted); grid-column:1 } .time { color:var(--muted); grid-row:1 / span 2; grid-column:2; align-self:center }
  .empty { padding:32px 16px; text-align:center; color:var(--muted); border:1px dashed var(--line); border-radius:12px }
`

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body><div class="wrap">${body}</div></body></html>`
}

const NOTE = `<div class="note">Development only. These emails were <b>not sent</b> because <code>FAIVELO_API_KEY</code> is not set. Add a key from <a href="https://faivelo.com/settings/developers" target="_blank" rel="noopener">Settings → Developers</a> and the same code sends for real.</div>`

/** One captured email as a standalone page. */
export function renderEmailPage(c: CapturedEmail, backHref?: string): string {
  const row = (k: string, v?: string) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '')
  const extra = [
    c.templateAlias ? `Template <b>${esc(c.templateAlias)}</b> renders on Faivelo when sent for real. Variables: <code>${esc(JSON.stringify(c.variables ?? {}))}</code>` : '',
    c.attachments.length ? `Attachments: ${c.attachments.map(esc).join(', ')}` : ''
  ].filter(Boolean).map(s => `<div class="note">${s}</div>`).join('')
  const body = c.html
    ? `<iframe sandbox="" srcdoc="${esc(c.html)}" title="Email body"></iframe>`
    : `<pre>${esc(c.text ?? '(empty body)')}</pre>`
  return shell(c.subject, `
    <div class="brand"><b>Faivelo dev outbox</b>${backHref ? `<a class="muted" href="${esc(backHref)}">All captured emails</a>` : ''}</div>
    ${NOTE}${extra}
    <dl class="meta"><h1>${esc(c.subject)}</h1>
      ${row('From', c.from)}${row('To', c.to.join(', '))}${row('Cc', c.cc.join(', '))}${row('Bcc', c.bcc.join(', '))}${row('Reply-To', c.replyTo)}${row('Time', new Date(c.at).toLocaleString())}
    </dl>${body}`)
}

/** Every captured email, newest first, each linking to `hrefFor(email)`. */
export function renderOutboxPage(emails: CapturedEmail[], hrefFor: (c: CapturedEmail) => string): string {
  const items = emails.length
    ? `<ul class="list">${emails.map(c => `<li><a href="${esc(hrefFor(c))}"><span class="subj">${esc(c.subject)}</span><span class="to">To ${esc(c.to.join(', '))}</span><span class="time">${esc(new Date(c.at).toLocaleTimeString())}</span></a></li>`).join('')}</ul>`
    : `<div class="empty">Nothing captured yet. Call <code>sendEmail()</code> and it shows up here.</div>`
  return shell('Faivelo dev outbox', `<div class="brand"><b>Faivelo dev outbox</b><span class="muted">${emails.length} captured</span></div>${NOTE}${items}`)
}
