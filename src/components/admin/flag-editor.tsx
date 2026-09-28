'use client'

import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { deleteFlagAction, upsertFlagAction } from '@/app/admin/actions'
import type { ActionResult } from '@/server/actions'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SwitchRow } from '@/components/ui/controls'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FormError } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'

export type FlagValue = {
  key: string
  description: string
  enabled: boolean
  businessAllowlist: string[]
}

const KEY_RE = /^[a-z0-9_.-]{2,64}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function splitIds(raw: string) {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Client-side pre-check (the server validates again). */
function validate(form: FormData): Record<string, string> {
  const errors: Record<string, string> = {}
  const key = String(form.get('key') ?? '').trim()
  if (!KEY_RE.test(key))
    errors.key = 'Use 2–64 lowercase letters, digits, dots, dashes or underscores.'
  const desc = String(form.get('description') ?? '')
  if (desc.length > 500) errors.description = 'Keep the description under 500 characters.'
  const bad = splitIds(String(form.get('businessAllowlist') ?? '')).filter(
    (id) => !UUID_RE.test(id),
  )
  if (bad.length)
    errors.businessAllowlist = `Not a valid business ID (UUID): ${bad
      .slice(0, 3)
      .map((b) => `“${b}”`)
      .join(', ')}${bad.length > 3 ? ` and ${bad.length - 3} more` : ''}.`
  return errors
}

type State = ActionResult<{ key: string }> | null

function FlagForm({ flag, onSaved }: { flag?: FlagValue; onSaved: () => void }) {
  const router = useRouter()
  const [enabled, setEnabled] = React.useState(flag?.enabled ?? false)
  // Controlled fields: React resets uncontrolled inputs after a form action,
  // which would wipe the operator's input when the server rejects it.
  const [key, setKey] = React.useState(flag?.key ?? '')
  const [description, setDescription] = React.useState(flag?.description ?? '')
  const [allowlist, setAllowlist] = React.useState(flag?.businessAllowlist.join('\n') ?? '')
  const allowCount = new Set(splitIds(allowlist).map((s) => s.toLowerCase())).size
  const [state, action, pending] = React.useActionState<State, FormData>(async (_prev, form) => {
    const local = validate(form)
    if (Object.keys(local).length)
      return {
        ok: false,
        code: 'validation',
        error: 'Some details need your attention.',
        fields: local,
      }
    const res = await upsertFlagAction(form)
    if (res.ok) {
      toast.success(res.message ?? 'Feature flag saved.')
      router.refresh()
      onSaved()
    }
    return res
  }, null)
  const f = state && !state.ok ? (state.fields ?? {}) : {}
  const editing = Boolean(flag)

  return (
    <form action={action} noValidate>
      <DialogBody className="grid grid-cols-1 gap-4">
        <FormError message={state && !state.ok && !Object.keys(f).length ? state.error : null} />
        <Field
          label="Key"
          htmlFor="flag-key"
          error={f.key}
          hint={
            editing
              ? 'Keys can’t be renamed. Create a new flag and delete this one instead.'
              : 'Lowercase letters, digits, “.”, “-” and “_”, 2–64 characters. Used in code, e.g. booking.waitlist.'
          }
        >
          <Input
            name="key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            readOnly={editing}
            required
            maxLength={64}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="font-mono read-only:bg-surface-2 read-only:text-muted-foreground"
            autoFocus={!editing}
          />
        </Field>
        <Field
          label="Description"
          htmlFor="flag-description"
          optional
          error={f.description}
          hint="What the flag controls and when it can be removed."
        >
          <Textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            className="min-h-16"
          />
        </Field>
        <div className="rounded-lg border border-border px-3.5">
          <input type="hidden" name="enabled" value={enabled ? 'true' : 'false'} />
          <SwitchRow
            id="flag-enabled"
            label="Enabled for everyone"
            description={
              enabled
                ? 'On for every business. The allowlist below has no extra effect.'
                : 'Off globally — only allowlisted businesses get it.'
            }
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
        <Field
          label={`Business allowlist${allowCount ? ` (${allowCount})` : ''}`}
          htmlFor="flag-allowlist"
          optional
          error={f.businessAllowlist}
          hint="Business IDs (UUIDs), separated by commas or new lines. Copy an ID from the business detail page."
        >
          <Textarea
            name="businessAllowlist"
            value={allowlist}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-[13px] sm:text-[13px]"
            placeholder={'3f1c9a52-8b0e-4f7d-9c55-1a2b3c4d5e6f\n…'}
            onChange={(e) => setAllowlist(e.target.value)}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onSaved}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {editing ? 'Save changes' : 'Create flag'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function FlagDialog({ flag }: { flag?: FlagValue }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {flag ? (
          <Button variant="ghost" size="sm" aria-label={`Edit flag ${flag.key}`}>
            <Pencil aria-hidden />
            <span className="max-sm:sr-only">Edit</span>
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden />
            New flag
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={flag ? `Edit ${flag.key}` : 'New feature flag'}
        description={
          flag
            ? 'Changes apply immediately and are recorded in the audit log.'
            : 'Flags start working as soon as code checks them.'
        }
      >
        {/* Remount on open so the form always starts from the saved values. */}
        {open && <FlagForm flag={flag} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

export function DeleteFlagButton({ flagKey }: { flagKey: string }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      title={`Delete ${flagKey}?`}
      description="Code that checks this flag will treat it as off for every business. This is recorded in the audit log and can’t be undone."
      confirmLabel="Delete flag"
      confirmText={flagKey}
      onConfirm={async () => {
        const res = await deleteFlagAction(flagKey)
        if (res.ok) {
          toast.success(res.message ?? 'Feature flag deleted.')
          router.refresh()
        } else {
          toast.error(res.error)
        }
      }}
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-soft"
          aria-label={`Delete flag ${flagKey}`}
        >
          <Trash2 aria-hidden />
          <span className="max-sm:sr-only">Delete</span>
        </Button>
      }
    />
  )
}
