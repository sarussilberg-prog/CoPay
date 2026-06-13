import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotificationPreferences, saveNotificationPreferences } from '../../services/notificationPreferences.service';
import { useAppStore } from '../../store';
import type { NotificationPreferences } from '@cost-share/shared';

const key = (userId: string) => ['notificationPreferences', userId] as const;

export function useNotificationPreferences() {
    const userId = useAppStore((s) => s.currentUser?.id);
    return useQuery({
        queryKey: key(userId as string),
        queryFn: () => fetchNotificationPreferences(userId as string),
        enabled: Boolean(userId),
        staleTime: 60_000,
    });
}

export function useSaveNotificationPreferences() {
    const qc = useQueryClient();
    const userId = useAppStore((s) => s.currentUser?.id);
    return useMutation({
        mutationFn: (prefs: NotificationPreferences) => saveNotificationPreferences(prefs),
        onMutate: async (prefs) => {
            await qc.cancelQueries({ queryKey: key(userId as string) });
            const previous = qc.getQueryData<NotificationPreferences>(key(userId as string));
            qc.setQueryData(key(userId as string), prefs); // optimistic
            return { previous };
        },
        onError: (_e, _prefs, ctx) => {
            if (ctx?.previous) qc.setQueryData(key(userId as string), ctx.previous); // rollback
        },
        onSettled: () => { void qc.invalidateQueries({ queryKey: key(userId as string) }); },
    });
}
