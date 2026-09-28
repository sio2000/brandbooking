import {
  BarChart3,
  BellRing,
  CalendarDays,
  CalendarRange,
  Code2,
  Download,
  Globe,
  ListChecks,
  Lock,
  LockOpen,
  ShieldCheck,
  Store,
  Tags,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

/**
 * Everything in the plan, grouped by what it does for the business rather
 * than as a wall of identical cards. Every item exists in the product today.
 */
type Feature = { Icon: LucideIcon; title: string; text: string }

const GROUPS: Array<{ title: string; lead: string; items: Feature[] }> = [
  {
    title: 'Get booked',
    lead: 'A booking page that works on every phone, with only genuinely free times.',
    items: [
      {
        Icon: Globe,
        title: 'Your booking page',
        text: 'Your name, logo, colours, services and prices — no app or account for customers.',
      },
      {
        Icon: Tags,
        title: 'Services',
        text: 'Durations, prices, buffers and categories, and who offers what.',
      },
      {
        Icon: CalendarRange,
        title: 'Availability',
        text: 'Weekly hours, split shifts, special days, breaks and holidays.',
      },
      {
        Icon: Code2,
        title: 'Website widget & QR code',
        text: 'Embed booking on your site or print a code for your counter.',
      },
    ],
  },
  {
    title: 'Stay organised',
    lead: 'One calendar for the whole team, with every change recorded.',
    items: [
      {
        Icon: CalendarDays,
        title: 'Calendar',
        text: 'Day, week, month and agenda views; drag to reschedule.',
      },
      {
        Icon: ListChecks,
        title: 'Appointments',
        text: 'Confirm, move, cancel, complete or mark no-shows, with full history.',
      },
      {
        Icon: BellRing,
        title: 'Confirmations & reminders',
        text: 'Emails for every booking and change, plus reminders before the visit.',
      },
      {
        Icon: UserPlus,
        title: 'Team',
        text: 'Invite staff with their own login, hours and services.',
      },
    ],
  },
  {
    title: 'Know your business',
    lead: 'The people behind your bookings, and how the business is doing.',
    items: [
      {
        Icon: Users,
        title: 'Customer records',
        text: 'Visit history, total spent, no-shows and private notes — built as people book.',
      },
      {
        Icon: BarChart3,
        title: 'Analytics',
        text: 'Revenue, bookings, busiest times, top services and where bookings come from.',
      },
      {
        Icon: Store,
        title: 'Business profile',
        text: 'Address, contact details, description and booking policy in one place.',
      },
    ],
  },
  {
    title: 'Own your data',
    lead: 'Security and privacy built in, not bolted on.',
    items: [
      {
        Icon: Lock,
        title: 'Secure accounts',
        text: 'Modern password hashing, secure sessions and roles for your team.',
      },
      {
        Icon: Download,
        title: 'Exports',
        text: 'Appointments, customers and services as CSV — or everything at once.',
      },
      {
        Icon: ShieldCheck,
        title: 'Privacy tools',
        text: 'Erase a customer’s personal data on request; no tracking cookies.',
      },
      {
        Icon: LockOpen,
        title: 'No lock-in',
        text: 'Cancel any time from the billing portal. Your data stays yours.',
      },
    ],
  },
]

export function FeatureIndex() {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-14 md:grid-cols-2 lg:gap-x-16">
      {GROUPS.map((g) => (
        <section
          key={g.title}
          aria-labelledby={`fg-${g.title}`}
          className="border-t border-border-strong pt-6"
        >
          <h3 id={`fg-${g.title}`} className="text-h3">
            {g.title}
          </h3>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            {g.lead}
          </p>
          <ul className="mt-6 space-y-5">
            {g.items.map(({ Icon, title, text }) => (
              <li key={title} className="group flex gap-4">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border bg-surface text-primary transition-[transform,border-color] duration-300 ease-[var(--ease-out-soft)] group-hover:-translate-y-0.5 group-hover:border-primary/40"
                >
                  <Icon className="size-[17px]" />
                </span>
                <div>
                  <h4 className="text-[15px] font-semibold">{title}</h4>
                  <p className="mt-0.5 text-[14.5px] leading-relaxed text-muted-foreground">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
