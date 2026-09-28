/** Grant platform-admin rights to an existing user: npm run admin:grant -- someone@example.com */
import './_env'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '../src/server/db/client'
import { users } from '../src/server/db/schema'

async function main() {
  const email = process.argv[2]
  if (!email) throw new Error('Usage: npm run admin:grant -- <email>')
  const [u] = await db().update(users).set({ isPlatformAdmin: true }).where(eq(users.email, email)).returning({ id: users.id })
  if (!u) throw new Error(`No user with email ${email}`)
  console.log(`${email} is now a platform admin.`)
}
main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => closeDb())
