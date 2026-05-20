'use client';

import Image from 'next/image';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { APP_BRAND_TITLE, appBrandTitleStyle } from '@/lib/brand';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // Browser redirects away — no need to reset loading state
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

      <button
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        style={styles.googleButton}
      >
        {isLoading ? 'Redirecting...' : 'Continue with Google'}
      </button>
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
  googleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '14px 28px',
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    background: '#ffffff',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '600',
    color: '#374151',
    minWidth: '280px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
};
