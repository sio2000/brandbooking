# Product

## Brand

**Name:** Hournook — _hour_ + _nook_: a small, calm corner where your hours get
booked. Short (8 letters), easy to spell after hearing it once, no meaning
clash in major European languages, and not tied to one industry.

**Tagline:** _Booking, without the back-and-forth._

**Logo concept:** an arched "nook" (a doorway/alcove shape) containing clock
hands — the hour inside the nook. It works as a solid app icon at 16 px and as a
wordmark lock-up. Assets: `src/app/icon.svg` (favicon), `src/app/favicon.ico`,
`src/app/apple-icon.png`, `public/brand/app-icon.svg`, `public/brand/wordmark.svg`,
`public/brand/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
React components in `src/components/brand/logo.tsx`.

**Palette:** warm paper neutrals; evergreen primary `#0f766e`; apricot accent
`#ee8a4f`. Chart palette validated for colour-vision deficiencies and contrast
in both themes. Typography: Inter (UI) and Bricolage Grotesque (display),
self-hosted under the SIL Open Font License.

**Voice:** plain, warm and specific. Speak to the business owner as a capable
adult; never blame the user in errors; say what happened and what to do next.

### Name availability — what was actually verified

- **Domain:** WHOIS/RDAP services were not reachable from the build
  environment. A DNS lookup for `hournook.com` returned **NXDOMAIN** (no DNS
  records), which suggests — but does not prove — that the domain is
  unregistered. **Confirm with a registrar before relying on it.**
- **Other products:** web searches found no existing product called
  "Hournook". "Nook" alone is a Barnes & Noble e-reader trademark in a different
  class; a professional **trademark search (EUIPO/USPTO/national) was not
  possible from here and must be done before launch.**
- About 80 candidate names were screened; most "slot"/"book"-style names were
  taken. Runner-up names that also returned NXDOMAIN: hourwren, timewren,
  larkhour, pencilslot, tendslot.

## Positioning

For independent service businesses (1–15 people) that currently take
bookings by phone, DM or messaging apps. One transparent price —
**€10/month per business**, unlimited staff, bookings and customers,
free trial without a card — against tools that charge per seat or take a cut.

## Users and roles

| Role                  | Can                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Customer (no account) | Book, receive confirmations/reminders, reschedule/cancel via secure link, add to calendar                                  |
| Staff                 | See and manage their own calendar and appointments, update their notification preferences                                  |
| Manager               | Everything operational: all appointments, customers, services, team profiles, hours, booking page, analytics; invite staff |
| Owner                 | Everything, plus billing, team roles, ownership transfer, data export and business deletion                                |
| Platform admin        | Businesses list/search, suspend/unsuspend with reason, audit log, feature flags, system health                             |

## Feature inventory

**Onboarding** — sign-up with email verification; 6-step wizard (business
details & category, booking link with live availability check, time zone and
hours, first service, team, preferences) with sensible defaults (Mon–Fri
9–17); setup checklist on the dashboard until the page is ready to publish.

**Public booking page** (`/book/<slug>`) — business hero with logo, cover,
brand colour, description, contact and social links; service list grouped by
category with prices and durations; staff choice or "anyone"; month calendar
with available days and time slots (business time zone, optional toggle to the
visitor's zone); details form with a per-business phone requirement;
review step; confirmation with add-to-calendar (Google, Outlook, .ics);
"slot just taken" recovery; paused/vacation mode; SEO metadata, JSON-LD,
sitemap; draft preview for members; iframe embed and JS widget (`public/embed.js`);
QR code (PNG/SVG/print poster); UTM/source tracking.

**Customer self-service** (`/manage/<token>`) — view, reschedule within the
business's rules, cancel within the cancellation window, download .ics.

**Dashboard** — overview (today's schedule, key numbers, setup progress,
recent activity, inbox); calendar with day/week/month/agenda views, per-staff
lanes, drag-to-reschedule, click-to-create, "now" line; appointments list with
filters and search, statuses (pending, confirmed, completed,
cancelled, no-show), detail page with history, notes and actions; manual
bookings; command palette (⌘K) and global search; in-app notifications.

**Customers (CRM)** — list with search, sorting and segments (new, returning,
VIP, inactive, upcoming, cancelled, no-show), profile with visit history,
lifetime value and notes, create/edit, GDPR erase, CSV export.

**Services & team** — services with categories, duration, price (or free),
buffers before/after, colour, description, online-bookable toggle,
drag-to-reorder, assignment to staff; team profiles with avatar, title, bio,
services, own hours or business hours.

**Availability** — weekly business hours with split shifts, copy to weekdays;
per-staff schedules; special hours for dates; closures (single days, ranges,
recurring yearly holidays); time blocks (breaks, meetings) per staff.

**Booking rules** — slot interval, minimum notice, maximum advance window,
max bookings per day, instant confirmation vs. manual approval, whether
customers may cancel/reschedule and until when, reminder timings, staff
selection mode (required/optional/hidden), phone field requirement.

**Notifications** — emails for booking received/confirmed/rescheduled/cancelled,
reminders (configurable, deduplicated, never for cancelled bookings), staff
notifications per member preference; business sender name and reply-to;
account emails (verification, reset, invitations); billing emails.

**Analytics & reports** — revenue, bookings, average value, cancellation and
no-show rates with period comparison; booking funnel (page view → service →
time → details → booked); busiest days/hours heatmap; traffic sources and UTM
campaigns; service and staff performance; plain-language insights; printable
reports; CSV exports of appointments, customers and services; full business
data export (JSON).

**Settings** — business profile, booking rules, notifications, team &
invitations (roles, ownership transfer), account (name, password — changing it signs out other
devices — delete account), privacy & data (exports, deletion), activity log.

**Billing** — trial status and countdown, Stripe Checkout, Customer Portal,
invoices list, payment method summary, past-due grace period with banners,
clear state after cancellation; booking page stops accepting new bookings when
billing is inactive (data and dashboard remain available).

**Platform admin** — business directory with search and status, detail view,
suspend/unsuspend (reason + typed confirmation), global audit log, feature
flags, health (last scheduler run, email backlog, failed emails, webhook
failures).

**Quality** — light and dark themes; responsive from 320 px; keyboard
accessible with visible focus; reduced-motion support; print styles; PWA
manifest and icons; i18n-ready message catalogue (English shipped; all
dates/times/currency via `Intl`).

## Deliberate scope decisions (v1)

- **No online payment/deposits from customers** — businesses are paid in person;
  Stripe is used only for the business's own subscription.
- **No SMS** — email only (SMS adds per-message cost that doesn't fit €10/month).
- **No two-way calendar sync** (Google/Outlook) — customers get calendar links
  and .ics files; staff calendars live in Hournook.
- **No customer accounts** — secure links instead; fewer passwords, less PII.
- **Single language (English) shipped**, with the catalogue structured for
  translation.
- **PWA**: installable manifest and icons; no offline mode (bookings need live
  availability).
