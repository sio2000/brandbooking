'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Check,
  Code2,
  Download,
  ExternalLink,
  Globe,
  ImageUp,
  Mail,
  MessageCircle,
  Pause,
  Play,
  Printer,
  QrCode,
  Rocket,
  Search,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/feedback'
import { Field, FormError } from '@/components/ui/field'
import { Input, InputGroup, Textarea } from '@/components/ui/input'
import { SwitchRow, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { brandStyle } from '@/lib/color'
import {
  brandingAction,
  publishAction,
  removeImageAction,
  seoAction,
  slugAction,
  slugAvailableAction,
  uploadImageAction,
} from '@/app/app/_actions/booking-page'
import { CopyButton } from '../copy-button'
import { ColorPicker, SWATCHES } from '../color-picker'

type B = {
  name: string
  slug: string
  category: string | null
  description: string | null
  publishStatus: 'draft' | 'published' | 'paused'
  pausedMessage: string | null
  brandColor: string
  bookingPolicy: string | null
  showStaffOnPage: boolean
  socialLinks: Partial<Record<string, string>>
  seoTitle: string | null
  seoDescription: string | null
  allowIndexing: boolean
}

export function BookingPageView(p: {
  business: B
  logoUrl: string | null
  coverUrl: string | null
  bookingUrl: string
  origin: string
  canPublish: boolean
  emailVerified: boolean
  acceptingBookings: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <PublishCard {...p} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <BrandingCard {...p} />
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <ShareCard {...p} />
          <SeoCard {...p} />
        </div>
      </div>
      <EmbedCard {...p} />
      <LinkCard {...p} />
    </div>
  )
}

function PublishCard({
  business: b,
  bookingUrl,
  canPublish,
  emailVerified,
  acceptingBookings,
}: Parameters<typeof BookingPageView>[0]) {
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const [pauseMsg, setPauseMsg] = React.useState(b.pausedMessage ?? '')
  const [until, setUntil] = React.useState('')
  const [celebrate, setCelebrate] = React.useState(false)
  async function run(action: 'publish' | 'pause' | 'unpublish') {
    setPending(action)
    const r = await publishAction({ action, pausedMessage: pauseMsg, pausedUntil: until })
    setPending(null)
    if (r.ok) {
      toast.success(r.message ?? 'Saved')
      if (action === 'publish') setCelebrate(true)
      router.refresh()
    } else toast.error(r.fields?._form ?? r.error)
  }
  const status = b.publishStatus
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-2xl',
            status === 'published'
              ? 'bg-success-soft text-success'
              : status === 'paused'
                ? 'bg-warning-soft text-warning'
                : 'bg-surface-2 text-muted-foreground',
          )}
        >
          {status === 'published' ? (
            <Globe className="size-6" />
          ) : status === 'paused' ? (
            <Pause className="size-6" />
          ) : (
            <Rocket className="size-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-sans text-lg font-semibold tracking-normal">
              {status === 'published'
                ? 'Your booking page is live'
                : status === 'paused'
                  ? 'Online booking is paused'
                  : 'Your booking page is a draft'}
            </h2>
            <Badge
              tone={
                status === 'published' ? 'success' : status === 'paused' ? 'warning' : 'neutral'
              }
            >
              {status === 'published' ? 'Live' : status === 'paused' ? 'Paused' : 'Draft'}
            </Badge>
          </div>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 truncate text-sm text-primary hover:underline"
          >
            {bookingUrl.replace(/^https?:\/\//, '')} <ExternalLink className="size-3.5" />
          </a>
          {status === 'published' && !acceptingBookings && (
            <p className="mt-1 text-[13px] text-warning">
              Bookings are currently switched off because there’s no active subscription.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
              Preview
            </a>
          </Button>
          {status !== 'published' && (
            <Button
              onClick={() => run('publish')}
              loading={pending === 'publish'}
              disabled={!canPublish || !emailVerified}
            >
              <Play /> {status === 'paused' ? 'Resume bookings' : 'Publish'}
            </Button>
          )}
          {status === 'published' && <CopyButton value={bookingUrl} label="Copy link" />}
        </div>
      </div>
      {status !== 'published' && (!canPublish || !emailVerified) && (
        <div className="border-t border-border px-5 py-3 sm:px-6">
          <Alert tone="info">
            {!emailVerified
              ? 'Confirm your email address first. Check your inbox for the link.'
              : 'Add at least one active service with a team member assigned, then publish.'}
          </Alert>
        </div>
      )}
      {status === 'published' && (
        <details className="group border-t border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:px-6">
            Pause online booking (vacation mode)
            <span className="text-xs transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:px-6">
            <Field
              label="Message for customers"
              htmlFor="pause-msg"
              optional
              hint="Shown on your booking page while paused."
            >
              <Input
                value={pauseMsg}
                onChange={(e) => setPauseMsg(e.target.value)}
                placeholder="We’re on holiday until 3 September. See you soon!"
                maxLength={500}
              />
            </Field>
            <Field label="Reopen automatically on" htmlFor="pause-until" optional>
              <Input
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="w-48"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => run('pause')}
                loading={pending === 'pause'}
              >
                <Pause /> Pause bookings
              </Button>
              <Button
                variant="ghost"
                onClick={() => run('unpublish')}
                loading={pending === 'unpublish'}
              >
                Unpublish
              </Button>
            </div>
          </div>
        </details>
      )}
      <AnimatePresence>
        {celebrate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border bg-success-soft px-5 py-4 text-success-soft-foreground sm:px-6"
          >
            <p className="flex items-center gap-2 font-semibold">
              <Check className="size-5" /> Your booking page is live.
            </p>
            <p className="mt-1 text-sm">
              Share the link on Instagram, Google Business Profile or WhatsApp, or print the QR code
              for your counter.
            </p>
            <div className="mt-3 flex gap-2">
              <CopyButton value={bookingUrl} label="Copy booking link" size="sm" />
              <Button size="sm" variant="ghost" onClick={() => setCelebrate(false)}>
                Dismiss
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function ShareCard({ bookingUrl, business }: Parameters<typeof BookingPageView>[0]) {
  const text = `Book an appointment with ${business.name}: ${bookingUrl}`
  return (
    <Card id="share">
      <CardHeader title="Share" description="Put your link wherever customers find you." />
      <CardBody className="grid grid-cols-1 gap-4">
        <div className="flex gap-2">
          <Input
            readOnly
            value={bookingUrl}
            aria-label="Booking link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton value={bookingUrl} label="Copy" variant="secondary" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle /> WhatsApp
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a
              href={`mailto:?subject=${encodeURIComponent(`Book with ${business.name}`)}&body=${encodeURIComponent(text)}`}
            >
              <Mail /> Email
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(bookingUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Facebook
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(bookingUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </a>
          </Button>
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic authenticated SVG */}
          <img
            src="/app/qr?format=svg"
            alt={`QR code linking to ${bookingUrl}`}
            className="size-28 rounded-lg bg-white p-1"
          />
          <div className="grid grid-cols-1 gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <QrCode className="size-4" /> QR code
            </p>
            <p className="text-[13px] text-muted-foreground">
              For your counter, flyers or business cards. Bookings from it are tracked as “QR code”.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <a href="/app/qr?format=png&download=1">
                  <Download /> PNG
                </a>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <a href="/app/qr?format=svg&download=1">
                  <Download /> SVG
                </a>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a href="/app/booking-page/qr-print" target="_blank" rel="noopener noreferrer">
                  <Printer /> Print
                </a>
              </Button>
            </div>
          </div>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            Campaign links (track where bookings come from)
          </summary>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Add UTM parameters and bookings will show the campaign in Analytics:
          </p>
          <code className="mt-2 block rounded-lg bg-surface-2 p-2 text-xs break-all">
            {bookingUrl}?utm_source=instagram&amp;utm_campaign=spring
          </code>
        </details>
      </CardBody>
    </Card>
  )
}

function EmbedCard({ business, origin }: Parameters<typeof BookingPageView>[0]) {
  const button = `<script src="${origin}/embed.js" data-business="${business.slug}" data-label="Book now" data-color="${business.brandColor}" async></script>`
  const inline = `<script src="${origin}/embed.js" data-business="${business.slug}" data-mode="inline" async></script>`
  return (
    <Card>
      <CardHeader
        title="Add booking to your website"
        description="Paste one line into your site. The booking flow opens in a secure, self-contained window, so it won’t clash with your site’s design."
      />
      <CardBody>
        <Tabs defaultValue="button">
          <TabsList>
            <TabsTrigger value="button">
              <Code2 /> Booking button
            </TabsTrigger>
            <TabsTrigger value="inline">Inline</TabsTrigger>
          </TabsList>
          {[
            ['button', button, 'A button that opens booking in a popup.'],
            ['inline', inline, 'The full booking flow embedded where you place the code.'],
          ].map(([k, code, desc]) => (
            <TabsContent key={k} value={k!} className="mt-3 grid grid-cols-1 gap-2">
              <p className="text-[13px] text-muted-foreground">{desc}</p>
              <pre
                tabIndex={0}
                aria-label="Embed code"
                className="overflow-x-auto rounded-xl bg-foreground p-3 text-xs text-background"
              >
                <code>{code}</code>
              </pre>
              <CopyButton
                value={code!}
                label="Copy code"
                size="sm"
                variant="secondary"
                className="justify-self-start"
                toastMessage="Code copied"
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardBody>
    </Card>
  )
}

function BrandingCard({ business: b, logoUrl, coverUrl }: Parameters<typeof BookingPageView>[0]) {
  const router = useRouter()
  const [v, setV] = React.useState({
    brandColor: b.brandColor,
    bookingPolicy: b.bookingPolicy ?? '',
    showStaffOnPage: b.showStaffOnPage,
    instagram: b.socialLinks.instagram ?? '',
    facebook: b.socialLinks.facebook ?? '',
    tiktok: b.socialLinks.tiktok ?? '',
    x: b.socialLinks.x ?? '',
    linkedin: b.socialLinks.linkedin ?? '',
    youtube: b.socialLinks.youtube ?? '',
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [pending, setPending] = React.useState(false)
  const custom = !SWATCHES.includes(v.brandColor)
  return (
    <Card>
      <CardHeader
        title="Branding"
        description="Your logo, cover and colour. The preview updates as you edit."
      />
      <CardBody className="grid grid-cols-1 gap-5">
        <div
          className="brand-scope overflow-hidden rounded-2xl border border-border"
          style={brandStyle(v.brandColor)}
          aria-label="Live preview"
          role="img"
        >
          <div
            className="h-20 bg-primary-soft"
            style={
              coverUrl
                ? {
                    backgroundImage: `url(${coverUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : {
                    background:
                      'radial-gradient(120% 140% at 10% 0%, color-mix(in oklab, var(--primary) 55%, transparent) 0%, transparent 55%), var(--primary-soft)',
                  }
            }
          />
          <div className="-mt-6 flex items-end gap-3 px-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="size-12 rounded-xl border-2 border-surface bg-surface object-contain"
              />
            ) : (
              <div className="grid size-12 place-items-center rounded-xl border-2 border-surface bg-primary font-display text-lg font-bold text-primary-foreground">
                {b.name[0]}
              </div>
            )}
          </div>
          <div className="p-4 pt-2">
            <p className="font-display font-bold">{b.name}</p>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface p-3">
              <span className="text-sm font-medium">Sample service</span>
              <span className="rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary-soft-foreground">
                Book
              </span>
            </div>
            <div className="mt-2 rounded-xl bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">
              Confirm booking
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ImageUpload kind="logo" label="Logo" hint="Square, at least 64px." current={logoUrl} />
          <ImageUpload
            kind="cover"
            label="Cover image"
            hint="Wide, at least 800×200px."
            current={coverUrl}
          />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <span className="text-sm font-medium">Brand colour</span>
          <div className="flex flex-wrap items-center gap-3">
            <ColorPicker
              value={v.brandColor}
              onChange={(brandColor) => setV({ ...v, brandColor })}
              label="Brand colour"
            />
            <label
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-sm',
                custom ? 'border-primary' : 'border-border',
              )}
            >
              <input
                type="color"
                value={v.brandColor}
                onChange={(e) => setV({ ...v, brandColor: e.target.value })}
                className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label="Custom brand colour"
              />
              Custom
            </label>
          </div>
          {errors.brandColor && <p className="text-[13px] text-danger">{errors.brandColor}</p>}
        </div>
        <Field
          label="Booking policy"
          htmlFor="policy"
          optional
          hint="Shown on your page and in confirmation emails, e.g. late arrivals, deposits, cancellations."
          error={errors.bookingPolicy}
        >
          <Textarea
            rows={3}
            value={v.bookingPolicy}
            onChange={(e) => setV({ ...v, bookingPolicy: e.target.value })}
            maxLength={2000}
          />
        </Field>
        <SwitchRow
          id="show-staff"
          label="Show team members on your page"
          description="Let customers choose who they’d like to see."
          checked={v.showStaffOnPage}
          onCheckedChange={(c) => setV({ ...v, showStaffOnPage: c })}
        />
        <details>
          <summary className="cursor-pointer text-sm font-medium">Social links</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['instagram', 'facebook', 'tiktok', 'x', 'linkedin', 'youtube'] as const).map((k) => (
              <Field
                key={k}
                label={k === 'x' ? 'X (Twitter)' : k[0]!.toUpperCase() + k.slice(1)}
                htmlFor={`soc-${k}`}
                error={errors[k]}
              >
                <Input
                  value={v[k]}
                  onChange={(e) => setV({ ...v, [k]: e.target.value })}
                  placeholder={`https://${k === 'x' ? 'x' : k}.com/…`}
                />
              </Field>
            ))}
          </div>
        </details>
      </CardBody>
      <CardFooter>
        <Button
          loading={pending}
          onClick={async () => {
            setPending(true)
            const r = await brandingAction(v)
            setPending(false)
            if (r.ok) {
              toast.success(r.message ?? 'Saved')
              setErrors({})
              router.refresh()
            } else {
              setErrors(r.fields ?? {})
              toast.error(r.error)
            }
          }}
        >
          Save branding
        </Button>
      </CardFooter>
    </Card>
  )
}

function ImageUpload({
  kind,
  label,
  hint,
  current,
}: {
  kind: 'logo' | 'cover'
  label: string
  hint: string
  current: string | null
}) {
  const router = useRouter()
  const ref = React.useRef<HTMLInputElement>(null)
  const [pending, setPending] = React.useState(false)
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id={`up-${kind}`}
          aria-label={`Upload ${label.toLowerCase()}`}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            if (file.size > 5 * 1024 * 1024) return toast.error('That file is larger than 5 MB.')
            setPending(true)
            const fd = new FormData()
            fd.set('kind', kind)
            fd.set('file', file)
            const r = await uploadImageAction(fd)
            setPending(false)
            e.target.value = ''
            if (r.ok) {
              toast.success(r.message ?? 'Uploaded')
              router.refresh()
            } else toast.error(r.error)
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() => ref.current?.click()}
        >
          <ImageUp /> {current ? 'Replace' : 'Upload'}
        </Button>
        {current && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={async () => {
              const r = await removeImageAction(kind)
              if (r.ok) router.refresh()
              else toast.error(r.error)
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint} JPG, PNG or WebP up to 5 MB.</p>
    </div>
  )
}

function SeoCard({ business: b, bookingUrl }: Parameters<typeof BookingPageView>[0]) {
  const router = useRouter()
  const [v, setV] = React.useState({
    seoTitle: b.seoTitle ?? '',
    seoDescription: b.seoDescription ?? '',
    allowIndexing: b.allowIndexing,
  })
  const [pending, setPending] = React.useState(false)
  const title = v.seoTitle || `${b.name} · Online booking`
  const desc =
    v.seoDescription || b.description?.slice(0, 160) || `Book an appointment with ${b.name} online.`
  return (
    <Card>
      <CardHeader
        title="Search & social previews"
        description="How your page appears on Google and when shared."
      />
      <CardBody className="grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-border p-3" aria-label="Search result preview">
          <p className="truncate text-xs text-muted-foreground">
            {bookingUrl.replace(/^https?:\/\//, '')}
          </p>
          <p className="truncate text-[15px] font-medium text-info">{title}</p>
          <p className="line-clamp-2 text-[13px] text-muted-foreground">{desc}</p>
        </div>
        <Field label="Page title" htmlFor="seo-title" optional hint={`${v.seoTitle.length}/70`}>
          <Input
            value={v.seoTitle}
            maxLength={70}
            onChange={(e) => setV({ ...v, seoTitle: e.target.value })}
            placeholder={`${b.name} · Online booking`}
          />
        </Field>
        <Field
          label="Description"
          htmlFor="seo-desc"
          optional
          hint={`${v.seoDescription.length}/200`}
        >
          <Textarea
            rows={2}
            value={v.seoDescription}
            maxLength={200}
            onChange={(e) => setV({ ...v, seoDescription: e.target.value })}
          />
        </Field>
        <SwitchRow
          id="seo-index"
          label="Allow search engines to list this page"
          description="Turn off if you only share the link privately."
          checked={v.allowIndexing}
          onCheckedChange={(c) => setV({ ...v, allowIndexing: c })}
        />
      </CardBody>
      <CardFooter>
        <Button
          variant="secondary"
          loading={pending}
          onClick={async () => {
            setPending(true)
            const r = await seoAction(v)
            setPending(false)
            if (r.ok) {
              toast.success(r.message ?? 'Saved')
              router.refresh()
            } else toast.error(r.error)
          }}
        >
          <Search /> Save
        </Button>
      </CardFooter>
    </Card>
  )
}

function LinkCard({ business: b, origin }: Parameters<typeof BookingPageView>[0]) {
  const router = useRouter()
  const [slug, setSlug] = React.useState(b.slug)
  const [check, setCheck] = React.useState<{
    slug: string
    available: boolean
    reason: string | null
  } | null>(null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (slug === b.slug) return
    const t = setTimeout(async () => {
      const r = await slugAvailableAction(slug)
      if (r.ok) setCheck({ slug, ...r.data })
    }, 350)
    return () => clearTimeout(t)
  }, [slug, b.slug])
  const status = slug === b.slug ? null : check?.slug === slug ? check : null
  return (
    <Card>
      <CardHeader
        title="Booking link"
        description="Changing it breaks links you’ve already shared (including printed QR codes)."
      />
      <CardBody className="grid grid-cols-1 gap-2">
        <FormError message={error} />
        <InputGroup
          prefix={`${origin.replace(/^https?:\/\//, '')}/book/`}
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          aria-label="Booking link"
          maxLength={48}
        />
        {status && (
          <p
            className={cn(
              'text-[13px] font-medium',
              status.available ? 'text-success' : 'text-danger',
            )}
          >
            {status.available ? 'Available' : (status.reason ?? 'Already taken')}
          </p>
        )}
      </CardBody>
      <CardFooter>
        <Button
          variant="secondary"
          disabled={slug === b.slug || !status?.available}
          loading={pending}
          onClick={async () => {
            setPending(true)
            const r = await slugAction(slug)
            setPending(false)
            if (r.ok) {
              toast.success(r.message ?? 'Saved')
              setError(null)
              router.refresh()
            } else setError(r.fields?.slug ?? r.error)
          }}
        >
          Change link
        </Button>
      </CardFooter>
    </Card>
  )
}
