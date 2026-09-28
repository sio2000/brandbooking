import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, db } from '@/server/db/client'
import { auditLogs, services } from '@/server/db/schema'
import { resetDatabase } from '../helpers/db'
import {
  addMember,
  addStaff,
  futureDate,
  meta,
  setupBusiness,
  type Setup,
} from '../helpers/factory'
import {
  exportAppointmentsCsv,
  exportBusinessJson,
  exportCustomersCsv,
  exportServicesCsv,
} from '@/server/business/exports'
import { createManualAppointment, changeStatus } from '@/server/business/appointments-admin'
import { eraseCustomer, saveCustomer } from '@/server/business/customers-admin'
import { saveService } from '@/server/business/catalog'
import { createPublicBooking } from '@/server/booking/public'
import type { TenantContext } from '@/server/tenancy/context'
import { addDays, localToDate, todayIn } from '@/lib/tz'

const TZ = 'Europe/Athens'
let A: Setup
let B: Setup

/** Minimal RFC 4180 parser (quoted fields, doubled quotes, CRLF records). */
function parseCsv(text: string): string[][] {
  expect(text.charCodeAt(0)).toBe(0xfeff)
  const s = text.slice(1)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\r' && s[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else cell += ch
  }
  expect(cell).toBe('')
  expect(row).toEqual([])
  return rows
}

const DANGEROUS = /^[=+\-@\t\r]/

function assertNoFormulaCells(rows: string[][]) {
  for (const r of rows)
    for (const c of r) expect(DANGEROUS.test(c), `cell ${JSON.stringify(c)}`).toBe(false)
}

async function manual(
  ctx: TenantContext,
  s: Setup,
  over: Partial<Parameters<typeof createManualAppointment>[1]> = {},
) {
  return createManualAppointment(
    ctx,
    {
      serviceId: s.serviceId,
      staffId: s.ownerStaffId,
      date: futureDate(TZ, 3),
      startMinute: 600,
      customerId: null,
      firstName: 'Plain',
      lastName: 'Person',
      email: null,
      phone: null,
      internalNotes: null,
      notifyCustomer: false,
      ...over,
    },
    meta(),
  )
}

const range = () => ({
  from: localToDate(addDays(todayIn(TZ), -30), 0, TZ),
  to: localToDate(addDays(todayIn(TZ), 30), 0, TZ),
})

beforeEach(async () => {
  await resetDatabase()
  A = await setupBusiness({ name: 'Alpha Salon', timezone: TZ })
  B = await setupBusiness({ name: 'Beta Barbers', timezone: TZ })
})
afterAll(async () => {
  await closeDb()
})

