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
    postalCode: '546 44',
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

export const companyAddress = `${company.address.street}, ${company.address.postalCode} ${company.address.city}, ${company.address.country}`

/**
 * Version of the Terms of Service / DPA / Privacy Policy. Recorded against each
 * user at sign-up; bump it (and the "last updated" date) when the terms change.
 */
export const LEGAL_VERSION = '2026-10-10'
/** Date the legal texts last changed (ISO date), shown formatted in each page's language. */
export const LEGAL_UPDATED = '2026-10-10'

/**
 * Sub-processors: providers that process personal data to run Hournook.
 * Shown in the Privacy Policy and the DPA; keep both in sync by editing here.
 * What each one does and where it is located are translated in the
 * `legal-shared` catalogue under `subprocessors.<id>`
 * (English source: src/lib/i18n/messages/en/legal-shared.json).
 * `endCustomerData`: whether it processes the data a business's customers
 * submit (those are the sub-processors under the DPA).
 */
export const SUBPROCESSORS = [
  { id: 'netlify', name: 'Netlify, Inc.', endCustomerData: true },
  { id: 'neon', name: 'Neon, Inc.', endCustomerData: true },
  { id: 'resend', name: 'Resend', endCustomerData: true },
  { id: 'stripe', name: 'Stripe Payments Europe, Ltd.', endCustomerData: false },
] as const
