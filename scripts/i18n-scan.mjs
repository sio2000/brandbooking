#!/usr/bin/env node
/**
 * Finds user-visible English left in JSX: text nodes and text-bearing
 * attributes (placeholder, title, aria-label, alt, label…), plus string
 * literals passed to toast(). Usage:
 *   node scripts/i18n-scan.mjs [paths…]     (default: src/app src/components)
 * Exits 1 when anything is found. Admin pages are English-only and skipped.
 * Mark an intentional literal with a trailing `// i18n-ignore` comment on its line.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const targets = args.length ? args : ['src/app', 'src/components']
const SKIP = [
  /\/admin\//,
  /\/components\/ui\/.*\.stories/,
  /opengraph-image|twitter-image|icon\.tsx|apple-icon/,
]
const ATTRS = new Set([
  'placeholder',
  'title',
  'aria-label',
  'aria-description',
  'alt',
  'label',
  'description',
  'subtitle',
  'hint',
  'heading',
  'emptyText',
  'confirmLabel',
  'cancelLabel',
  'tooltip',
  'message',
  'caption',
  'eyebrow',
  'cta',
])
const WORDY = /[A-Za-z]{2,}/

function files(p) {
  const abs = path.resolve(root, p)
  if (statSync(abs).isFile()) return [abs]
  return readdirSync(abs, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? files(path.join(abs, d.name))
      : d.name.endsWith('.tsx')
        ? [path.join(abs, d.name)]
        : [],
  )
}

const found = []
for (const file of targets.flatMap(files)) {
  const rel = path.relative(root, file)
  if (SKIP.some((r) => r.test(rel))) continue
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const report = (node, value) => {
    const { line } = src.getLineAndCharacterOfPosition(node.getStart())
    if (/i18n-ignore/.test(lines[line] ?? '')) return
    found.push(`${rel}:${line + 1}  ${JSON.stringify(value.trim().slice(0, 80))}`)
  }
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const v = node.getText().replace(/\s+/g, ' ').trim()
      if (WORDY.test(v)) report(node, v)
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText()
      if (ATTRS.has(name)) {
        const init = node.initializer
        const lit = ts.isStringLiteral(init)
          ? init.text
          : ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)
            ? init.expression.text
            : ts.isJsxExpression(init) &&
                init.expression &&
                ts.isTemplateExpression(init.expression)
              ? init.expression.head.text
              : null
        if (lit && WORDY.test(lit)) report(node, lit)
      }
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      ts.isStringLiteralLike(node.expression) &&
      ts.isJsxElement(node.parent) &&
      WORDY.test(node.expression.text)
    ) {
      report(node, node.expression.text)
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression.getText()
      if (/^toast(\.\w+)?$/.test(callee)) {
        const a = node.arguments[0]
        if (a && ts.isStringLiteralLike(a) && WORDY.test(a.text)) report(a, a.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
}
if (found.length) {
  console.log(found.join('\n'))
  console.log(`\n${found.length} untranslated string(s)`)
  process.exit(1)
}
console.log('i18n-scan: no hard-coded UI text found')
