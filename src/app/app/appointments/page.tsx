import type { Metadata } from 'next'
import { requireTenantPage } from '@/server/tenancy/context'
import { listAppointments } from '@/server/business/appointments-admin'
import { pickerData } from '@/server/business/pickers'
import { PageContainer, PageHeader } from '@/components/dashboard/page-header'
import { AppointmentsView } from '@/components/dashboard/appointments-view'
import { addDays, localToDate, todayIn } from '@/lib/tz'
import type { AppointmentStatus } from '@/server/db/schema'

export const metadata: Metadata = { title: 'Appointments' }

const VIEWS = ['upcoming', 'today', 'past', 'all'] as const
const STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show']
const PAGE_SIZE = 50

export default async function AppointmentsPage({ searchParams }: PageProps<'/app/appointments'>) {
  const ctx = await requireTenantPage(['appointments.view_all', 'appointments.view_own'])
  const sp = await searchParams
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const view = (VIEWS as readonly string[]).includes(str('view') ?? '') ? (str('view') as (typeof VIEWS)[number]) : 'upcoming'
  const status = STATUSES.includes(str('status') as AppointmentStatus) ? (str('status') as AppointmentStatus) : undefined
  const page = Math.max(1, Number(str('page') ?? 1) || 1)
  const tz = ctx.business.timezone
  const today = todayIn(tz)
  const now = new Date()
  const range =
    view === 'today'
      ? { from: localToDate(today, 0, tz), to: localToDate(addDays(today, 1), 0, tz), order: 'asc' as const }
      : view === 'past'
        ? { from: undefined, to: now, order: 'desc' as const }
        : view === 'upcoming'
          ? { from: now, to: undefined, order: 'asc' as const }
          : { from: undefined, to: undefined, order: 'desc' as const }
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)
  const [rows, pickers] = await Promise.all([
    listAppointments(ctx, {
      from: range.from,
      to: range.to,
      order: range.order,
      statuses: status ? [status] : view === 'upcoming' ? ['pending', 'confirmed'] : undefined,
      staffId: uuid(str('staff')),
      serviceId: uuid(str('service')),
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
    }),
    pickerData(ctx),
  ])
  return (
    <PageContainer wide>
      <PageHeader title="Appointments" description="Every booking in one place. Filter, update statuses in bulk, or export to a spreadsheet." />
      <AppointmentsView
        rows={rows.slice(0, PAGE_SIZE).map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), createdAt: r.createdAt.toISOString() }))}
        hasMore={rows.length > PAGE_SIZE}
        page={page}
        view={view}
        status={status ?? null}
        staffFilter={uuid(str('staff')) ?? null}
        serviceFilter={uuid(str('service')) ?? null}
        timezone={tz}
        currency={ctx.business.currency}
        services={pickers.services}
        allServices={pickers.allServices}
        staff={pickers.staff}
        allStaff={pickers.allStaff}
        lockedStaffId={pickers.lockedStaffId}
        canManage={ctx.can('appointments.manage_all') || ctx.can('appointments.manage_own')}
        canExport={ctx.can('customers.export')}
        openNew={str('new') === '1'}
      />
    </PageContainer>
  )
}
