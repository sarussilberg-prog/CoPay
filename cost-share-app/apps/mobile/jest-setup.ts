import '@testing-library/jest-native/extend-expect';

jest.mock('./lib/supabase', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({ data: [], error: null }),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
        rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
        auth: {
            getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
            getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
            signOut: jest.fn().mockResolvedValue({ error: null }),
        },
    },
}));

// Mock react-i18next: provide a t() that returns the key so assertions can use keys.
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: {
            language: 'en',
            changeLanguage: jest.fn(),
            dir: () => 'ltr',
        },
    }),
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    Trans: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock @react-navigation/native hooks used inside screens.
jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({
            navigate: jest.fn(),
            goBack: jest.fn(),
            push: jest.fn(),
            replace: jest.fn(),
            reset: jest.fn(),
            setOptions: jest.fn(),
            addListener: jest.fn(() => jest.fn()),
        }),
        useRoute: () => ({
            params: {},
            key: 'test',
            name: 'test',
        }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock toast
jest.mock('react-native-toast-message', () => ({
    __esModule: true,
    default: {
        show: jest.fn(),
        hide: jest.fn(),
    },
}));

// Provide safe-area insets without needing a SafeAreaProvider wrapper.
jest.mock('react-native-safe-area-context', () => {
    const actual = jest.requireActual('react-native-safe-area-context');
    return {
        ...actual,
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
        useSafeAreaFrame: () => ({ x: 0, y: 0, width: 320, height: 640 }),
    };
});

// Mock native Google Sign-In: it touches TurboModule at import time.
jest.mock('@react-native-google-signin/google-signin', () => ({
    GoogleSignin: {
        configure: jest.fn(),
        hasPlayServices: jest.fn().mockResolvedValue(true),
        signIn: jest.fn().mockResolvedValue({ type: 'cancelled' }),
        signOut: jest.fn().mockResolvedValue(undefined),
    },
    isErrorWithCode: () => false,
    statusCodes: {
        SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
        IN_PROGRESS: 'IN_PROGRESS',
        PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    },
}));

// Silence the React Native logging during tests.
jest.spyOn(console, 'warn').mockImplementation(() => { });
