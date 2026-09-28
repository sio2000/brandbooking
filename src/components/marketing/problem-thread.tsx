import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const thread = [
  { from: 'them', text: 'Hi! Do you have anything on Thursday?', at: '09:12' },
  { from: 'me', text: 'Hi! I could do 11:00 or 15:30', at: '12:47' },
  { from: 'them', text: 'Could you do 13:00 instead?', at: '18:05' },
  { from: 'me', text: 'Sorry, 13:00 is gone now. Friday at 10?', at: '21:31' },
  { from: 'them', text: 'Let me check and get back to you', at: '21:58' },
] as const

/** Decorative illustration of the everyday scheduling ping-pong. */
export function ProblemThread({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative mx-auto w-full max-w-[420px] select-none', className)}>
      <div className="absolute inset-x-6 -bottom-3 h-full rounded-2xl border border-border bg-surface-2" />
      <div className="relative rounded-2xl border border-border bg-surface p-4 shadow-md sm:p-5">
        <div className="flex items-center gap-2.5 border-b border-border pb-3">
          <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-muted-foreground">
            <MessageCircle className="size-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold">New customer</p>
            <p className="text-[11px] text-muted-foreground">Messages</p>
          </div>
        </div>
        <ul className="mt-4 space-y-2.5">
          {thread.map((m) => (
            <li key={m.at} className={cn('flex flex-col', m.from === 'me' ? 'items-end' : 'items-start')}>
              <span
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug',
                  m.from === 'me' ? 'rounded-br-md bg-primary-soft text-primary-soft-foreground' : 'rounded-bl-md bg-surface-2 text-foreground',
                )}
              >
                {m.text}
              </span>
              <span className="tabular mt-0.5 px-1 text-[10.5px] text-subtle-foreground">{m.at}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong px-3 py-2 text-[12.5px] font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-accent" />
          Still not booked
        </div>
      </div>
    </div>
  )
}
