/**
 * First-group onboarding — same form as CreateGroupScreen + guidance panel.
 */

import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { platformAlert } from '../../lib/platformAlert';
import { useTranslation } from 'react-i18next';
import { GroupType, DEFAULT_CURRENCY, User } from '@cost-share/shared';
import Toast from 'react-native-toast-message';
import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import { createGroup, updateGroup } from '../../services/groups.service';
import { uploadGroupImage } from '../../services/storage.service';
import { markPostLoginOnboardingComplete } from '../../lib/onboardingStorage';
import { Button } from '../../components/Button';
import { Text } from '../../components/AppText';
import { AppIcon } from '../../components/AppIcon';
import { AddMembersSheet } from '../../components/AddMembersSheet';
import { CreateGroupFormShell } from '../../components/groups/CreateGroupFormShell';
import { CreateGroupFormFields } from '../../components/groups/CreateGroupFormFields';
import { CreateGroupGuidancePanel } from '../../components/groups/CreateGroupGuidancePanel';
import { colors } from '../../theme';
import { useRtlLayout } from '../../hooks/useRtlLayout';

type Props = {
    onDone: () => void;
};

export function OnboardingCreateGroupScreen({ onDone }: Props) {
    const { t } = useTranslation();
    const isRtl = useRtlLayout();
    const currentUser = useAppStore((s) => s.currentUser);
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [name, setName] = useState('');
    const [nameError, setNameError] = useState('');
    const [groupType, setGroupType] = useState<GroupType>('trip');
    const [currency, setCurrency] = useState(currentUser?.defaultCurrency ?? DEFAULT_CURRENCY);
    const [localImageUri, setLocalImageUri] = useState<string | null>(null);
    const [members, setMembers] = useState<User[]>([]);
    const [addMembersOpen, setAddMembersOpen] = useState(false);

    const finish = useCallback(async () => {
        await markPostLoginOnboardingComplete();
        onDone();
    }, [onDone]);

    const handleFindFriends = useCallback(() => {
        setAddMembersOpen(false);
        Toast.show({
            type: 'info',
            text1: t('onboarding.create.findFriendsAfterCreate'),
        });
    }, [t]);

    const handleSkip = useCallback(() => {
        platformAlert(
            t('onboarding.create.skipTitle'),
            t('onboarding.create.skipMessage'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('onboarding.create.skipConfirm'),
                    style: 'destructive',
                    onPress: () => void finish(),
                },
            ],
        );
    }, [finish, t]);

    const handleCreate = useCallback(async () => {
        if (!name.trim()) {
            setNameError(t('groups.nameRequired'));
            return;
        }
        setNameError('');
        startLoading();
        try {
            const group = await createGroup({
                name: name.trim(),
                groupType,
                defaultCurrency: currency,
                memberIds: members.map((m) => m.id),
            });
            if (!group) {
                Toast.show({ type: 'error', text1: t('common.error') });
                return;
            }
            if (localImageUri) {
                const uploadedUrl = await uploadGroupImage(group.id, localImageUri);
                if (uploadedUrl) {
                    await updateGroup(group.id, { imageUrl: uploadedUrl });
                }
            }
            await finish();
        } finally {
            stopLoading();
        }
    }, [
        currency,
        finish,
        groupType,
        localImageUri,
        members,
        name,
        startLoading,
        stopLoading,
        t,
    ]);

    const displayMembers = currentUser ? [currentUser, ...members] : members;
    const memberIdsForSheet = [
        ...(currentUser ? [currentUser.id] : []),
        ...members.map((m) => m.id),
    ];

    return (
        <>
            <CreateGroupFormShell
                testID="onboarding-create-group-screen"
                title={t('onboarding.create.header')}
                guidance={<CreateGroupGuidancePanel />}
                headerStart={
                    <TouchableOpacity
                        onPress={handleSkip}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        testID="onboarding-create-back"
                        accessibilityRole="button"
                    >
                        <View
                            className="w-9 h-9 rounded-full bg-white border border-slate-200 items-center justify-center"
                        >
                            <AppIcon
                                name={isRtl ? 'chevron-forward' : 'chevron-back'}
                                size={20}
                                color={colors.gray700}
                            />
                        </View>
                    </TouchableOpacity>
                }
                headerEnd={
                    <TouchableOpacity
                        onPress={handleSkip}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        testID="onboarding-create-skip"
                    >
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray500 }}>
                            {t('onboarding.skip')}
                        </Text>
                    </TouchableOpacity>
                }
                footer={
                    <Button
                        title={t('onboarding.create.submit')}
                        onPress={() => void handleCreate()}
                        loading={isLoading}
                        disabled={isLoading || !name.trim()}
                        testID="onboarding-create-submit"
                    />
                }
            >
                <CreateGroupFormFields
                    isEdit={false}
                    name={name}
                    nameError={nameError}
                    onNameChange={(text) => {
                        setName(text);
                        if (nameError) setNameError('');
                    }}
                    groupType={groupType}
                    onGroupTypeChange={setGroupType}
                    currency={currency}
                    onCurrencyChange={setCurrency}
                    localImageUri={localImageUri}
                    onImageChange={setLocalImageUri}
                    displayMembers={displayMembers}
                    currentUserId={currentUser?.id ?? null}
                    currentUser={currentUser}
                    onAddMembers={() => setAddMembersOpen(true)}
                    onRemoveMember={(m) =>
                        setMembers((prev) => prev.filter((x) => x.id !== m.id))
                    }
                />
            </CreateGroupFormShell>

            <AddMembersSheet
                visible={addMembersOpen}
                onClose={() => setAddMembersOpen(false)}
                currentMemberIds={memberIdsForSheet}
                onFindFriends={handleFindFriends}
                onConfirmSelection={(picked) => {
                    setMembers((prev) => {
                        const ids = new Set(prev.map((m) => m.id));
                        return [...prev, ...picked.filter((u) => !ids.has(u.id))];
                    });
                    setAddMembersOpen(false);
                }}
            />
        </>
    );
}
