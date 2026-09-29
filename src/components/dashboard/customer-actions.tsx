'use client'

import * as React from 'react'
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toaster'
import { eraseCustomerAction } from '@/app/app/_actions/customers'
import { CustomerFormDialog } from './customer-form'
import { useT } from '@/components/i18n/provider'
import { rich } from '@/components/i18n/rich'
import {
  NewAppointmentDialog,
  type PickerService,
  type PickerStaff,
} from './new-appointment-dialog'

export function CustomerActions(p: {
  customer: {
    id: string
    name: string
    firstName: string
    lastName: string
    email: string
    phone: string
    internalNotes: string
  }
  canManage: boolean
  canErase: boolean
  canBook: boolean
  services: PickerService[]
  staff: PickerStaff[]
  lockedStaffId: string | null
  timezone: string
}) {
  const t = useT('app-customers')
  const [editing, setEditing] = React.useState(false)
  const [booking, setBooking] = React.useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      {p.canBook && (
        <Button onClick={() => setBooking(true)}>
          <CalendarPlus /> {t('actions.book')}
        </Button>
      )}
      {p.canManage && (
        <Button variant="secondary" onClick={() => setEditing(true)}>
          <Pencil /> {t('actions.edit')}
        </Button>
      )}
      {p.canErase && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" aria-label={t('actions.erase')}>
              <Trash2 />
            </Button>
          }
          title={t('actions.eraseTitle')}
          description={rich(t('actions.eraseBody', { name: p.customer.name }), {
            strong: (c) => <strong>{c}</strong>,
          })}
          confirmLabel={t('actions.eraseConfirm')}
          confirmText={t('actions.eraseWord')}
          onConfirm={async () => {
            const r = await eraseCustomerAction(p.customer.id)
            if (r && !r.ok) {
              toast.error(r.error)
              throw new Error(r.error)
            }
          }}
        />
      )}
      {p.canManage && (
        <CustomerFormDialog open={editing} onOpenChange={setEditing} customer={p.customer} />
      )}
      {p.canBook && (
        <NewAppointmentDialog
          open={booking}
          onOpenChange={setBooking}
          services={p.services}
          staff={p.staff}
          timezone={p.timezone}
          lockedStaffId={p.lockedStaffId}
          customer={{ id: p.customer.id, name: p.customer.name }}
        />
      )}
    </div>
  )
}
