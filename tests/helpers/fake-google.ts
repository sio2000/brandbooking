/**
 * A stand-in for Google's sign-in during tests. It plays both of Google's
 * parts: the page the browser is sent to (which here answers at once, as
 * whoever the test chose) and the token endpoint the server calls with the
 * one-time code. It checks what a real Google checks (the client and its
 * secret, the redirect address, the PKCE verifier, a code used only once), so
 * a sign-in that would fail at Google fails here too.
 *
 * The app reaches it through GOOGLE_OAUTH_BASE, which is ignored in production.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'

export type FakePerson = {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  /** Set for a Google Workspace account. */
  hd?: string
}

export type FakeGoogle = {
  url: string
  /** Who "signs in" at the next visit, or `'deny'` to close Google's window instead. */
  next: (who: FakePerson | 'deny') => void
  /** Claims to put into the next ID token as they are, to play a token that is not ours. */
  forge: (claims: Record<string, unknown>) => void
  /** How many times the token endpoint was asked. */
  exchanges: () => number
  close: () => Promise<void>
}

type Pending = { person: FakePerson; challenge: string; nonce: string; redirectUri: string }

const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

async function body(req: IncomingMessage): Promise<string> {
  let text = ''
  for await (const chunk of req) text += chunk
  return text
}

export async function startFakeGoogle(opts: {
  clientId: string
  clientSecret: string
  port?: number
}): Promise<FakeGoogle> {
  const codes = new Map<string, Pending>()
  let person: FakePerson | 'deny' = { sub: 'g-default', email: 'default@gmail.com' }
  let forged: Record<string, unknown> = {}
  let exchanges = 0

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake-google')
    const json = (status: number, value: unknown) =>
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))

    if (req.method === 'GET' && url.pathname === '/health') return res.writeHead(200).end('ok')

    // Lets a browser test choose who signs in next (the test and this server are separate processes).
    if (req.method === 'POST' && url.pathname === '/__next') {
      const chosen = JSON.parse((await body(req)) || '{}') as {
        person?: FakePerson
        deny?: boolean
        forge?: Record<string, unknown>
      }
      if (chosen.deny) person = 'deny'
      else if (chosen.person) person = chosen.person
      forged = chosen.forge ?? {}
      return json(200, { ok: true })
    }

    if (req.method === 'GET' && url.pathname === '/o/oauth2/v2/auth') {
      const q = url.searchParams
      const redirectUri = q.get('redirect_uri') ?? ''
      const valid =
        q.get('client_id') === opts.clientId &&
        q.get('response_type') === 'code' &&
        (q.get('scope') ?? '').split(' ').includes('openid') &&
        q.get('code_challenge_method') === 'S256' &&
        Boolean(q.get('code_challenge')) &&
        Boolean(q.get('state')) &&
        Boolean(q.get('nonce')) &&
        /^https?:\/\//.test(redirectUri)
      if (!valid) return res.writeHead(400).end('Error 400: invalid_request')
      const back = new URL(redirectUri)
      back.searchParams.set('state', q.get('state')!)
      if (person === 'deny') back.searchParams.set('error', 'access_denied')
      else {
        const code = randomUUID()
        codes.set(code, {
          person,
          challenge: q.get('code_challenge')!,
          nonce: q.get('nonce')!,
          redirectUri,
        })
        back.searchParams.set('code', code)
      }
      return res.writeHead(302, { location: back.toString() }).end()
    }

    if (req.method === 'POST' && url.pathname === '/token') {
      exchanges++
      const form = new URLSearchParams(await body(req))
      const pending = codes.get(form.get('code') ?? '')
      codes.delete(form.get('code') ?? '')
      if (
        form.get('client_id') !== opts.clientId ||
        form.get('client_secret') !== opts.clientSecret
      )
        return json(401, { error: 'invalid_client' })
      const verifier = form.get('code_verifier') ?? ''
      const proven =
        pending &&
        form.get('grant_type') === 'authorization_code' &&
        form.get('redirect_uri') === pending.redirectUri &&
        createHash('sha256').update(verifier, 'ascii').digest('base64url') === pending.challenge
      if (!pending || !proven) return json(400, { error: 'invalid_grant' })
      const now = Math.floor(Date.now() / 1000)
      const claims = {
        iss: 'https://accounts.google.com',
        azp: opts.clientId,
        aud: opts.clientId,
        sub: pending.person.sub,
        email: pending.person.email,
        email_verified: pending.person.email_verified ?? true,
        ...(pending.person.name ? { name: pending.person.name } : {}),
        ...(pending.person.hd ? { hd: pending.person.hd } : {}),
        nonce: pending.nonce,
        iat: now,
        exp: now + 3600,
        ...forged,
      }
      forged = {}
      return json(200, {
        access_token: `ya29.${randomUUID()}`,
        expires_in: 3599,
        scope: 'openid email profile',
        token_type: 'Bearer',
        id_token: `${part({ alg: 'RS256', kid: 'fake', typ: 'JWT' })}.${part(claims)}.c2lnbmF0dXJl`,
      })
    }

    return res.writeHead(404).end()
  })

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    next: (who) => void (person = who),
    forge: (claims) => void (forged = claims),
    exchanges: () => exchanges,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