describe('appointments CSV', () => {
  it('exports own appointments with a header and one row each', async () => {
    await manual(A.ctx, A, {
      firstName: 'Ann',
      lastName: 'Lee',
      email: 'ann@example.com',
      phone: '210 5555555',
    })
    await manual(A.ctx, A, { startMinute: 720, firstName: 'Bob', lastName: '' })
    await manual(B.ctx, B, { firstName: 'Secret', lastName: 'Beta', email: 'secret@example.com' })
    const rows = parseCsv(await exportAppointmentsCsv(A.ctx, range(), meta()))
    expect(rows[0]).toEqual([
      'Reference',
      'Date',
      'Start',
      'End',
      'Timezone',
      'Status',
      'Service',
      'Team member',
      'Customer',
      'Email',
      'Phone',
      'Price',
      'Currency',
      'Source',
      'Booked at',
    ])
    expect(rows).toHaveLength(3)
    const ann = rows.find((r) => r[8] === 'Ann Lee')!
    expect(ann).toMatchObject({
      4: TZ,
      5: 'confirmed',
      6: 'Haircut',
      7: 'Olivia Owner',
      9: 'ann@example.com',
      10: '210 5555555',
      11: '35.00',
      12: 'EUR',
      13: 'manual',
    })
    expect(rows.find((r) => r[8] === 'Bob')).toBeTruthy()
    const text = rows.flat().join('|')
    expect(text).not.toContain('Secret')
    expect(text).not.toContain('secret@example.com')
    const [log] = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'export.appointments'))
    expect(log).toMatchObject({
      businessId: A.ctx.business.id,
      actorUserId: A.owner.id,
      metadata: { count: 2 },
    })
  })

  it('neutralises spreadsheet formulas in user-controlled fields', async () => {
    const svc = await saveService(
      A.ctx,
      A.serviceId,
      {
        name: '+SUM(1,2)',
        description: null,
        durationMinutes: 60,
        price: 3500,
        categoryId: null,
        newCategory: null,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        color: '#0f766e',
        isActive: true,
        isVisible: true,
        staffIds: [A.ownerStaffId],
      },
      meta(),
    )
    await addStaff(A.ctx, '@evil', [svc.id])
    await manual(A.ctx, A, {
      firstName: '=HYPERLINK("http://evil.example","x")',
      lastName: '',
      email: 'ok@example.com',
      phone: '+30 210 1234567',
    })
    const csv = await exportAppointmentsCsv(A.ctx, range(), meta())
    const rows = parseCsv(csv)
    assertNoFormulaCells(rows)
    const r = rows[1]!
    expect(r[6]).toBe("'+SUM(1,2)")
    expect(r[8]).toBe(`'=HYPERLINK("http://evil.example","x")`)
    expect(r[10]).toBe("'+30 210 1234567")
  })

  it('respects the date range and the staff scope', async () => {
    const mine = await addStaff(A.ctx, 'Mine', [A.serviceId])
    await manual(A.ctx, A, { firstName: 'Owners' })
    await manual(A.ctx, A, { firstName: 'Mine', staffId: mine.id })
    await manual(A.ctx, A, { firstName: 'FarFuture', date: addDays(todayIn(TZ), 60) })
    const { ctx: staffCtx } = await addMember(A.ctx, 'staff', mine.id)
    const staffRows = parseCsv(await exportAppointmentsCsv(staffCtx, range(), meta()))
    expect(staffRows.slice(1).map((r) => r[8])).toEqual(['Mine Person'])
    const ownerRows = parseCsv(await exportAppointmentsCsv(A.ctx, range(), meta()))
    expect(
      ownerRows
        .slice(1)
        .map((r) => r[8])
        .sort(),
    ).toEqual(['Mine Person', 'Owners Person'])
  })

  it('handles commas, quotes and newlines without breaking the row structure', async () => {
    await manual(A.ctx, A, { firstName: 'Smith, "Jr"', lastName: 'Line\nBreak' })
    const rows = parseCsv(await exportAppointmentsCsv(A.ctx, range(), meta()))
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveLength(15)
    expect(rows[1]![8]).toBe('Smith, "Jr" Line\nBreak')
  })
})

describe('customers CSV', () => {
  it('exports own non-erased customers with stats, formula-safe', async () => {
    const evil = await saveCustomer(
      A.ctx,
      null,
      {
        firstName: '-2+3',
        lastName: '@cmd',
        email: 'evil@example.com',
        phone: null,
        internalNotes: 'never exported',
      },
      meta(),
    )
    const gone = await saveCustomer(
      A.ctx,
      null,
      {
        firstName: 'Gone',
        lastName: 'Away',
        email: 'gone@example.com',
        phone: null,
        internalNotes: null,
      },
      meta(),
    )
    await saveCustomer(
      B.ctx,
      null,
      {
        firstName: 'Other',
        lastName: 'Tenant',
        email: 'other@example.com',
        phone: null,
        internalNotes: null,
      },
      meta(),
    )
    const past = await manual(A.ctx, A, {
      customerId: evil.id,
      firstName: '',
      date: addDays(todayIn(TZ), -3),
    })
    await changeStatus(A.ctx, past.id, 'complete', meta())
    await eraseCustomer(A.ctx, gone.id, meta())
    const rows = parseCsv(await exportCustomersCsv(A.ctx, 'all', meta()))
    assertNoFormulaCells(rows)
    expect(rows[0]![0]).toBe('First name')
    expect(rows).toHaveLength(2)
    expect(rows[1]!.slice(0, 9)).toEqual([
      "'-2+3",
      "'@cmd",
      'evil@example.com',
      '',
      '1',
      '1',
      '0',
      '0',
      '35.00',
    ])
    const text = rows.flat().join('|')
    expect(text).not.toContain('never exported')
    expect(text).not.toContain('Gone')
    expect(text).not.toContain('Deleted')
    expect(text).not.toContain('Other')
  })

  it('exports only the requested segment', async () => {
    const a = await saveCustomer(
      A.ctx,
      null,
      { firstName: 'Upcoming', lastName: '', email: null, phone: null, internalNotes: null },
      meta(),
    )
    await saveCustomer(
      A.ctx,
      null,
      { firstName: 'Idle', lastName: '', email: null, phone: null, internalNotes: null },
      meta(),
    )
    await manual(A.ctx, A, { customerId: a.id, firstName: '' })
    const rows = parseCsv(await exportCustomersCsv(A.ctx, 'upcoming', meta()))
    expect(rows.slice(1).map((r) => r[0])).toEqual(['Upcoming'])
  })
})

