import 'server-only'
import { hash, verify } from '@node-rs/argon2'

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

/**
 * An account without a password (made through Google) matches no password; the
 * same work is done anyway, so the answer takes as long as for any other account.
 */
export async function verifyPassword(
  passwordHash: string | null,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    await burnPasswordCheck(password)
    return false
  }
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

// A dummy hash used to equalize timing when the user does not exist.
let dummyHash: Promise<string> | undefined
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hash('not-a-real-password-hournook', OPTIONS)
  await verifyPassword(await dummyHash, password)
}
