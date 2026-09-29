import type { Metadata } from 'next'
import { requireAdminPage } from '@/server/tenancy/context'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { PageHeader } from '@/components/admin/primitives'
import { AdminPasswordForm } from '@/components/admin/admin-password-form'

export const metadata: Metadata = { title: 'Your account' }

export default async function AdminAccountPage() {
  const session = await requireAdminPage()
  return (
    <>
      <PageHeader
        title="Your account"
        description={`Signed in as ${session.user.email}. Works even if you don’t run a business on Hournook yourself.`}
      />
      <Card>
        <CardHeader
          title="Change password"
          description="If you signed in with ADMIN_BOOTSTRAP_PASSWORD, change it here and then delete that variable from your host."
        />
        <CardBody className="pt-0">
          <AdminPasswordForm email={session.user.email} />
        </CardBody>
      </Card>
    </>
  )
}