describe('services CSV', () => {
  it('exports own, non-deleted services', async () => {
    const extra = await saveService(
      A.ctx,
      null,
      {
        name: '=Colour',
        description: 'Line1\nLine2, "quoted"',
        durationMinutes: 90,
        price: null,
        categoryId: null,
        newCategory: null,
        bufferBeforeMinutes: 5,
        bufferAfterMinutes: 10,
        color: '#000000',
        isActive: true,
        isVisible: false,
        staffIds: [],
      },
      meta(),
    )
    const deleted = await saveService(
      A.ctx,
      null,
      {
        name: 'Deleted one',
        description: null,
        durationMinutes: 30,
        price: 1000,
        categoryId: null,
        newCategory: null,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        color: '#000000',
        isActive: true,
        isVisible: true,
        staffIds: [],
      },
      meta(),
    )
    await db().update(services).set({ deletedAt: new Date() }).where(eq(services.id, deleted.id))
    const rows = parseCsv(await exportServicesCsv(A.ctx))
    assertNoFormulaCells(rows)
    expect(rows.slice(1).map((r) => r[0])).toEqual(['Haircut', "'=Colour"])
    expect(rows[2]).toEqual([
      "'=Colour",
      'Line1\nLine2, "quoted"',
      '90',
      '',
      '5',
      '10',
      'true',
      'false',
    ])
    expect(rows.flat().join('|')).not.toContain('Deleted one')
    void extra
  })
})

describe('business JSON export', () => {
  it('contains own data without manage-link nonces or credentials', async () => {
    const date = futureDate(TZ, 4)
    await createPublicBooking(
      A.ctx.business.slug,
      {
        serviceId: A.serviceId,
        staffId: null,
        start: localToDate(date, 600, TZ).toISOString(),
        firstName: 'Json',
        lastName: 'Export',
        email: 'json@example.com',
        phone: '+30 210 1234567',
        message: null,
        src: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        referrerHost: null,
        website: null,
      },
      meta('203.0.113.70'),
    )
    const json = await exportBusinessJson(A.ctx, meta())
    const data = JSON.parse(json)
    expect(data.format).toBe('hournook-export/v1')
    expect(data.business.id).toBe(A.ctx.business.id)
    expect(data.appointments).toHaveLength(1)
    expect(data.appointments[0]).not.toHaveProperty('manageNonce')
    expect(data.customers.map((c: { email: string }) => c.email)).toEqual(['json@example.com'])
    expect(data.services.map((s: { id: string }) => s.id)).toEqual([A.serviceId])
    expect(data.bookingRules.businessId).toBe(A.ctx.business.id)
    for (const secret of [
      'passwordHash',
      'password_hash',
      'tokenHash',
      'token_hash',
      'manage_nonce',
      'manageNonce',
      '$argon2',
    ]) {
      expect(json).not.toContain(secret)
    }
    const logs = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'business.exported'))
    expect(logs).toHaveLength(1)
  })
})
