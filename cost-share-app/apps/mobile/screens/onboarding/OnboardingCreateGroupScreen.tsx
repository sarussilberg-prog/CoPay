/**
 * First-group onboarding — interactive accordion steps under the live hero
 * (name, category, currency, cover image, members).
 */

import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { platformAlert } from '../../lib/platformAlert';
import { useTranslation } from 'react-i18next';
import { GroupType, User } from '@cost-share/shared';
import { showAppToast, showInfoToast } from '../../lib/appToast';
import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import { createGroup, updateGroup } from '../../services/groups.service';
import { uploadGroupImage } from '../../services/storage.service';
import { markPostLoginOnboardingComplete } from '../../lib/onboardingStorage';
import { CreateGroupFloatingButton } from '../../components/groups/CreateGroupFloatingButton';
import { Text } from '../../components/AppText';
import { AppIcon } from '../../components/AppIcon';
import { Input } from '../../components/Input';
import { GroupTypeSelector } from '../../components/GroupTypeSelector';
import { CurrencyPicker } from '../../components/CurrencyPicker';
import { AddMembersSheet } from '../../components/AddMembersSheet';
import { CreateGroupFormShell } from '../../components/groups/CreateGroupFormShell';
import { CreateGroupCoverPreview } from '../../components/groups/CreateGroupCoverPreview';
import { GroupMembersField } from '../../components/groups/GroupMembersField';
import { OnboardingStepCard } from '../../components/groups/OnboardingStepCard';
import { OnboardingCreateGroupHero } from '../../components/onboarding/OnboardingCreateGroupHero';
import { OnboardingNameSuggestions } from '../../components/onboarding/OnboardingNameSuggestions';
import { colors } from '../../theme';
import { useAppLanguage, useRtlLayout } from '../../hooks/useRtlLayout';
import { initialCreateGroupCurrency } from '../../lib/appDefaultCurrency';

type Props = {
    onDone: () => void;
    /** Admin preview — do not persist onboarding completion. */
    previewMode?: boolean;
};

type StepKey = 'name' | 'category' | 'currency' | 'image' | 'members';

