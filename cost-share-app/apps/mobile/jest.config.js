/** @type {import('jest').Config} */
module.exports = {
    preset: 'jest-expo',
    setupFiles: ['<rootDir>/jest-setup-globals.js'],
    setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|@react-native-async-storage|superjson|copy-anything|is-what))',
    ],
    moduleNameMapper: {
        '^@cost-share/shared$': '<rootDir>/../../packages/shared/src',
        '^@cost-share/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    },
    // Preflight runs tsc + shared build first; cold screen imports can exceed 5s on first test per file.
    testTimeout: 15000,
    testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/__tests__/helpers/'],
    collectCoverageFrom: [
        'components/**/*.{ts,tsx}',
        'screens/**/*.{ts,tsx}',
        'store/**/*.{ts,tsx}',
        '!**/*.d.ts',
    ],
};
