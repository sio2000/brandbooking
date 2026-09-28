import 'server-only'
import { hash, verify } from '@node-rs/argon2'

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
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
