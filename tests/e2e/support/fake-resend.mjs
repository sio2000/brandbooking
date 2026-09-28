/**
 * A stand-in for Resend's HTTP API during E2E runs. The app under test sends
 * email through its real Resend provider (RESEND_API_BASE points here); each
 * accepted message is written to E2E_MAIL_DIR as JSON so tests can open it and
 * follow its links like a recipient would.
 */
import { createServer } from 'node:http'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const port = Number(process.env.E2E_MAIL_PORT ?? 3199)
const dir = path.resolve(process.env.E2E_MAIL_DIR ?? '.data/e2e-mail')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
let n = 0

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return res.writeHead(200).end('ok')
  if (req.method !== 'POST' || req.url !== '/emails') return res.writeHead(404).end()
  if (!String(req.headers.authorization ?? '').startsWith('Bearer re_'))
    return res.writeHead(401).end()
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const id = `em_${Date.now()}_${++n}`
    const mail = { id, at: new Date().toISOString(), ...JSON.parse(body) }
    writeFileSync(
      path.join(dir, `${Date.now()}-${String(n).padStart(5, '0')}.json`),
      JSON.stringify(mail),
    )
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id }))
  })
}).listen(port, '127.0.0.1', () => console.log(`fake Resend on ${port}`))