export function OnboardingCreateGroupScreen({ onDone, previewMode = false }: Props) {
    const { t } = useTranslation();
    const { bottom: safeBottom } = useSafeAreaInsets();
    const isRtl = useRtlLayout();
    const appLanguage = useAppLanguage();
    const currentUser = useAppStore((s) => s.currentUser);
    const { isLoading, startLoading, stopLoading } = useLoading();

    const [name, setName] = useState('');
    const [nameError, setNameError] = useState('');
    const [groupType, setGroupType] = useState<GroupType>('trip');
    const [currency, setCurrency] = useState(() =>
        initialCreateGroupCurrency(appLanguage, currentUser),
    );
    const [localImageUri, setLocalImageUri] = useState<string | null>(null);
    const [members, setMembers] = useState<User[]>([]);
    const [addMembersOpen, setAddMembersOpen] = useState(false);
    const [openStep, setOpenStep] = useState<StepKey | null>('name');

    const toggleStep = useCallback((key: StepKey) => {
        setOpenStep((prev) => (prev === key ? null : key));
    }, []);

    const finish = useCallback(async () => {
        if (!previewMode) {
            await markPostLoginOnboardingComplete();
        }
        onDone();
    }, [onDone, previewMode]);

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

    const handleExit = useCallback(() => {
        if (previewMode) {
            onDone();
            return;
        }
        handleSkip();
    }, [previewMode, onDone, handleSkip]);

    const handleFindFriends = useCallback(() => {
        setAddMembersOpen(false);
        showInfoToast('onboarding.create.findFriendsAfterCreate');
    }, []);

    const pickImage = useCallback(async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            platformAlert(t('groups.imagePermissionTitle'), t('groups.imagePermissionMessage'));
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.85,
        });
        if (!result.canceled && result.assets[0]?.uri) {
            setLocalImageUri(result.assets[0].uri);
        }
    }, [t]);

    const handleCreate = useCallback(async () => {
        if (!name.trim()) {
            setNameError(t('groups.nameRequired'));
            setOpenStep('name');
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
                showAppToast({ type: 'error', titleKey: 'common.error' });
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
    }, [currency, finish, groupType, localImageUri, members, name, startLoading, stopLoading, t]);

    const displayMembers = currentUser ? [currentUser, ...members] : members;
    const hasName = name.trim().length > 0;
    const hasExtraMembers = members.length > 0;
    const hasImage = !!localImageUri;
    // Name is the only required field (category + currency have defaults), so it
    // is the single step we highlight until it's filled.
    const activeStep: StepKey | null = hasName ? null : 'name';
    const memberIdsForSheet = [
        ...(currentUser ? [currentUser.id] : []),
        ...members.map((m) => m.id),
    ];

    return (
        <>
            <CreateGroupFormShell
                testID="onboarding-create-group-screen"
                extraBottomInset={safeBottom}
                title={t('onboarding.create.header')}
                guidance={
                    <OnboardingCreateGroupHero
                        hasName={hasName}
                        hasImage={hasImage}
                        hasExtraMembers={hasExtraMembers}
                    />
                }
                headerStart={
                    <TouchableOpacity
                        onPress={handleExit}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        testID="onboarding-create-back"
                        accessibilityRole="button"
                    >
                        <View className="w-9 h-9 rounded-full bg-white border border-slate-200 items-center justify-center">
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
                        onPress={handleExit}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        testID="onboarding-create-skip"
                    >
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray500 }}>
                            {t(previewMode ? 'common.close' : 'onboarding.skip')}
                        </Text>
                    </TouchableOpacity>
                }
                footer={
                    <CreateGroupFloatingButton
                        title={t(hasName ? 'onboarding.create.submitReady' : 'onboarding.create.submit')}
                        onPress={() => void handleCreate()}
                        loading={isLoading}
                        disabled={isLoading || !name.trim()}
                        testID="onboarding-create-submit"
                    />
                }
            >
                <OnboardingStepCard
                    index={1}
                    title={t('onboarding.create.steps.name.title')}
                    helper={t('onboarding.create.steps.name.helper')}
                    summary={name.trim() || undefined}
                    complete={hasName}
                    active={activeStep === 'name'}
                    expanded={openStep === 'name'}
                    onToggle={() => toggleStep('name')}
                    testID="onboarding-step-name"
                >
                    <OnboardingNameSuggestions
                        visible={!hasName}
                        onSelect={(suggested) => {
                            setName(suggested);
                            if (nameError) setNameError('');
                        }}
                    />
                    <Input
                        placeholder={t('groups.createForm.namePlaceholder')}
                        value={name}
                        onChangeText={(text) => {
                            setName(text);
                            if (nameError) setNameError('');
                        }}
                        error={nameError}
                        containerClassName="mb-0"
                        testID="onboarding-step-name-input"
                    />
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={2}
                    title={t('onboarding.create.steps.category.title')}
                    helper={t('onboarding.create.steps.category.helper')}
                    summary={t(`groups.types.${groupType}`)}
                    complete={!!groupType}
                    expanded={openStep === 'category'}
                    onToggle={() => toggleStep('category')}
                    testID="onboarding-step-category"
                >
                    <GroupTypeSelector value={groupType} onChange={setGroupType} />
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={3}
                    title={t('onboarding.create.steps.currency.title')}
                    summary={currency}
                    complete={!!currency}
                    expanded={openStep === 'currency'}
                    onToggle={() => toggleStep('currency')}
                    testID="onboarding-step-currency"
                >
                    <CurrencyPicker value={currency} onChange={setCurrency} />
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={4}
                    title={t('onboarding.create.steps.image.title')}
                    optionalLabel={t('onboarding.create.steps.optional')}
                    summary={
                        localImageUri
                            ? t('onboarding.create.steps.image.summarySet')
                            : t('onboarding.create.steps.image.summaryDefault')
                    }
                    complete={!!localImageUri}
                    expanded={openStep === 'image'}
                    onToggle={() => toggleStep('image')}
                    testID="onboarding-step-image"
                >
                    <CreateGroupCoverPreview
                        name={name}
                        groupType={groupType}
                        localUri={localImageUri}
                        onPress={() => void pickImage()}
                        testID="onboarding-step-cover"
                    />
                    {localImageUri ? (
                        <TouchableOpacity
                            onPress={() => setLocalImageUri(null)}
                            className="self-start mt-1"
                            testID="onboarding-step-cover-remove"
                        >
                            <Text className="text-sm font-medium text-red-500">
                                {t('groups.removeImage')}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </OnboardingStepCard>

                <OnboardingStepCard
                    index={5}
                    title={t('onboarding.create.steps.members.title')}
                    helper={t('onboarding.create.membersHint')}
                    optionalLabel={t('onboarding.create.steps.optional')}
                    summary={
                        hasExtraMembers
                            ? `${members.length} ${t('onboarding.create.steps.members.summarySuffix')}`
                            : undefined
                    }
                    complete={hasExtraMembers}
                    expanded={openStep === 'members'}
                    onToggle={() => toggleStep('members')}
                    testID="onboarding-step-members"
                >
                    <GroupMembersField
                        displayMembers={displayMembers}
                        currentUserId={currentUser?.id ?? null}
                        currentUser={currentUser}
                        onAddMembers={() => setAddMembersOpen(true)}
                        onRemoveMember={(m) =>
                            setMembers((prev) => prev.filter((x) => x.id !== m.id))
                        }
                    />
                </OnboardingStepCard>
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
