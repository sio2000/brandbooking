'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark' | 'system'
const KEY = 'hn-theme'

/** Runs before first paint (nonce'd inline script) to avoid a theme flash. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

function apply(theme: Theme) {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const onSystem = () => {
    if (read() === 'system') apply('system')
  }
  mq.addEventListener('change', onSystem)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    mq.removeEventListener('change', onSystem)
    window.removeEventListener('storage', cb)
  }
}
function read(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme | null) ?? 'system'
  } catch {
    return 'system'
  }
}

export function useTheme() {
  const theme = React.useSyncExternalStore(subscribe, read, () => 'system' as Theme)
  const setTheme = React.useCallback((t: Theme) => {
    try {
      localStorage.setItem(KEY, t)
    } catch {}
    apply(t)
    listeners.forEach((l) => l())
  }, [])
  return { theme, setTheme }
}

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const opts: Array<{ v: Theme; label: string; Icon: typeof Sun }> = [
    { v: 'light', label: 'Light', Icon: Sun },
    { v: 'dark', label: 'Dark', Icon: Moon },
    { v: 'system', label: 'System', Icon: Monitor },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn('inline-flex rounded-lg bg-surface-2 p-0.5', className)}
    >
      {opts.map(({ v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={theme === v}
          aria-label={label}
          title={label}
          onClick={() => setTheme(v)}
          className={cn(
            'grid size-7 place-items-center rounded-md transition-colors',
            theme === v
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
