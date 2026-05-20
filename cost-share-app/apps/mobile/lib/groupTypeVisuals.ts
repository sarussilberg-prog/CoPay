import type { GroupType } from '@cost-share/shared';

export type GroupTypeIcon =
    | 'airplane-outline'
    | 'home-outline'
    | 'heart-outline'
    | 'people-outline'
    | 'briefcase-outline'
    | 'calendar-outline'
    | 'people-circle-outline'
    | 'apps-outline';

export interface GroupTypeVisual {
    icon: GroupTypeIcon;
    gradient: [string, string];
}

export const GROUP_TYPE_VISUALS: Record<GroupType, GroupTypeVisual> = {
    trip: { icon: 'airplane-outline', gradient: ['#60A5FA', '#3B82F6'] },
    home: { icon: 'home-outline', gradient: ['#34D399', '#10B981'] },
    couple: { icon: 'heart-outline', gradient: ['#F472B6', '#EC4899'] },
    general: { icon: 'people-outline', gradient: ['#A78BFA', '#7C3AED'] },
    work: { icon: 'briefcase-outline', gradient: ['#FBBF24', '#D97706'] },
    event: { icon: 'calendar-outline', gradient: ['#FB7185', '#E11D48'] },
    friends: { icon: 'people-circle-outline', gradient: ['#38BDF8', '#0284C7'] },
    other: { icon: 'apps-outline', gradient: ['#94A3B8', '#475569'] },
};

export function getGroupTypeVisual(type: GroupType): GroupTypeVisual {
    return GROUP_TYPE_VISUALS[type] ?? GROUP_TYPE_VISUALS.general;
}
