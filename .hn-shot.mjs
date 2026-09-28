import { chromium } from '@playwright/test'
const [,, url, out, w = '1440', h = '900', scheme = 'light', full = '0', scrollSel = ''] = process.argv
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: +w, height: +h }, colorScheme: scheme, reducedMotion: process.env.REDUCE ? 'reduce' : 'no-preference' })
const errors = []
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()) })
p.on('pageerror', (e) => errors.push(String(e)))
await p.goto(url, { waitUntil: 'networkidle' })
if (full !== '0') {
  const H = await p.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < H; y += 400) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(120) }
  await p.evaluate(() => window.scrollTo(0, 0))
}
if (scrollSel) { await p.evaluate((s) => { const el = document.querySelector(s); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64) }, scrollSel); await p.waitForTimeout(1500) }
await p.waitForTimeout(1200)
const sw = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
if (sw[0] > sw[1]) console.log('HORIZONTAL OVERFLOW', sw)
if (full === '2') {
  const H = await p.evaluate(() => document.documentElement.scrollHeight)
  let n = 0
  for (let y = 0; y < H; y += +h - 80) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(700); await p.screenshot({ path: out.replace('.png', `-${n++}.png`) }) }
  console.log('chunks', n)
} else await p.screenshot({ path: out, fullPage: full === '1' })
if (errors.length) console.log('ERRORS:', errors.join('\n'))
await b.close()
