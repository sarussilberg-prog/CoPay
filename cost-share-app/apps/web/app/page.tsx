import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { APP_BRAND_TITLE, appBrandTitleStyle } from '@/lib/brand';

async function handleSignOut() {
  'use server';
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const displayName = user.user_metadata?.full_name ?? user.email ?? 'User';

  return (
    <main style={{ padding: '48px 32px', fontFamily: 'sans-serif' }}>
      <h1 style={appBrandTitleStyle}>
        {APP_BRAND_TITLE}
      </h1>
      <p style={{ color: '#6B7280', marginBottom: '32px' }}>
        Welcome, {displayName}
      </p>

      <form action={handleSignOut}>
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            background: '#EF4444',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
          }}
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
