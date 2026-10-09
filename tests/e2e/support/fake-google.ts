/**
 * Runs the stand-in for Google's sign-in (tests/helpers/fake-google.ts) next
 * to the E2E server, the same way fake-resend.mjs stands in for Resend. Tests
 * choose who signs in next through `signInAs` in google.spec.ts.
 */
import { startFakeGoogle } from '../../helpers/fake-google'
import { E2E_GOOGLE, E2E_GOOGLE_PORT } from './env'

startFakeGoogle({ ...E2E_GOOGLE, port: E2E_GOOGLE_PORT }).then(
  (google) => console.log(`fake Google on ${google.url}`),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
