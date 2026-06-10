/**
 * AddExpenseScreen (v2)
 * Sheet-style create/edit expense flow. Amount uses the system numeric keyboard,
 * description uses the regular keyboard. The combined payer/split button opens
 * an editor sheet. Presented as a modal (see AppNavigator) — header is hidden.
 */

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Animated,
    Image,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { platformAlert } from '../../lib/platformAlert';
import { LinearGradient } from 'expo-linear-gradient';

import { Text } from '../../components/AppText';
import { Button } from '../../components/Button';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { CurrencyPicker } from '../../components/CurrencyPicker';

import { CurrencyPill } from '../../components/expenseV2/CurrencyPill';
import { QuietIconPill } from '../../components/expenseV2/QuietIconPill';
import { CombinedPayerSplitButton } from '../../components/expenseV2/CombinedPayerSplitButton';
import {
    EditPayerSplitSheet,
    EditPayerSplitDraft,
    UiSplitMode,
} from '../../components/expenseV2/EditPayerSplitSheet';
import { SplitBreakdownAccordion } from '../../components/expenseV2/SplitBreakdownAccordion';
import { DatePickerPopup } from '../../components/expenseV2/DatePickerPopup';

/**
 * Keep only digits and a single decimal separator (`.` or `,` → `.`),
 * trim to two decimal places.
 */
function sanitizeAmountInput(text: string): string {
    const normalized = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const firstDot = normalized.indexOf('.');
    if (firstDot === -1) return normalized;
    const whole = normalized.slice(0, firstDot);
    const frac = normalized.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
    return `${whole}.${frac}`;
}

import { useLoading } from '../../hooks/useLoading';
import { useAppStore } from '../../store';
import { useGroupUsersQuery } from '../../hooks/queries/useGroupUsersQuery';
import { useGroupMembersQuery } from '../../hooks/queries/useGroupMembersQuery';
import { useGroupsQuery } from '../../hooks/queries/useGroupsQuery';
import {
    cancelPendingAddExpense,
    chainEditFollowUp,
    getPendingExpenseFromCache,
    resolvePendingEditAction,
    useAddExpenseMutation,
} from '../../hooks/mutations/useAddExpenseMutation';
import { isPendingExpenseId } from '../../lib/pendingExpense';
import { useQueryClient } from '@tanstack/react-query';
import {
    createExpense,
    getExpenseWithSplits,
    updateExpense,
} from '../../services/expenses.service';
import { uploadExpenseReceipt } from '../../services/storage.service';
import { handleError } from '../../lib/handleError';
import { resolveGroupMemberUsers } from '../../lib/groupMemberUsers';
import { getAvatarUrl, getDisplayName } from '../../lib/userDisplay';
import {
    DEFAULT_CURRENCY,
    ExpenseCategory,
    ExpenseSplitInput,
} from '@cost-share/shared';
import {
    UnequalSplitMode,
    areSplitsEqual,
    buildUnequalSplits,
    buildUnequalValuesFromStored,
    computeUnequalTotal,
    inferUnequalModeFromSplits,
    storedSplitModeToUi,
    uiToStoredSplitMode,
} from '../../lib/expenseSplitForm';
import { colors } from '../../theme';

function uiToUnequalMode(mode: UiSplitMode): UnequalSplitMode {
    return mode === 'percent' ? 'percent' : 'amount';
}

function unequalToUiMode(mode: UnequalSplitMode): UiSplitMode {
    return mode === 'percent' ? 'percent' : 'exact';
}

