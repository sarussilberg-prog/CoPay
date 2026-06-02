/**
 * Onboarding palette — matches the "פשוט" design canvas (distinct from main app primary).
 */
export const onboardingColors = {
    navy: '#0A1428',
    blue: '#4A86E8',
    blueSoft: '#E8F0FC',
    blueDeep: '#2E5BB5',
    cream: '#F7F5F0',
    ink: '#0F172A',
    ink2: '#334155',
    muted: '#64748B',
    hairline: '#E2E8F0',
    greenInk: '#047857',
    greenSoft: '#E6F5EE',
    white: '#FFFFFF',
} as const;

export type OnboardingHeroVariant =
    | 'sea'
    | 'mountains'
    | 'forest'
    | 'flowers'
    | 'waves';

export const ONBOARDING_HERO_GRADIENTS: Record<
    OnboardingHeroVariant,
    { colors: [string, string, string]; locations?: [number, number, number] }
> = {
    sea: { colors: ['#0EA5E9', '#2563EB', '#1E3A5F'], locations: [0, 0.55, 1] },
    mountains: { colors: ['#6366F1', '#4F46E5', '#0A1428'], locations: [0, 0.5, 1] },
    forest: { colors: ['#34D399', '#059669', '#14532D'], locations: [0, 0.45, 1] },
    waves: { colors: ['#38BDF8', '#0284C7', '#0C4A6E'], locations: [0, 0.5, 1] },
    flowers: { colors: ['#F472B6', '#EC4899', '#831843'], locations: [0, 0.5, 1] },
};
