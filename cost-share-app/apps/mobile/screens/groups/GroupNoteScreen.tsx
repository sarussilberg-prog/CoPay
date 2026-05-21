/**
 * GroupNoteScreen — shared free-text note for a group. Any active member can
 * edit; changes autosave after a short debounce and propagate to other viewers
 * via supabase realtime on the groups row.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRoute } from '@react-navigation/native';
import { Text } from '../../components/AppText';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { supabase } from '../../lib/supabase';
import { getGroupById } from '../../services/groups.service';
import {
    resolveAutoTextInputStyle,
    rtlTextClassName,
    useRtlLayout,
} from '../../hooks/useRtlLayout';
import { colors } from '../../theme';

const AUTOSAVE_DEBOUNCE_MS = 900;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function GroupNoteScreen() {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const route = useRoute<any>();
    const { groupId } = route.params as { groupId: string };

    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [saveState, setSaveState] = useState<SaveState>('idle');

    const serverNoteRef = useRef('');
    const editingRef = useRef(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inFlightRef = useRef<Promise<void> | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const group = await getGroupById(groupId);
            if (cancelled) return;
            const initial = group?.note ?? '';
            serverNoteRef.current = initial;
            setText(initial);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [groupId]);

    const persist = useCallback(
        async (next: string) => {
            if (next === serverNoteRef.current) return;
            setSaveState('saving');
            const { error } = await supabase
                .from('groups')
                .update({ note: next })
                .eq('id', groupId)
                .eq('is_active', true);
            if (error) {
                setSaveState('error');
                return;
            }
            serverNoteRef.current = next;
            setSaveState('saved');
        },
        [groupId],
    );

    const scheduleSave = useCallback(
        (next: string) => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
                const run = persist(next).finally(() => {
                    if (inFlightRef.current === run) inFlightRef.current = null;
                });
                inFlightRef.current = run;
            }, AUTOSAVE_DEBOUNCE_MS);
        },
        [persist],
    );

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    useEffect(() => {
        const channel = supabase
            .channel(`groups:note:${groupId}`)
            .on(
                'postgres_changes' as never,
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'groups',
                    filter: `id=eq.${groupId}`,
                },
                (payload: { new?: Record<string, unknown> }) => {
                    const remote = (payload.new?.note as string | null) ?? '';
                    if (remote === serverNoteRef.current) return;
                    serverNoteRef.current = remote;
                    // Only overwrite local input if the user isn't mid-edit and
                    // there's nothing waiting to be saved.
                    if (!editingRef.current && !saveTimerRef.current) {
                        setText(remote);
                    }
                },
            )
            .subscribe();

        return () => {
            void channel.unsubscribe();
            void supabase.removeChannel(channel);
        };
    }, [groupId]);

    const handleChange = useCallback(
        (next: string) => {
            setText(next);
            scheduleSave(next);
        },
        [scheduleSave],
    );

    const handleBlur = useCallback(() => {
        editingRef.current = false;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
            void persist(text);
        }
    }, [persist, text]);

    if (loading) return <LoadingIndicator />;

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View className="flex-1 bg-slate-50">
                <View className="flex-row items-center justify-end px-4 pt-2 pb-1">
                    <SaveIndicator state={saveState} />
                </View>
                <View className="flex-1 mx-3 mb-3 bg-white rounded-2xl border border-gray-100 p-4">
                    <TextInput
                        value={text}
                        onChangeText={handleChange}
                        onFocus={() => {
                            editingRef.current = true;
                        }}
                        onBlur={handleBlur}
                        placeholder={t('groups.note.placeholder')}
                        placeholderTextColor={colors.gray400}
                        multiline
                        textAlignVertical="top"
                        autoCorrect
                        autoCapitalize="sentences"
                        scrollEnabled
                        className={[
                            'flex-1 text-base text-gray-900',
                            rtlTextClassName(isRtl),
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        style={[{ minHeight: 200 }, resolveAutoTextInputStyle(isRtl)]}
                        testID="group-note-input"
                    />
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

interface SaveIndicatorProps {
    state: SaveState;
}

function SaveIndicator({ state }: SaveIndicatorProps) {
    const { t } = useTranslation();
    if (state === 'idle') return <View />;

    if (state === 'saving') {
        return (
            <View className="flex-row items-center">
                <ActivityIndicator size="small" color={colors.gray500} />
                <Text className="text-xs text-gray-500 ml-2">
                    {t('groups.note.saving')}
                </Text>
            </View>
        );
    }

    if (state === 'error') {
        return (
            <Text className="text-xs text-red-600">{t('groups.note.saveError')}</Text>
        );
    }

    return <Text className="text-xs text-gray-400">{t('groups.note.saved')}</Text>;
}
