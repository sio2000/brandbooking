import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '@/lib/csv'

describe('csvCell', () => {
  it('renders empty values as empty cells', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell('')).toBe('')
  })

  it('renders plain values unchanged', () => {
    expect(csvCell('Olivia')).toBe('Olivia')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(12.5)).toBe('12.5')
    expect(csvCell(true)).toBe('true')
    expect(csvCell(0)).toBe('0')
  })

  it('serialises dates as ISO-8601 UTC', () => {
    expect(csvCell(new Date('2030-01-02T03:04:05.678Z'))).toBe('2030-01-02T03:04:05.678Z')
  })

  it('quotes cells containing commas, quotes, CR or LF and doubles embedded quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell('line1\r\nline2')).toBe('"line1\r\nline2"')
    expect(csvCell('"')).toBe('""""')
  })

  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['\tcmd', "'\tcmd"],
  ])('neutralises formula prefix in %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected)
  })

  it('neutralises a leading carriage return and still quotes the cell', () => {
    expect(csvCell('\r=cmd')).toBe(`"'\r=cmd"`)
  })

  it('neutralises and quotes a classic DDE / HYPERLINK payload', () => {
    expect(csvCell('=HYPERLINK("http://evil.example","click")')).toBe(`"'=HYPERLINK(""http://evil.example"",""click"")"`)
    expect(csvCell('=cmd|\' /C calc\'!A0')).toBe(`'=cmd|' /C calc'!A0`)
  })

  it('does not alter formula characters that are not at the start', () => {
    expect(csvCell('a=b')).toBe('a=b')
    expect(csvCell('user@example.com')).toBe('user@example.com')
    expect(csvCell('+30 210 000')).toBe("'+30 210 000") // phone numbers are text too
  })

  it('negative numbers are prefixed like any other leading minus (they stay text, never formulas)', () => {
    expect(csvCell(-5)).toBe("'-5")
  })
})

describe('toCsv', () => {
  it('starts with a UTF-8 BOM, uses CRLF and ends with CRLF', () => {
    const out = toCsv(['A', 'B'], [[1, 2], ['x', null]])
    expect(out.charCodeAt(0)).toBe(0xfeff)
    expect(out.slice(1)).toBe('A,B\r\n1,2\r\nx,\r\n')
  })

  it('escapes header cells too', () => {
    expect(toCsv(['=evil', 'a,b'], []).slice(1)).toBe(`'=evil,"a,b"\r\n`)
  })

  it('keeps multi-line cells inside one logical record', () => {
    const out = toCsv(['Note'], [['a\nb'], ['c']]).slice(1)
    expect(out).toBe('Note\r\n"a\nb"\r\nc\r\n')
  })

  it('handles unicode without mangling', () => {
    expect(toCsv(['Name'], [['Ζωή Öztürk 😀']]).slice(1)).toBe('Name\r\nΖωή Öztürk 😀\r\n')
  })
})
