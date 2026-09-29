'use client'

import * as React from 'react'
import type { ActionResult } from '@/server/actions'
import { toast } from '@/components/ui/toaster'
import { useT } from '@/components/i18n/provider'

type Options<R> = {
  /** Called after a successful save (after the toast). */
  onSuccess?: (data: R) => void
  /** Toast shown on success when the action has no message of its own. */
  successMessage?: string
  /** Skip the success toast (e.g. when the UI shows its own confirmation). */
  silent?: boolean
  /** Clear the form back to its initial values after saving (e.g. passwords). */
  resetOnSuccess?: boolean
}

/**
 * Controlled form state around a server action returning ActionResult.
 * Values stay exactly as typed when the server rejects them, field errors are
 * mapped by name, and `dirty` compares against the last saved snapshot.
 */
export function useActionForm<T extends Record<string, unknown>, R>(
  initial: T,
  action: (values: T) => Promise<ActionResult<R>>,
  opts: Options<R> = {},
) {
  const t = useT('app-settings')
  const [start] = React.useState<T>(initial)
  const [values, setValues] = React.useState<T>(initial)
  const [baseline, setBaseline] = React.useState<string>(() => JSON.stringify(initial))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const set = React.useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => {
      if (!e[key as string]) return e
      const next = { ...e }
      delete next[key as string]
      return next
    })
  }, [])

  const dirty = JSON.stringify(values) !== baseline

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (pending) return
    setPending(true)
    setFormError(null)
    try {
      const r = await action(values)
      if (!r) return // the action redirected
      if (r.ok) {
        setErrors({})
        if (opts.resetOnSuccess) {
          setValues(start)
          setBaseline(JSON.stringify(start))
        } else setBaseline(JSON.stringify(values))
        setSaved(true)
        setTimeout(() => setSaved(false), 1600)
        if (!opts.silent) toast.success(r.message ?? opts.successMessage ?? t('form.saved'))
        opts.onSuccess?.(r.data)
      } else {
        const fields = r.fields ?? {}
        setErrors(fields)
        const formLevel = fields._form ?? (Object.keys(fields).length ? null : r.error)
        setFormError(formLevel)
        if (Object.keys(fields).length && !fields._form) {
          // Inline errors are shown next to each field; move focus to the first
          // one. Only fall back to a message when no matching field is on screen.
          const target = Object.keys(fields)
            .map((k) => document.getElementById(k))
            .find(Boolean)
          if (target) requestAnimationFrame(() => target.focus())
          else {
            setFormError(Object.values(fields)[0] ?? r.error)
            toast.error(Object.values(fields)[0] ?? r.error)
          }
        }
      }
    } catch {
      setFormError(t('form.offline'))
    } finally {
      setPending(false)
    }
  }

  function reset(next?: T) {
    const v = next ?? (JSON.parse(baseline) as T)
    setValues(v)
    if (next) setBaseline(JSON.stringify(next))
    setErrors({})
    setFormError(null)
  }

  return { values, setValues, set, errors, formError, pending, saved, dirty, submit, reset }
}
