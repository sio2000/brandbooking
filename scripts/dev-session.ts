/** Dev helper: print a session cookie for an existing user (never in production). */
import './_env'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '../src/server/db/client'
import { users } from '../src/server/db/schema'
import { createSession } from '../src/server/auth/session'

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Not available in production')
  const email = process.argv[2] ?? 'demo@hournook.dev'
  const [u] = await db().select().from(users).where(eq(users.email, email))
  if (!u) throw new Error(`No user ${email}`)
  const s = await createSession(u.id, { userAgent: 'dev-session' })
  console.log(`hn_session=${s.token}`)
}
main()
  .catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
  .finally(() => closeDb())
