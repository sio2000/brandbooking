import type { LucideIcon } from 'lucide-react'
import { Briefcase, Dumbbell, Flower2, Hand, Scissors, Stethoscope } from 'lucide-react'

/**
 * Sample businesses used across the landing page's product mockups to show
 * that the same booking system fits any appointment-based business. All names,
 * people, prices and numbers are illustrative — not Hournook customers.
 */
export type IndustryService = { name: string; minutes: number; price: number | null }
export type Industry = {
  id: string
  label: string
  /** Compact tab label. */
  short: string
  Icon: LucideIcon
  business: string
  category: string
  /** Initials monogram for the mock booking page. */
  monogram: string
  staff: string
  services: IndustryService[]
  /** Sample customer whose booking the demos follow. */
  customer: { name: string; short: string }
  /** Existing appointments shown in the owner's calendar (24h "HH:MM"). */
  day: Array<{ time: string; minutes: number; label: string; who: string }>
  /** Time the sample customer books. */
  bookedTime: string
  times: string[]
}

export const INDUSTRIES: Industry[] = [
  {
    id: 'nails',
    short: 'Nails',
    label: 'Nail studio',
    Icon: Hand,
    business: 'Nia Nail Studio',
    category: 'Nails',
    monogram: 'N',
    staff: 'Nia',
    services: [
      { name: 'Gel manicure', minutes: 60, price: 35 },
      { name: 'Classic manicure', minutes: 45, price: 25 },
      { name: 'Pedicure', minutes: 60, price: 32 },
    ],
    customer: { name: 'Maria Papadopoulou', short: 'Maria P.' },
    day: [
      { time: '09:30', minutes: 60, label: 'Pedicure', who: 'Eleni K.' },
      { time: '11:00', minutes: 45, label: 'Classic manicure', who: 'Sofia D.' },
      { time: '13:30', minutes: 60, label: 'Gel manicure', who: 'Anna M.' },
    ],
    bookedTime: '15:30',
    times: ['10:30', '12:00', '15:30', '16:45'],
  },
  {
    id: 'barber',
    short: 'Barber',
    label: 'Barber',
    Icon: Scissors,
    business: 'Northside Barbers',
    category: 'Barbershop',
    monogram: 'NB',
    staff: 'Leo',
    services: [
      { name: 'Haircut', minutes: 30, price: 22 },
      { name: 'Haircut & beard', minutes: 45, price: 30 },
      { name: 'Beard trim', minutes: 15, price: 12 },
    ],
    customer: { name: 'Nikos Georgiou', short: 'Nikos G.' },
    day: [
      { time: '09:00', minutes: 30, label: 'Haircut', who: 'Alex T.' },
      { time: '10:15', minutes: 45, label: 'Haircut & beard', who: 'Chris P.' },
      { time: '13:00', minutes: 30, label: 'Haircut', who: 'Jonas K.' },
    ],
    bookedTime: '15:30',
    times: ['11:30', '14:00', '15:30', '17:15'],
  },
  {
    id: 'medical',
    short: 'Medical',
    label: 'Medical practice',
    Icon: Stethoscope,
    business: 'Harbor Family Clinic',
    category: 'Medical',
    monogram: 'HF',
    staff: 'Dr. Kostas',
    services: [
      { name: 'Consultation', minutes: 20, price: 60 },
      { name: 'Follow-up visit', minutes: 15, price: 40 },
      { name: 'Annual check-up', minutes: 30, price: 70 },
    ],
    customer: { name: 'Daniel Weber', short: 'Daniel W.' },
    day: [
      { time: '08:30', minutes: 30, label: 'Annual check-up', who: 'Irene L.' },
      { time: '10:00', minutes: 20, label: 'Consultation', who: 'Paul S.' },
      { time: '12:40', minutes: 15, label: 'Follow-up visit', who: 'Mina A.' },
    ],
    bookedTime: '15:30',
    times: ['09:20', '11:40', '15:30', '16:10'],
  },
  {
    id: 'beauty',
    short: 'Beauty',
    label: 'Beauty & skin',
    Icon: Flower2,
    business: 'Lumen Skin Studio',
    category: 'Beauty',
    monogram: 'L',
    staff: 'Ioanna',
    services: [
      { name: 'Signature facial', minutes: 60, price: 65 },
      { name: 'Lash lift', minutes: 45, price: 45 },
      { name: 'Brow shaping', minutes: 30, price: 25 },
    ],
    customer: { name: 'Chloé Martin', short: 'Chloé M.' },
    day: [
      { time: '10:00', minutes: 60, label: 'Signature facial', who: 'Laura B.' },
      { time: '11:30', minutes: 30, label: 'Brow shaping', who: 'Dora V.' },
      { time: '13:00', minutes: 45, label: 'Lash lift', who: 'Kate R.' },
    ],
    bookedTime: '15:30',
    times: ['09:00', '14:15', '15:30', '17:00'],
  },
  {
    id: 'fitness',
    short: 'Fitness',
    label: 'Personal training',
    Icon: Dumbbell,
    business: 'Forma Training',
    category: 'Fitness',
    monogram: 'F',
    staff: 'Marco',
    services: [
      { name: 'Personal training', minutes: 60, price: 45 },
      { name: 'Fitness assessment', minutes: 45, price: 30 },
      { name: 'Duo session', minutes: 60, price: 60 },
    ],
    customer: { name: 'Sam Carter', short: 'Sam C.' },
    day: [
      { time: '07:00', minutes: 60, label: 'Personal training', who: 'Tom H.' },
      { time: '09:00', minutes: 45, label: 'Fitness assessment', who: 'Rita N.' },
      { time: '12:00', minutes: 60, label: 'Duo session', who: 'Ben & Lia' },
    ],
    bookedTime: '15:30',
    times: ['08:00', '13:30', '15:30', '18:00'],
  },
  {
    id: 'consulting',
    short: 'Consulting',
    label: 'Consultant',
    Icon: Briefcase,
    business: 'Arden Advisory',
    category: 'Consulting',
    monogram: 'A',
    staff: 'Helena',
    services: [
      { name: 'Strategy session', minutes: 90, price: 180 },
      { name: 'Consultation', minutes: 60, price: 120 },
      { name: 'Intro call', minutes: 15, price: null },
    ],
    customer: { name: 'Olivia Brandt', short: 'Olivia B.' },
    day: [
      { time: '09:00', minutes: 60, label: 'Consultation', who: 'Mark V.' },
      { time: '11:00', minutes: 15, label: 'Intro call', who: 'Julia S.' },
      { time: '13:00', minutes: 90, label: 'Strategy session', who: 'Northwind Ltd' },
    ],
    bookedTime: '15:30',
    times: ['10:15', '12:00', '15:30', '17:00'],
  },
]

/** Broader list of appointment-based businesses Hournook suits (not customers). */
export const BUSINESS_TYPES = [
  'Hair salons',
  'Barbers',
  'Nail studios',
  'Lash & brow artists',
  'Beauty salons',
  'Massage & spa',
  'Physiotherapists',
  'Therapists & psychologists',
  'Medical practices',
  'Dentists',
  'Nutritionists',
  'Personal trainers',
  'Yoga & pilates studios',
  'Coaches',
  'Consultants',
  'Tutors',
  'Photographers',
  'Tattoo studios',
  'Pet groomers',
  'Repair & service businesses',
] as const

export function euro(n: number | null) {
  if (n == null) return 'Free'
  return `€${Number.isInteger(n) ? n : n.toFixed(2)}`
}

export function durationLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}
