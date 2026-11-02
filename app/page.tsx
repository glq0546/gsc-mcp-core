'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase/browser';
import type { Session } from '@supabase/supabase-js';
import InspectionResultCard from '@/app/components/InspectionResultCard';
import OpportunityResults from '@/app/components/OpportunityResults';
import type {
  ApiResponse,
  InspectionResult,
  RadarResult,
} from '@/app/types/gsc';

export default function Home() {
  const [siteUrl, setSiteUrl] = useState('https://glq-api.asia/');
  const [inspectionUrl, setInspectionUrl] = useState('');
  const [minImpressions, setMinImpressions] = useState(1);
  const [daysBack, setDaysBack] = useState(30);
  
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [result, setResult] = useState<
    ApiResponse<InspectionResult | RadarResult> | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  // 页面加载时读取当前会话（@supabase/ssr 把会话存在 cookie 里）。
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      setAuthLoading(false);
    });

    // 登录回调 / 登出 / token 刷新时同步 UI，避免只在首次挂载时读取一次。
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleLogin = async () => {
    setLoginLoading(true);
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
      setLoginLoading(false);
    }
  };

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, minImpressions, daysBack }),
      });
      const data = await res.json();
      
      if (res.status === 401) throw new Error('Unauthorized: Please sign in first.');
      if (!res.ok) throw new Error(data.error || 'Failed to fetch data');
      
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInspect = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl, inspectionUrl: inspectionUrl || siteUrl }),
      });
      const data = await res.json();
      
      if (res.status === 401) throw new Error('Unauthorized: Please sign in first.');
      if (!res.ok) throw new Error(data.error || 'Failed to fetch data');
      
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Narrow the wrapped payload so each result kind renders its own card layout.
  const payload = result?.data;
  const inspection = payload && 'verdict' in payload ? payload : null;
  const radar = payload && 'opportunities' in payload ? payload : null;
  // /api/* returns HTTP 200 with `success: false` for upstream failures.
  const apiError =
    error ??
    (result && result.success === false
      ? result.error || 'Failed to fetch data'
      : null);

  return (
    <main className="min-h-screen bg-[#0f172a] text-white p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-700 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">GSC Diagnostic Tool</h1>
            <p className="text-gray-400 mt-1">Next.js Micro-SaaS - GSC API Integration</p>
          </div>
          <div className="mt-4 md:mt-0">
            {authLoading ? (
              <span className="text-sm text-gray-400">Checking session...</span>
            ) : session?.user?.email ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-300">
                  Signed in as <span className="font-medium text-white">{session.user.email}</span>
                </span>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="bg-transparent border border-gray-600 text-gray-200 px-3 py-2 rounded-lg font-medium hover:bg-gray-800 hover:border-gray-500 transition-colors disabled:opacity-50"
                >
                  {signingOut ? 'Signing out...' : 'Sign out'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                disabled={loginLoading}
                className="flex items-center gap-2 bg-white text-gray-900 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                {loginLoading ? 'Connecting...' : 'Sign in with Google'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 shadow-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">SITE URL</label>
            <input 
              type="text" 
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              className="w-full bg-[#0f172a] border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">INSPECTION URL (optional)</label>
            <input 
              type="text" 
              placeholder="https://example.com/specific-page"
              value={inspectionUrl}
              onChange={(e) => setInspectionUrl(e.target.value)}
              className="w-full bg-[#0f172a] border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">MIN. IMPRESSIONS</label>
              <input 
                type="number" 
                value={minImpressions}
                onChange={(e) => setMinImpressions(Number(e.target.value))}
                className="w-full bg-[#0f172a] border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">DAYS BACK</label>
              <input 
                type="number" 
                value={daysBack}
                onChange={(e) => setDaysBack(Number(e.target.value))}
                className="w-full bg-[#0f172a] border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex space-x-4 pt-2">
            <button 
              onClick={handleScan}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Scan Opportunities
            </button>
            <button 
              onClick={handleInspect}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Inspect Index Status
            </button>
          </div>
        </div>

        <div className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 shadow-lg min-h-[300px]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Results</h2>
            {loading && <span className="text-yellow-400 text-sm animate-pulse">Loading...</span>}
            {!loading && result && !apiError && <span className="bg-emerald-900 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold">Success</span>}
            {!loading && apiError && <span className="bg-red-900 text-red-300 px-3 py-1 rounded-full text-xs font-bold">Failed</span>}
          </div>

          <div className="space-y-4">
            {apiError && (
              <div className="bg-red-950/60 border border-red-800/70 rounded-lg p-4 text-sm text-red-300">
                <p className="font-semibold text-red-200 mb-1">Request failed</p>
                <p className="break-words">{apiError}</p>
              </div>
            )}

            {!apiError && loading && (
              <div className="bg-[#0f172a] border border-gray-700 rounded-xl flex flex-col items-center justify-center gap-3 py-14 text-gray-400">
                <span className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin-slow" />
                <p className="text-sm">Querying Google Search Console...</p>
              </div>
            )}

            {!loading && !apiError && inspection && (
              <InspectionResultCard result={inspection} />
            )}

            {!loading && !apiError && radar && (
              <OpportunityResults result={radar} />
            )}

            {!loading && !apiError && payload && !inspection && !radar && (
              <div className="bg-[#0f172a] border border-gray-700 rounded-lg p-4 text-sm text-gray-400">
                <p>Received an unexpected response shape from the API.</p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-indigo-400 hover:text-indigo-300">
                    View raw response
                  </summary>
                  <pre className="result-scroll mt-2 max-h-[320px] overflow-auto font-mono text-xs text-gray-300">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            {!result && !apiError && !loading && (
              <div className="text-gray-500 flex flex-col items-center justify-center py-12">
                <span className="text-4xl mb-4">🔍</span>
                <p>Click the buttons above to start testing</p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-gray-500 text-sm mt-8">
          Found issues with your site?{' '}
          <a
            href="https://decodeglq.gumroad.com/l/charge-decoder-pro"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            Get the Pro SEO & Chargeback Guide ($9.99)
          </a>
        </p>
      </div>
    </main>
  );
}