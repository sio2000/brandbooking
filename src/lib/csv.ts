/**
 * CSV serialization (RFC 4180) with spreadsheet formula-injection protection:
 * cells starting with = + - @ tab or CR are prefixed with a single quote so
 * Excel/Sheets treat them as text (OWASP "CSV Injection").
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = value instanceof Date ? value.toISOString() : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel detects UTF-8 correctly.
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
