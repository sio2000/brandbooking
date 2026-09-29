/**
 * A slowly scrolling band of business types (CSS only). The list is also
 * rendered once for assistive technology; the moving copy is decorative.
 * Hovering pauses it; with reduced motion it becomes a static, wrapping list.
 * The track is laid out left to right in every language (the loop depends on
 * it); in right-to-left languages it runs the other way.
 */
export function BusinessMarquee({ items, rtl = false }: { items: readonly string[]; rtl?: boolean }) {
  const row = (copy: number) =>
    items.map((t) => (
      <span key={`${copy}-${t}`} className="flex shrink-0 items-center gap-5 pr-5">
        <span dir="auto" className="whitespace-nowrap">
          {t}
        </span>
        <span className="size-1.5 rounded-full bg-ink-primary" />
      </span>
    ))
  return (
    <div className="group relative overflow-hidden bg-ink py-4 text-[15.5px] font-medium text-ink-foreground sm:py-5 sm:text-[17px]">
      <ul className="sr-only">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div
        aria-hidden
        dir="ltr"
        className="flex w-max animate-[hn-marquee_48s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:w-auto motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-2 motion-reduce:px-4"
        style={rtl ? { animationDirection: 'reverse' } : undefined}
      >
        {row(0)}
        <span className="flex motion-reduce:hidden">{row(1)}</span>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-ink to-transparent sm:w-20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink to-transparent sm:w-20"
      />
    </div>
  )
}
