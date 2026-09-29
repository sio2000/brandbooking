import type { BUSINESS_CATEGORIES } from '@/lib/validation/business'

/**
 * A suggested service: `id` is its key in the `onboarding` catalogue
 * (`suggestions.<id>`), so the name shows in the owner's language.
 */
export type ServiceSuggestion = { id: SuggestionId; durationMinutes: number }

type Category = (typeof BUSINESS_CATEGORIES)[number]

/**
 * Catalogue key of each business category (`categories.<key>` in the
 * `onboarding` namespace). The stored value stays the English name.
 */
export const CATEGORY_KEYS = {
  'Hair & beauty': 'hairBeauty',
  Barbershop: 'barbershop',
  Nails: 'nails',
  'Spa & massage': 'spaMassage',
  'Health & therapy': 'healthTherapy',
  'Fitness & coaching': 'fitnessCoaching',
  'Medical & dental': 'medicalDental',
  Consulting: 'consulting',
  'Education & tutoring': 'educationTutoring',
  Photography: 'photography',
  'Pet services': 'petServices',
  Automotive: 'automotive',
  'Home services': 'homeServices',
  Other: 'other',
} as const satisfies Record<Category, string>

export type CategoryKey = (typeof CATEGORY_KEYS)[Category]

export function categoryKey(category: string | null | undefined): CategoryKey | null {
  return (CATEGORY_KEYS as Record<string, CategoryKey>)[category ?? ''] ?? null
}

const s = (id: SuggestionId, durationMinutes: number): ServiceSuggestion => ({
  id,
  durationMinutes,
})

export type SuggestionId =
  | 'haircutBlowDry'
  | 'colour'
  | 'blowDry'
  | 'facial'
  | 'browsLashes'
  | 'haircut'
  | 'beardTrim'
  | 'haircutBeard'
  | 'hotTowelShave'
  | 'manicure'
  | 'gelManicure'
  | 'pedicure'
  | 'nailArt'
  | 'gelRemoval'
  | 'relaxingMassage'
  | 'deepTissueMassage'
  | 'hotStoneMassage'
  | 'facialTreatment'
  | 'initialAssessment'
  | 'followUpSession'
  | 'physiotherapySession'
  | 'therapySession'
  | 'personalTraining'
  | 'fitnessAssessment'
  | 'coachingSession'
  | 'introSession'
  | 'consultation'
  | 'checkUp'
  | 'followUp'
  | 'dentalCleaning'
  | 'introCall'
  | 'strategySession'
  | 'lesson'
  | 'trialLesson'
  | 'examPreparation'
  | 'portraitSession'
  | 'headshots'
  | 'familySession'
  | 'fullGroom'
  | 'bathBrush'
  | 'nailTrim'
  | 'serviceAppointment'
  | 'tyreChange'
  | 'carWashDetailing'
  | 'siteVisit'
  | 'repairAppointment'
  | 'quoteVisit'
  | 'appointment'

/**
 * Typical services per business category, offered as one-tap starting points
 * during onboarding. Owners rename, re-time and price them as they like.
 */
const BY_CATEGORY: Record<Category, ServiceSuggestion[]> = {
  'Hair & beauty': [
    s('haircutBlowDry', 60),
    s('colour', 120),
    s('blowDry', 45),
    s('facial', 60),
    s('browsLashes', 45),
  ],
  Barbershop: [s('haircut', 30), s('beardTrim', 15), s('haircutBeard', 45), s('hotTowelShave', 30)],
  Nails: [
    s('manicure', 45),
    s('gelManicure', 60),
    s('pedicure', 60),
    s('nailArt', 30),
    s('gelRemoval', 15),
  ],
  'Spa & massage': [
    s('relaxingMassage', 60),
    s('deepTissueMassage', 60),
    s('hotStoneMassage', 90),
    s('facialTreatment', 60),
  ],
  'Health & therapy': [
    s('initialAssessment', 60),
    s('followUpSession', 45),
    s('physiotherapySession', 45),
    s('therapySession', 50),
  ],
  'Fitness & coaching': [
    s('personalTraining', 60),
    s('fitnessAssessment', 45),
    s('coachingSession', 60),
    s('introSession', 30),
  ],
  'Medical & dental': [
    s('consultation', 30),
    s('checkUp', 30),
    s('followUp', 15),
    s('dentalCleaning', 45),
  ],
  Consulting: [s('introCall', 15), s('consultation', 60), s('strategySession', 90)],
  'Education & tutoring': [s('lesson', 60), s('trialLesson', 30), s('examPreparation', 90)],
  Photography: [s('portraitSession', 60), s('headshots', 30), s('familySession', 90)],
  'Pet services': [s('fullGroom', 90), s('bathBrush', 45), s('nailTrim', 15)],
  Automotive: [s('serviceAppointment', 60), s('tyreChange', 30), s('carWashDetailing', 120)],
  'Home services': [s('siteVisit', 60), s('repairAppointment', 120), s('quoteVisit', 30)],
  Other: [s('appointment', 60), s('consultation', 30), s('followUp', 30)],
}

export function serviceSuggestions(category: string | null | undefined): ServiceSuggestion[] {
  return BY_CATEGORY[category as Category] ?? BY_CATEGORY.Other
}
