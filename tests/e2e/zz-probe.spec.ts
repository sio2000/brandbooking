import { test } from './support/test'
test('probe frame', async ({ page }) => {
  page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200)))
  page.on('requestfailed', (r) => console.log('failed', r.url(), r.failure()?.errorText))
  page.on('response', (r) => { if (r.status() >= 400) console.log('resp', r.status(), r.url()) })
  const partner = `http://127.0.0.1:3100/__partner-site__`
  await page.route(partner, (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><iframe id="widget" src="http://localhost:3100/embed/aurora-studio"></iframe>` }))
  await page.goto(partner, { waitUntil: 'commit' })
  await page.waitForTimeout(8000)
  for (const f of page.frames()) console.log('frame', f.url(), (await f.content().catch(() => 'x')).slice(0, 300))
})
