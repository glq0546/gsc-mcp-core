'use client';

import { supabase } from '@/src/lib/supabase/browser';
import { useState } from 'react';

export default function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/webmasters.readonly',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      alert('Login failed: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      className="flex items-center gap-2 bg-white text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
    >
      <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
      {loading ? 'Connecting...' : 'Sign in with Google'}
    </button>
  );
}