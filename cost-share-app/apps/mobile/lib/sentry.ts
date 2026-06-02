import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: false,
});

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? 'development',
  sendDefaultPii: false,
  sampleRate: 1.0,
  tracesSampleRate: 0.2,
  attachStacktrace: true,
  integrations: [navigationIntegration],
});
