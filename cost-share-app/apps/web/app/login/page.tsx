'use client';

import Image from 'next/image';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { APP_BRAND_TITLE, appBrandTitleStyle } from '@/lib/brand';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.42.07 2.4.8 3.22.8.82 0 2.34-.99 3.95-.84 1.03.07 2.64.44 3.6 1.77-3.3 2.02-2.78 6.4.23 7.94-.77 1.5-1.24 2.31-3 3.21zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export default function LoginPage() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const isLoading = googleLoading || appleLoading;

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <main style={styles.container}>
      <Image
        src="/icon.png"
        alt={APP_BRAND_TITLE}
        width={128}
        height={128}
        priority
        style={styles.logo}
      />
      <h1 style={appBrandTitleStyle}>{APP_BRAND_TITLE}</h1>
      <p style={styles.subtitle}>Split expenses with friends</p>

      <div style={styles.buttonStack}>
        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          style={{
            ...styles.authButton,
            ...styles.googleButton,
            ...(isLoading ? styles.disabled : {}),
          }}
        >
          <GoogleIcon />
          {googleLoading ? 'Redirecting...' : 'Continue with Google'}
        </button>

        <button
          onClick={handleAppleSignIn}
          disabled={isLoading}
          style={{
            ...styles.authButton,
            ...styles.appleButton,
            ...(isLoading ? styles.disabled : {}),
          }}
        >
          <AppleIcon />
          {appleLoading ? 'Redirecting...' : 'Continue with Apple'}
        </button>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '24px',
    backgroundColor: '#ffffff',
  },
  logo: {
    marginBottom: '16px',
  },
  subtitle: {
    fontSize: '1rem',
    color: '#6B7280',
    marginBottom: '48px',
    textAlign: 'center',
  },
  buttonStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    maxWidth: '320px',
  },
  authButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    height: '54px',
    width: '100%',
    borderRadius: '999px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '700',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
  googleButton: {
    backgroundColor: '#ffffff',
    border: '1px solid #E5E7EB',
    color: '#111827',
    boxShadow: '0 8px 20px rgba(59,130,246,0.12)',
  },
  appleButton: {
    backgroundColor: '#000000',
    color: '#ffffff',
  },
  disabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
};