function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function formatShortDate(date: Date): string {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Stable string representation of the form's edit-relevant state, used to detect
 * whether anything has changed since the expense was loaded in edit mode.
 */
function snapshotKey(s: {
    description: string;
    amount: string;
    currency: string;
    paidBy: string | undefined;
    dateMs: number;
    splitMode: UiSplitMode;
    selectedMemberIds: string[];
    unequalValues: Record<string, string>;
}): string {
    const ids = [...s.selectedMemberIds].sort();
    const uneq: Record<string, string> = {};
    Object.keys(s.unequalValues).sort().forEach(k => {
        uneq[k] = s.unequalValues[k];
    });
    return JSON.stringify({
        d: s.description,
        a: s.amount,
        c: s.currency,
        p: s.paidBy ?? '',
        t: s.dateMs,
        m: s.splitMode,
        ids,
        u: uneq,
    });
}

export function AddExpenseScreen() {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const insets = useSafeAreaInsets();
    const routeParams = route.params ?? {};
    const expenseId: string | undefined = routeParams.expenseId;
    const isEditMode = Boolean(expenseId);
    const routeGroupId = routeParams.groupId as string | undefined;
    const [resolvedGroupId, setResolvedGroupId] = useState<string | undefined>(routeGroupId);
    const groupId = resolvedGroupId ?? '';
    const { isLoading, startLoading, stopLoading } = useLoading();
    const currentUser = useAppStore(state => state.currentUser);
    const groupsQuery = useGroupsQuery();
    const storeGroup = groupId
        ? groupsQuery.data?.find(g => g.id === groupId)
        : undefined;
    const queryClient = useQueryClient();
    const addExpense = useAddExpenseMutation(groupId);

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<string>(
        storeGroup?.defaultCurrency ?? DEFAULT_CURRENCY,
    );
    // Category not exposed in v2 UI; defaults to 'other'.
    const [category] = useState<ExpenseCategory>('other');
    const [paidBy, setPaidBy] = useState<string | undefined>(currentUser?.id);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [splitMode, setSplitMode] = useState<UiSplitMode>('equal');
    const [unequalValues, setUnequalValues] = useState<Record<string, string>>({});
    const [membersInitialized, setMembersInitialized] = useState(false);
    const [expenseLoading, setExpenseLoading] = useState(isEditMode);
    const [localReceiptUri, setLocalReceiptUri] = useState<string | null>(null);
    const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
    const [receiptRemoved, setReceiptRemoved] = useState(false);
    const [date, setDate] = useState<Date>(new Date());
    const [editorVisible, setEditorVisible] = useState(false);
    const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
    const [datePickerVisible, setDatePickerVisible] = useState(false);
    const amountShake = useRef(new Animated.Value(0)).current;
    const descriptionShake = useRef(new Animated.Value(0)).current;
    const editSnapshotRef = useRef<string>('');

    const { data: membersData = [], isLoading: membersLoading } = useGroupMembersQuery(groupId);
    const { data: allUsers = [] } = useGroupUsersQuery(groupId);
    const activeMembers = useMemo(
        () => membersData.filter(m => m.isActive),
        [membersData],
    );
    const memberUsers = useMemo(
        () => {
            const resolved = resolveGroupMemberUsers(
                activeMembers,
                allUsers,
                storeGroup?.members ?? [],
                currency,
            );
            return resolved.filter(u => {
                if (u.isActive !== false) return true;
                if (isEditMode && selectedMemberIds.includes(u.id)) return true;
                return false;
            });
        },
        [activeMembers, allUsers, storeGroup?.members, currency, isEditMode, selectedMemberIds],
    );

    useLayoutEffect(() => {
        navigation.setOptions({ headerShown: false });
    }, [navigation]);

    useEffect(() => {
        if (!isEditMode && storeGroup?.defaultCurrency) {
            setCurrency(storeGroup.defaultCurrency);
        }
    }, [storeGroup?.defaultCurrency, isEditMode]);

    // Create mode: select all active members by default.
    useEffect(() => {
        if (isEditMode || membersInitialized || activeMembers.length === 0 || allUsers.length === 0) return;
        const activeUserIds = memberUsers.map(u => u.id);
        setSelectedMemberIds(activeUserIds);
        setMembersInitialized(true);
    }, [isEditMode, membersInitialized, activeMembers, allUsers, memberUsers]);

    // Create mode: default payer to current user.
    useEffect(() => {
        if (isEditMode) return;
        if (!paidBy && currentUser?.id) setPaidBy(currentUser.id);
    }, [isEditMode, paidBy, currentUser?.id]);

    // Edit mode: load the existing expense and prefill the form.
    useEffect(() => {
        if (!isEditMode || !expenseId) return;
        const load = async () => {
            setExpenseLoading(true);
            // Pending row — hydrate from the optimistic cache, no network.
            if (isPendingExpenseId(expenseId)) {
                const activeGroupId = routeGroupId ?? groupId;
                if (activeGroupId) {
                    const cached = getPendingExpenseFromCache(
                        queryClient,
                        activeGroupId,
                        expenseId,
                    );
                    if (cached) {
                        setResolvedGroupId(activeGroupId);
                        setDescription(cached.description);
                        setAmount(String(cached.amount));
                        setCurrency(cached.currency);
                        setPaidBy(cached.paidBy);
                        const initialDate =
                            cached.expenseDate instanceof Date
                                ? cached.expenseDate
                                : new Date(cached.expenseDate);
                        setDate(initialDate);
                        if (cached.splits.length > 0) {
                            const initialMemberIds = cached.splits.map((s) => s.userId);
                            setSelectedMemberIds(initialMemberIds);
                            setMembersInitialized(true);
                            const initialSplitMode = cached.splitMode
                                ? storedSplitModeToUi(cached.splitMode)
                                : ('equal' as UiSplitMode);
                            setSplitMode(initialSplitMode);
                        }
                        editSnapshotRef.current = snapshotKey({
                            description: cached.description,
                            amount: String(cached.amount),
                            currency: cached.currency,
                            paidBy: cached.paidBy,
                            dateMs: initialDate.getTime(),
                            splitMode: cached.splitMode
                                ? storedSplitModeToUi(cached.splitMode)
                                : ('equal' as UiSplitMode),
                            selectedMemberIds: cached.splits.map((s) => s.userId),
                            unequalValues: {},
                        });
                    }
                }
                setExpenseLoading(false);
                return;
            }
            const data = await getExpenseWithSplits(expenseId);
            if (data) {
                const activeGroupId = routeGroupId ?? data.expense.groupId;
                setResolvedGroupId(activeGroupId);
                const { expense, splits } = data;
                setDescription(expense.description);
                setAmount(String(expense.amount));
                setCurrency(expense.currency);
                setPaidBy(expense.paidBy);
                setReceiptUrl(expense.receiptUrl ?? null);
                setLocalReceiptUri(null);
                setReceiptRemoved(false);
                const initialDate =
                    expense.expenseDate instanceof Date ? expense.expenseDate : new Date();
                if (expense.expenseDate instanceof Date) setDate(expense.expenseDate);

                let initialSplitMode: UiSplitMode = 'equal';
                let initialUnequalValues: Record<string, string> = {};
                let initialMemberIds: string[] = [];
                if (splits.length > 0) {
                    initialMemberIds = splits.map(s => s.userId);
                    setSelectedMemberIds(initialMemberIds);
                    setMembersInitialized(true);
                    if (expense.splitMode) {
                        initialSplitMode = storedSplitModeToUi(expense.splitMode);
                        if (initialSplitMode !== 'equal') {
                            initialUnequalValues = buildUnequalValuesFromStored(
                                uiToUnequalMode(initialSplitMode),
                                splits,
                                expense.amount,
                            );
                        }
                    } else {
                        // Transitional fallback for rows persisted before the
                        // 2026-05-26 split_mode migration. Remove once both DBs
                        // have migrated.
                        console.warn(
                            '[AddExpenseScreen] expense.splitMode missing — inferring from splits',
                        );
                        const splitAmounts = splits.map(s => s.amount);
                        if (areSplitsEqual(splitAmounts)) {
                            initialSplitMode = 'equal';
                        } else {
                            const inferred = inferUnequalModeFromSplits(splits, expense.amount);
                            initialSplitMode = unequalToUiMode(inferred.mode);
                            initialUnequalValues = inferred.values;
                        }
                    }
                    setSplitMode(initialSplitMode);
                    if (initialSplitMode !== 'equal') {
                        setUnequalValues(initialUnequalValues);
                    }
                }

                editSnapshotRef.current = snapshotKey({
                    description: expense.description,
                    amount: String(expense.amount),
                    currency: expense.currency,
                    paidBy: expense.paidBy,
                    dateMs: initialDate.getTime(),
                    splitMode: initialSplitMode,
                    selectedMemberIds: initialMemberIds,
                    unequalValues: initialUnequalValues,
                });
            }
            setExpenseLoading(false);
        };
        void load();
    }, [expenseId, isEditMode, routeGroupId]);

    useEffect(() => {
        if (!isEditMode || membersInitialized || activeMembers.length === 0) return;
        if (selectedMemberIds.length === 0) {
            setSelectedMemberIds(activeMembers.map(m => m.userId));
        }
        setMembersInitialized(true);
    }, [isEditMode, membersInitialized, activeMembers, selectedMemberIds.length]);

    const parsedAmount = Number.parseFloat(amount);

    const unequalCheck = useMemo(() => {
        if (splitMode === 'equal' || selectedMemberIds.length === 0) {
            return { isValid: true } as const;
        }
        return computeUnequalTotal(
            uiToUnequalMode(splitMode),
            unequalValues,
            selectedMemberIds,
            parsedAmount,
        );
    }, [splitMode, selectedMemberIds, unequalValues, parsedAmount]);

    const hasDescription = description.trim().length > 0;
    const hasValidAmount =
        amount.length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0;
    const canSave = useMemo(() => {
        const hasMembers = selectedMemberIds.length > 0;
        const unequalReady = splitMode === 'equal' || unequalCheck.isValid;
        return hasDescription && hasValidAmount && hasMembers && unequalReady;
    }, [hasDescription, hasValidAmount, selectedMemberIds.length, splitMode, unequalCheck.isValid]);

    const editChanged = useMemo(() => {
        if (!isEditMode) return true;
        if (editSnapshotRef.current === '') return false;
        const current = snapshotKey({
            description,
            amount,
            currency,
            paidBy,
            dateMs: date.getTime(),
            splitMode,
            selectedMemberIds,
            unequalValues,
        });
        if (current !== editSnapshotRef.current) return true;
        if (localReceiptUri !== null) return true;
        if (receiptRemoved) return true;
        return false;
    }, [
        isEditMode,
        description,
        amount,
        currency,
        paidBy,
        date,
        splitMode,
        selectedMemberIds,
        unequalValues,
        localReceiptUri,
        receiptRemoved,
    ]);

    const canSubmit = canSave && editChanged;

    const buildSplits = useCallback((): ExpenseSplitInput[] | null => {
        if (selectedMemberIds.length === 0) return null;
        if (splitMode === 'equal') return selectedMemberIds.map(userId => ({ userId }));
        return buildUnequalSplits(
            uiToUnequalMode(splitMode),
            unequalValues,
            selectedMemberIds,
            parsedAmount,
        );
    }, [selectedMemberIds, splitMode, unequalValues, parsedAmount]);

    const handleReceiptPress = useCallback(() => {
        const takePhoto = async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
                platformAlert(
                    t('expenses.receiptPermissionTitle'),
                    t('expenses.receiptCameraPermissionMessage'),
                );
                return;
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.4,
            });
            if (!result.canceled && result.assets[0]?.uri) {
                setLocalReceiptUri(result.assets[0].uri);
                setReceiptRemoved(false);
            }
        };
        const pickFromLibrary = async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                platformAlert(
                    t('expenses.receiptPermissionTitle'),
                    t('expenses.receiptLibraryPermissionMessage'),
                );
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.4,
            });
            if (!result.canceled && result.assets[0]?.uri) {
                setLocalReceiptUri(result.assets[0].uri);
                setReceiptRemoved(false);
            }
        };
        const removeReceipt = () => {
            setLocalReceiptUri(null);
            setReceiptUrl(null);
            setReceiptRemoved(true);
        };
        const hasReceipt = Boolean(localReceiptUri || (receiptUrl && !receiptRemoved));
        const buttons: Parameters<typeof platformAlert>[2] = [
            { text: t('expenses.takePhoto'), onPress: takePhoto },
            { text: t('expenses.chooseFromLibrary'), onPress: pickFromLibrary },
        ];
        if (hasReceipt) buttons.push({ text: t('expenses.removeReceipt'), onPress: removeReceipt, style: 'destructive' });
        buttons.push({ text: t('common.cancel'), style: 'cancel' });
        platformAlert(t('expenses.receipt'), undefined, buttons, { cancelable: true });
    }, [t, localReceiptUri, receiptUrl, receiptRemoved]);

    const handleEditorDone = useCallback((draft: EditPayerSplitDraft) => {
        setPaidBy(draft.payerId);
        setSplitMode(draft.splitMode);
        setSelectedMemberIds(draft.selectedMemberIds);
        setUnequalValues(draft.unequalValues);
        setEditorVisible(false);
    }, []);

    const handleSubmit = useCallback(async () => {
        if (!canSave || !currentUser || !groupId) return;
        const splits = buildSplits();
        if (!splits) return;
        const payerId = paidBy ?? currentUser.id;
        startLoading();
        let uploadedReceiptUrl: string | undefined;
        if (localReceiptUri) {
            const uploaded = await uploadExpenseReceipt(groupId, localReceiptUri);
            if (!uploaded) {
                stopLoading();
                handleError(new Error('uploadExpenseReceipt returned null'), {
                    toast: { titleKey: 'common.error', messageKey: 'expenses.receiptUploadError' },
                    tags: { service: 'storage', op: 'uploadExpenseReceipt' },
                    extra: { groupId, isEditMode },
                });
                return;
            }
            uploadedReceiptUrl = uploaded;
        }
        const receiptUpdate: { receiptUrl?: string } = uploadedReceiptUrl
            ? { receiptUrl: uploadedReceiptUrl }
            : receiptRemoved
                ? { receiptUrl: '' }
                : {};
        const storedSplitMode = uiToStoredSplitMode(splitMode);

        if (!isEditMode) {
            // Offline-capable add via the mutation hook. Optimistic insert
            // happens synchronously inside onMutate; queued while offline.
            addExpense.mutate({
                description: description.trim(),
                amount: parsedAmount,
                currency,
                category,
                paidBy: payerId,
                expenseDate: date,
                splits,
                splitMode: storedSplitMode,
                ...(uploadedReceiptUrl ? { receiptUrl: uploadedReceiptUrl } : {}),
            });
            stopLoading();
            navigation.goBack();
            return;
        }

        if (expenseId && isPendingExpenseId(expenseId)) {
            // Editing a row whose create hasn't synced yet — branch on state.
            const payload = {
                description: description.trim(),
                amount: parsedAmount,
                currency,
                category,
                paidBy: payerId,
                expenseDate: date,
                splits,
                splitMode: storedSplitMode,
                ...receiptUpdate,
            };
            const action = resolvePendingEditAction(queryClient, expenseId);
            if (action === 'chain-follow-up') {
                chainEditFollowUp(queryClient, groupId, expenseId, payload);
            } else {
                cancelPendingAddExpense(queryClient, groupId, expenseId);
                addExpense.mutate({
                    description: payload.description,
                    amount: payload.amount,
                    currency: payload.currency,
                    category: payload.category,
                    paidBy: payload.paidBy,
                    expenseDate: payload.expenseDate,
                    splits: payload.splits,
                    splitMode: payload.splitMode,
                    ...(uploadedReceiptUrl ? { receiptUrl: uploadedReceiptUrl } : {}),
                });
            }
            stopLoading();
            navigation.goBack();
            return;
        }

        const result = expenseId
            ? await updateExpense(expenseId, {
                  description: description.trim(),
                  amount: parsedAmount,
                  currency,
                  category,
                  paidBy: payerId,
                  expenseDate: date,
                  splits,
                  splitMode: storedSplitMode,
                  ...receiptUpdate,
              })
            : null;
        stopLoading();
        if (result) {
            navigation.goBack();
        }
    }, [
        canSave,
        currentUser,
        groupId,
        buildSplits,
        paidBy,
        localReceiptUri,
        receiptRemoved,
        isEditMode,
        expenseId,
        description,
        parsedAmount,
        currency,
        category,
        date,
        splitMode,
        navigation,
        startLoading,
        stopLoading,
        t,
        addExpense,
        queryClient,
    ]);

    const runShake = useCallback((anim: Animated.Value) => {
        anim.setValue(0);
        Animated.sequence([
            Animated.timing(anim, { toValue: -8, duration: 50, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 8, duration: 50, useNativeDriver: true }),
            Animated.timing(anim, { toValue: -6, duration: 50, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 6, duration: 50, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleSavePress = useCallback(() => {
        if (isLoading) return;
        if (!canSave) {
            if (!hasValidAmount) runShake(amountShake);
            if (!hasDescription) runShake(descriptionShake);
            return;
        }
        if (!editChanged) return;
        void handleSubmit();
    }, [
        isLoading,
        canSave,
        editChanged,
        hasValidAmount,
        hasDescription,
        runShake,
        amountShake,
        descriptionShake,
        handleSubmit,
    ]);

    if (isEditMode && expenseLoading) {
        return (
            <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
                <LoadingIndicator />
            </SafeAreaView>
        );
    }

    const payerUser = memberUsers.find(u => u.id === paidBy) ?? null;
    const splitUsers = memberUsers.filter(u => selectedMemberIds.includes(u.id));
    const payerForButton = payerUser
        ? {
              id: payerUser.id,
              name: payerUser.id === currentUser?.id ? t('common.you') : getDisplayName(payerUser, t),
              avatarUrl: getAvatarUrl(payerUser) ?? undefined,
          }
        : null;
    const splitMembersForButton = splitUsers.map(u => ({
        id: u.id,
        name: u.id === currentUser?.id ? t('common.you') : getDisplayName(u, t),
        avatarUrl: getAvatarUrl(u) ?? undefined,
    }));
    const splitLabel = t(`expenses.v2.summary.${splitMode}`);

    const hasReceipt = Boolean(localReceiptUri || (receiptUrl && !receiptRemoved));
    const receiptLabel = hasReceipt
        ? localReceiptUri
            ? t('expenses.v2.receipt')
            : t('expenses.v2.receipt')
        : t('expenses.v2.receipt');
    const dateLabel = isSameDay(date, new Date())
        ? t('expenses.v2.today')
        : formatShortDate(date);
    const headerTitle = isEditMode ? t('expenses.v2.headerEdit') : t('expenses.v2.headerNew');

    const editorInitial: EditPayerSplitDraft = {
        payerId: paidBy ?? currentUser?.id ?? '',
        splitMode,
        selectedMemberIds,
        unequalValues,
    };

    return (
        <SafeAreaView edges={['top']} style={styles.root}>
            <View style={styles.dismissArea}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.7}
                    style={styles.headerSide}
                    testID="add-expense-cancel"
                >
                    <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{headerTitle}</Text>
                <TouchableOpacity
                    onPress={handleSavePress}
                    activeOpacity={0.7}
                    style={styles.headerSide}
                    testID="add-expense-submit"
                    accessibilityState={{ disabled: !canSubmit || isLoading }}
                >
                    <Text style={[styles.saveText, !canSubmit || isLoading ? styles.saveTextDisabled : null]}>
                        {t('common.save')}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Hero */}
            <ScrollView
                style={styles.hero}
                contentContainerStyle={[
                    styles.heroContent,
                    { paddingBottom: 140 + insets.bottom },
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.heroTop}>
                    <CurrencyPill
                        currency={currency}
                        onPress={() => setCurrencyPickerVisible(true)}
                    />
                    <View style={{ height: 24 }} />
                    <Animated.View style={{ transform: [{ translateX: amountShake }] }}>
                        <TextInput
                            value={amount}
                            onChangeText={text => setAmount(sanitizeAmountInput(text))}
                            keyboardType="decimal-pad"
                            inputMode="decimal"
                            placeholder="0.00"
                            placeholderTextColor={colors.gray300}
                            style={styles.amountInput}
                            testID="amount-display"
                        />
                    </Animated.View>
                    <Animated.View
                        style={{
                            alignItems: 'center',
                            transform: [{ translateX: descriptionShake }],
                        }}
                    >
                        <TextInput
                            value={description}
                            onChangeText={setDescription}
                            placeholder={t('expenses.v2.descriptionPlaceholder')}
                            placeholderTextColor={colors.gray300}
                            style={styles.descriptionInput}
                            textAlign="center"
                            testID="description-input"
                            returnKeyType="done"
                        />
                        <View style={styles.descriptionUnderline} />
                    </Animated.View>
                </View>

                <View style={{ marginTop: 22 }}>
                    {memberUsers.length > 0 ? (
                        <>
                            <CombinedPayerSplitButton
                                payer={payerForButton}
                                splitMembers={splitMembersForButton}
                                splitModeLabel={splitLabel}
                                onPress={() => setEditorVisible(true)}
                                payerEyebrow={t('expenses.v2.paidByEyebrow')}
                            />
                            {splitMode !== 'equal' &&
                            selectedMemberIds.length > 0 &&
                            hasValidAmount &&
                            !unequalCheck.isValid ? (
                                <Text style={styles.splitErrorText} testID="split-mismatch-error">
                                    {splitMode === 'percent'
                                        ? t(
                                              unequalCheck.difference > 0
                                                  ? 'expenses.v2.errors.percentUnder'
                                                  : 'expenses.v2.errors.percentOver',
                                              {
                                                  value: String(
                                                      parseFloat(
                                                          Math.abs(unequalCheck.difference).toFixed(2),
                                                      ),
                                                  ),
                                              },
                                          )
                                        : t(
                                              unequalCheck.difference > 0
                                                  ? 'expenses.v2.errors.amountUnder'
                                                  : 'expenses.v2.errors.amountOver',
                                              {
                                                  currency,
                                                  value: Math.abs(unequalCheck.difference).toFixed(2),
                                                  total: parsedAmount.toFixed(2),
                                              },
                                          )}
                                </Text>
                            ) : null}
                            <SplitBreakdownAccordion
                                members={splitMembersForButton}
                                currency={currency}
                                totalAmount={Number.isFinite(parsedAmount) ? parsedAmount : 0}
                                splitMode={splitMode}
                                unequalValues={unequalValues}
                                payerId={paidBy}
                                paidLabel={t('groups.expense.paidBadge')}
                            />
                        </>
                    ) : membersLoading ? (
                        <LoadingIndicator />
                    ) : null}
                </View>

            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)']}
                    locations={[0, 0.55]}
                    style={StyleSheet.absoluteFill}
                />
                <View style={[styles.bottomSaveRow, !canSubmit && { opacity: 0.55 }]}>
                    <Button
                        title={t('common.save')}
                        onPress={handleSavePress}
                        variant="secondary"
                        loading={isLoading}
                        fullWidth={false}
                        testID="add-expense-submit-bottom"
                    />
                </View>

                <View style={styles.metaRow}>
                    <QuietIconPill
                        icon="calendar-outline"
                        label={dateLabel}
                        active
                        onPress={() => setDatePickerVisible(true)}
                        testID="meta-date"
                    />
                    <QuietIconPill
                        icon="camera-outline"
                        label={receiptLabel}
                        active={hasReceipt}
                        onPress={handleReceiptPress}
                        testID="meta-receipt"
                    />
                    {hasReceipt && (localReceiptUri || receiptUrl) ? (
                        <ReceiptThumbnail
                            uri={localReceiptUri ?? receiptUrl ?? null}
                            onPress={handleReceiptPress}
                        />
                    ) : null}
                </View>
            </View>
            </View>

            {/* Editor sheet */}
            <EditPayerSplitSheet
                visible={editorVisible}
                members={memberUsers}
                currentUserId={currentUser?.id}
                currency={currency}
                totalAmount={Number.isFinite(parsedAmount) ? parsedAmount : 0}
                initial={editorInitial}
                onCancel={() => setEditorVisible(false)}
                onDone={handleEditorDone}
            />

            {/* Currency picker (controlled — keep existing modal UI) */}
            <CurrencyPicker
                value={currency}
                onChange={setCurrency}
                visible={currencyPickerVisible}
                onClose={() => setCurrencyPickerVisible(false)}
            />

            <DatePickerPopup
                visible={datePickerVisible}
                initialDate={date}
                onCancel={() => setDatePickerVisible(false)}
                onConfirm={next => {
                    setDate(next);
                    setDatePickerVisible(false);
                }}
            />

            {isLoading ? (
                <View style={styles.loadingOverlay} pointerEvents="auto" testID="save-loading-overlay">
                    <ActivityIndicator size="large" color={colors.primaryDark} />
                </View>
            ) : null}
        </SafeAreaView>
    );
}

/** Small circular receipt thumbnail rendered next to the Receipt pill. Tap to re-open the picker. */
const RECEIPT_THUMB_SIZE = 32;
function ReceiptThumbnail({ uri, onPress }: { uri: string | null; onPress: () => void }) {
    if (!uri) return null;
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            testID="receipt-thumbnail"
            style={{
                width: RECEIPT_THUMB_SIZE,
                height: RECEIPT_THUMB_SIZE,
                borderRadius: RECEIPT_THUMB_SIZE / 2,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                backgroundColor: '#FFFFFF',
                overflow: 'hidden',
            }}
        >
            <Image
                source={{ uri }}
                resizeMode="cover"
                style={{ width: RECEIPT_THUMB_SIZE, height: RECEIPT_THUMB_SIZE }}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    dismissArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingTop: 4,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    headerSide: {
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    headerTitle: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.72,
        textTransform: 'uppercase',
        color: colors.text.secondary,
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.gray600,
    },
    saveText: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.primaryDark,
    },
    saveTextDisabled: {
        color: colors.gray400,
    },
    hero: {
        flex: 1,
    },
    heroContent: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 140,
    },
    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingTop: 20,
        backgroundColor: 'transparent',
    },
    heroTop: {
        alignItems: 'center',
    },
    amountInput: {
        fontSize: 64,
        fontWeight: '700',
        color: colors.text.primary,
        letterSpacing: -1.9,
        lineHeight: 78,
        textAlign: 'center',
        padding: 0,
        marginVertical: 0,
        paddingTop: 8,
        fontVariant: ['tabular-nums'],
        minWidth: 120,
    },
    descriptionInput: {
        marginTop: 12,
        fontSize: 17,
        fontWeight: '500',
        color: colors.text.primary,
        textAlign: 'center',
        paddingHorizontal: 16,
        paddingVertical: 0,
        minWidth: 200,
    },
    descriptionUnderline: {
        marginTop: 4,
        width: 56,
        height: 2,
        borderRadius: 9999,
        backgroundColor: colors.primaryLight,
    },
    bottomSaveRow: {
        alignItems: 'center',
        marginBottom: 4,
    },
    splitErrorText: {
        marginTop: 8,
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '500',
        color: colors.error,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        paddingTop: 16,
        marginBottom: 8,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
