import type { BUSINESS_CATEGORIES } from '@/lib/validation/business'

export type ServiceSuggestion = { name: string; durationMinutes: number }

type Category = (typeof BUSINESS_CATEGORIES)[number]

/**
 * Typical services per business category, offered as one-tap starting points
 * during onboarding. Owners rename, re-time and price them as they like.
 */
const BY_CATEGORY: Record<Category, ServiceSuggestion[]> = {
  'Hair & beauty': [
    { name: 'Haircut & blow-dry', durationMinutes: 60 },
    { name: 'Colour', durationMinutes: 120 },
    { name: 'Blow-dry', durationMinutes: 45 },
    { name: 'Facial', durationMinutes: 60 },
    { name: 'Brows & lashes', durationMinutes: 45 },
  ],
  Barbershop: [
    { name: 'Haircut', durationMinutes: 30 },
    { name: 'Beard trim', durationMinutes: 15 },
    { name: 'Haircut & beard', durationMinutes: 45 },
    { name: 'Hot towel shave', durationMinutes: 30 },
  ],
  Nails: [
    { name: 'Manicure', durationMinutes: 45 },
    { name: 'Gel manicure', durationMinutes: 60 },
    { name: 'Pedicure', durationMinutes: 60 },
    { name: 'Nail art', durationMinutes: 30 },
    { name: 'Gel removal', durationMinutes: 15 },
  ],
  'Spa & massage': [
    { name: 'Relaxing massage', durationMinutes: 60 },
    { name: 'Deep tissue massage', durationMinutes: 60 },
    { name: 'Hot stone massage', durationMinutes: 90 },
    { name: 'Facial treatment', durationMinutes: 60 },
  ],
  'Health & therapy': [
    { name: 'Initial assessment', durationMinutes: 60 },
    { name: 'Follow-up session', durationMinutes: 45 },
    { name: 'Physiotherapy session', durationMinutes: 45 },
    { name: 'Therapy session', durationMinutes: 50 },
  ],
  'Fitness & coaching': [
    { name: 'Personal training', durationMinutes: 60 },
    { name: 'Fitness assessment', durationMinutes: 45 },
    { name: 'Coaching session', durationMinutes: 60 },
    { name: 'Intro session', durationMinutes: 30 },
  ],
  'Medical & dental': [
    { name: 'Consultation', durationMinutes: 30 },
    { name: 'Check-up', durationMinutes: 30 },
    { name: 'Follow-up', durationMinutes: 15 },
    { name: 'Dental cleaning', durationMinutes: 45 },
  ],
  Consulting: [
    { name: 'Intro call', durationMinutes: 15 },
    { name: 'Consultation', durationMinutes: 60 },
    { name: 'Strategy session', durationMinutes: 90 },
  ],
  'Education & tutoring': [
    { name: 'Lesson', durationMinutes: 60 },
    { name: 'Trial lesson', durationMinutes: 30 },
    { name: 'Exam preparation', durationMinutes: 90 },
  ],
  Photography: [
    { name: 'Portrait session', durationMinutes: 60 },
    { name: 'Headshots', durationMinutes: 30 },
    { name: 'Family session', durationMinutes: 90 },
  ],
  'Pet services': [
    { name: 'Full groom', durationMinutes: 90 },
    { name: 'Bath & brush', durationMinutes: 45 },
    { name: 'Nail trim', durationMinutes: 15 },
  ],
  Automotive: [
    { name: 'Service appointment', durationMinutes: 60 },
    { name: 'Tyre change', durationMinutes: 30 },
    { name: 'Car wash & detailing', durationMinutes: 120 },
  ],
  'Home services': [
    { name: 'Site visit', durationMinutes: 60 },
    { name: 'Repair appointment', durationMinutes: 120 },
    { name: 'Quote visit', durationMinutes: 30 },
  ],
  Other: [
    { name: 'Appointment', durationMinutes: 60 },
    { name: 'Consultation', durationMinutes: 30 },
    { name: 'Follow-up', durationMinutes: 30 },
  ],
}

export function serviceSuggestions(category: string | null | undefined): ServiceSuggestion[] {
  return BY_CATEGORY[category as Category] ?? BY_CATEGORY.Other
}
