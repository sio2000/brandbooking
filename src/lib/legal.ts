/**
 * The provider of Hournook, as shown on the legal pages, the legal notice and
 * in the footer. Public information (EU e-Commerce Directive, art. 5).
 */
export const company = {
  /** Registered sole proprietor (ατομική επιχείρηση). */
  legalName: 'Theocharis Panagiotis Siozos',
  legalNameEl: 'ΣΙΩΖΟΣ ΘΕΟΧΑΡΗΣ ΠΑΝΑΓΙΩΤΗΣ',
  tradingName: 'DevTaskHub.com',
  address: {
    street: 'Markou Mpotsari 83',
    city: 'Thessaloniki',
    country: 'Greece',
  },
  /** Greek tax identification number (ΑΦΜ). */
  vatNumber: '169481343',
  /** General Commercial Registry (Γ.Ε.ΜΗ.) number. */
  gemiNumber: '186989906000',
  email: 'devtaskhub@devtaskhub.com',
  website: 'https://devtaskhub.com',
} as const

export const companyAddress = `${company.address.street}, ${company.address.city}, ${company.address.country}`

/**
 * Version of the Terms of Service / DPA / Privacy Policy. Recorded against each
 * user at sign-up; bump it (and the "last updated" date) when the terms change.
 */
export const LEGAL_VERSION = '2026-09-28'
export const LEGAL_UPDATED = '28 September 2026'

/**
 * Sub-processors: providers that process personal data to run Hournook.
 * Shown in the Privacy Policy and the DPA; keep both in sync by editing here.
 * `endCustomerData`: whether it processes the data a business's customers
 * submit (those are the sub-processors under the DPA).
 */
export const SUBPROCESSORS = [
  {
    name: 'Netlify, Inc.',
    country: 'United States',
    purpose:
      'Application hosting, serverless functions, content delivery, scheduled jobs, application logs and storage of uploaded images',
    endCustomerData: true,
  },
  {
    name: 'Neon, Inc.',
    country: 'United States (database hosted on Amazon Web Services)',
    purpose:
      'PostgreSQL database: accounts, businesses, customers, appointments and backups of them',
    endCustomerData: true,
  },
  {
    name: 'Resend',
    country: 'United States (emails sent from its EU region, Ireland)',
    purpose:
      'Delivery of transactional emails: booking confirmations, changes and reminders; account and security emails',
    endCustomerData: true,
  },
  {
    name: 'Stripe Payments Europe, Ltd.',
    country: 'Ireland',
    purpose:
      'Subscription payments, invoices and the billing portal for businesses (never receives End Customer data)',
    endCustomerData: false,
  },
] as const
