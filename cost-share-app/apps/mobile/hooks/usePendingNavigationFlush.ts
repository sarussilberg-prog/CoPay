/**
 * Applies pendingNavigation set during invite redeem outside NavigationContainer.
 */

import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store';

export function usePendingNavigationFlush(): void {
    const navigation = useNavigation() as any;
    const pendingNavigation = useAppStore(s => s.pendingNavigation);
    const setPendingNavigation = useAppStore(s => s.setPendingNavigation);

    useEffect(() => {
        if (!pendingNavigation) return;
        setPendingNavigation(null);
        if (pendingNavigation.target === 'friends') {
            navigation.navigate('Profile', { screen: 'Friends' });
            return;
        }
        navigation.navigate('Groups', {
            screen: 'GroupDetail',
            params: { groupId: pendingNavigation.groupId },
        });
    }, [pendingNavigation, navigation, setPendingNavigation]);
}
