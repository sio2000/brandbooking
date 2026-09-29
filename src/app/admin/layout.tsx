import type { Metadata } from 'next'
import { listMemberships, requireAdminPage } from '@/server/tenancy/context'
import { AdminSidebar, AdminTopBar } from '@/components/admin/admin-nav'

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin · Hournook' },
  robots: { index: false, follow: false },
}

/**
 * Platform-operator area. The guard 404s non-admins (so the area's existence
 * isn't revealed) and sends anonymous visitors to sign in. Every server action
 * re-checks admin access on its own — this layout is not the only gate.
 */
export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const session = await requireAdminPage()
  // Admins without a business are never sent to onboarding from here.
  const hasBusiness = (await listMemberships(session.user.id)).length > 0
  return (
    // The admin area is English only, whatever the account's language.
    <div lang="en" dir="ltr" className="min-h-dvh bg-background">
      <a
        href="#admin-main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-medium shadow-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <AdminSidebar email={session.user.email} hasBusiness={hasBusiness} />
      <AdminTopBar email={session.user.email} hasBusiness={hasBusiness} />
      <main id="admin-main" tabIndex={-1} className="outline-none lg:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </main>
    </div>
  )
}
