import type { Metadata } from 'next'
import { and, eq, isNull } from 'drizzle-orm'
import { requireTenantPage } from '@/server/tenancy/context'
import { listAppointments } from '@/server/business/appointments-admin'
import { pickerData } from '@/server/business/pickers'
import { db } from '@/server/db/client'
import { weeklyHours } from '@/server/db/schema'
import { CalendarView, type CalView } from '@/components/dashboard/calendar/calendar-view'
import { formatTag, timeZoneLabel } from '@/components/dashboard/format-locale'
import { calendarTitle } from '@/components/dashboard/calendar/title'
import { getLocale, getT } from '@/server/i18n'
import {
  addDays,
  endOfMonth,
  isPlainDate,
  localToDate,
  startOfMonth,
  startOfWeek,
  todayIn,
} from '@/lib/tz'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT('app-calendar')
  return { title: t('meta.title') }
}

const VIEWS: CalView[] = ['day', 'week', 'month', 'agenda']

export default async function CalendarPage({ searchParams }: PageProps<'/app/calendar'>) {
  const ctx = await requireTenantPage(['appointments.view_all', 'appointments.view_own'])
  const sp = await searchParams
  const tz = ctx.business.timezone
  const view = VIEWS.includes(sp.view as CalView) ? (sp.view as CalView) : 'week'
  const date = typeof sp.date === 'string' && isPlainDate(sp.date) ? sp.date : todayIn(tz)
  const staffFilter =
    typeof sp.staff === 'string' && /^[0-9a-f-]{36}$/i.test(sp.staff) ? sp.staff : null

  const [from, to] =
    view === 'day'
      ? [date, date]
      : view === 'week'
        ? [startOfWeek(date), addDays(startOfWeek(date), 6)]
        : view === 'month'
          ? [startOfWeek(startOfMonth(date)), addDays(startOfWeek(startOfMonth(date)), 41)]
          : [date, addDays(date, 13)]
  void endOfMonth

  const locale = await getLocale()
  const t = await getT('app-calendar', locale)
  const [rows, pickers, hours] = await Promise.all([
    listAppointments(ctx, {
      from: localToDate(from, 0, tz),
      to: localToDate(addDays(to, 1), 0, tz),
      staffId: staffFilter,
      limit: 2000,
    }),
    pickerData(ctx),
    db()
      .select()
      .from(weeklyHours)
      .where(and(eq(weeklyHours.businessId, ctx.business.id), isNull(weeklyHours.staffId))),
  ])

  return (
    <CalendarView
      view={view}
      date={date}
      title={calendarTitle(view, date, formatTag(locale), (d) => t('agendaTitle', { date: d }))}
      today={todayIn(tz)}
      timezone={tz}
      timezoneLabel={timeZoneLabel(tz, locale)}
      staffFilter={staffFilter}
      appointments={rows.map((r) => ({
        id: r.id,
        status: r.status,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        serviceName: r.serviceName,
        serviceColor: r.serviceColor,
        staffId: r.staffId,
        staffName: r.staffName,
        customerName: `${r.customerFirstName} ${r.customerLastName}`.trim(),
      }))}
      businessHours={hours.map((h) => ({
        weekday: h.weekday,
        start: h.startMinute,
        end: h.endMinute,
      }))}
      staff={pickers.allStaff.filter((s) => s.isActive)}
      services={pickers.services}
      pickerStaff={pickers.staff}
      lockedStaffId={pickers.lockedStaffId}
      canManage={ctx.can('appointments.manage_all') || ctx.can('appointments.manage_own')}
    />
  )
}
