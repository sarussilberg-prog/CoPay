import '@testing-library/jest-native/extend-expect';

jest.mock('expo-crypto', () => {
    let mockCounter = 0;
    return {
        randomUUID: () => {
            mockCounter += 1;
            return `test-uuid-${mockCounter}-${Math.random().toString(36).slice(2, 10)}`;
        },
    };
});

jest.mock('expo-apple-authentication', () => ({
    // Host-component string (not a React component) so NativeWind's babel transform
    // doesn't inject an out-of-scope variable into this jest.mock factory.
    AppleAuthenticationButton: 'AppleAuthenticationButton',
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    signInAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => {
    class Directory {
        public uri: string;
        constructor(...parts: Array<string | { uri: string }>) {
            const joined = parts
                .map((p) => (typeof p === 'string' ? p : p.uri))
                .join('/')
                .replace(/\/+/g, '/');
            this.uri = joined;
        }
        create() {
            return;
        }
        delete() {
            return;
        }
    }
    class File {
        public uri: string;
        constructor(...parts: Array<string | { uri: string }>) {
            const joined = parts
                .map((p) => (typeof p === 'string' ? p : p.uri))
                .join('/')
                .replace(/\/+/g, '/');
            this.uri = joined;
        }
        static async downloadFileAsync(
            _url: string,
            dest: { uri: string },
        ): Promise<File> {
            return new File(dest.uri);
        }
        delete() {
            return;
        }
    }
    return {
        Directory,
        File,
        Paths: {
            document: new Directory('/test/docs/'),
            cache: new Directory('/test/cache/'),
        },
    };
});

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
        functions: {
            invoke: jest.fn().mockResolvedValue({ data: null, error: null }),
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

// Mock Sentry: ships as ESM (`export ... from '@sentry/core'`) which Jest can't parse,
// and we don't want test runs hitting the SDK or its native modules anyway.
jest.mock('@sentry/react-native', () => ({
    __esModule: true,
    init: jest.fn(),
    wrap: <T>(component: T) => component,
    setUser: jest.fn(),
    setTag: jest.fn(),
    setTags: jest.fn(),
    setContext: jest.fn(),
    setExtra: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
    reactNavigationIntegration: () => ({
        registerNavigationContainer: jest.fn(),
    }),
}));

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
