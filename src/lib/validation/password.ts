import { vmsg } from './messages'

/** Password policy (NIST 800-63B style: length over composition rules). */
const COMMON = new Set([
  'password',
  'password1',
  'password123',
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'iloveyou12',
  'letmein123',
  'welcome123',
  'admin12345',
  'abc1234567',
  'passw0rd123',
  'qwerty1234',
  '1q2w3e4r5t',
  'monkey1234',
  'football12',
  'baseball12',
  'superman12',
  'trustno1234',
  'dragon1234',
  'sunshine12',
  'princess12',
  'hournook123',
  'booking123',
  'changeme123',
  'aaaaaaaaaa',
  '0000000000',
  '1111111111',
])

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return vmsg('text.tooShort', { min: PASSWORD_MIN })
  if (password.length > PASSWORD_MAX) return vmsg('text.tooLong', { max: PASSWORD_MAX })
  const lower = password.toLowerCase()
  if (COMMON.has(lower)) return vmsg('password.common')
  if (/^(.)\1+$/.test(password)) return vmsg('password.repeated')
  const local = email?.split('@')[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) {
    return vmsg('password.containsEmail')
  }
  return null
}
