import React, { useEffect, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../AppText';
import {
  cancelGoogleSignInSheet,
  completeGoogleSignInSheet,
  getGoogleSignInSheetSession,
  subscribeGoogleSignInSheet,
} from '../../lib/googleSignInSheet';
import { colors } from '../../theme';

const SHEET_HEIGHT_RATIO = 0.8;

export function GoogleSignInSheetHost() {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.round(height * SHEET_HEIGHT_RATIO);

  const session = useSyncExternalStore(
    subscribeGoogleSignInSheet,
    getGoogleSignInSheetSession,
    getGoogleSignInSheetSession,
  );

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    void (async () => {
      const result = await session.run();
      if (!cancelled) {
        completeGoogleSignInSheet(result);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (Platform.OS !== 'android' || !session) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={cancelGoogleSignInSheet}
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(15,23,42,0.55)' }}>
        <Pressable
          testID="google-sign-in-sheet-scrim"
          onPress={cancelGoogleSignInSheet}
          className="absolute inset-0"
        />
        <View
          testID="google-sign-in-sheet"
          style={{
            height: sheetHeight,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
            elevation: 24,
          }}
          className="bg-white rounded-t-3xl overflow-hidden"
        >
          <View className="items-center pt-2">
            <View className="w-10 h-1 rounded-full bg-gray-200" />
          </View>
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-soft">
            <Pressable onPress={cancelGoogleSignInSheet} hitSlop={8}>
              <Text className="text-[15px] font-medium text-gray-600">
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Text
              className="text-xs font-semibold text-gray-500 uppercase"
              style={{ letterSpacing: 0.72 }}
            >
              {t('auth.googleSignInSheetTitle')}
            </Text>
            <View style={{ width: 48 }} />
          </View>
          <View className="flex-1 items-center justify-center px-8">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-base text-gray-600 text-center mt-6">
              {t('auth.googleSignInSheetHint')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
