/**
 * /privacy — 极简隐私声明（静态页）
 *
 * 存在的两个理由：
 *   1. Google OAuth 验证要求在同一域名下提供隐私政策；
 *   2. 用户要把 Search Console 只读权限交给本服务，必须先知道数据怎么被处理。
 */

import type { Metadata } from 'next';
import Link from 'next/link';

const CONTACT_EMAIL = 'glq0546@gmail.com';

export const metadata: Metadata = {
  title: 'Privacy Policy — GSC MCP Core',
  description:
    'How GSC MCP Core stores your Google account email, Search Console tokens and API keys, and how to delete them.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#0f172a] text-white p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="border-b border-gray-700 pb-6">
          <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to app
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mt-3">Privacy Policy</h1>
          <p className="text-gray-400 mt-1 text-sm">
            GSC MCP Core (&ldquo;the Service&rdquo;) is a free beta tool that lets AI
            clients read your Google Search Console data. This page explains what we
            store, why, and how to remove it.
          </p>
        </header>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">1. Information we collect</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-300 text-sm">
            <li>
              <span className="text-gray-100">Google account email</span> — used as your
              tenant identifier and shown only to you.
            </li>
            <li>
              <span className="text-gray-100">Google OAuth refresh token</span> — issued by
              Google for the read-only Search Console scope (
              <code className="font-mono text-xs text-gray-400">webmasters.readonly</code>
              ). It is used to query your Search Console properties on your behalf, and is
              never shared with third parties.
            </li>
            <li>
              <span className="text-gray-100">API key hash</span> — we store only a SHA-256
              hash of your API key. The key itself is shown once and is not recoverable.
            </li>
            <li>
              <span className="text-gray-100">Usage counters</span> — request timestamps and
              per-day quota counts, used to enforce the daily limit and prevent abuse.
            </li>
          </ul>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">2. What we do not do</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-300 text-sm">
            <li>We do not sell, rent or share your data with advertisers.</li>
            <li>We do not use your Search Console data to train machine learning models.</li>
            <li>We do not read Search Console properties you have not granted access to.</li>
          </ul>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">3. Where data is stored</h2>
          <p className="text-gray-300 text-sm">
            Account records, tokens and hashed API keys are stored in a Supabase
            (PostgreSQL) database protected by row-level security, so each tenant can only
            reach its own row. The application is hosted on Vercel. Search Console data is
            fetched from Google&apos;s APIs on demand and is not persisted on our servers
            beyond the transient response returned to your client.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">4. Cookies</h2>
          <p className="text-gray-300 text-sm">
            We use a single first-party session cookie to keep you signed in. We do not use
            advertising cookies or third-party tracking pixels.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">5. Retention and deletion</h2>
          <p className="text-gray-300 text-sm">
            Your record is kept while the beta runs. You can revoke this app&apos;s access
            at any time at{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              myaccount.google.com/permissions
            </a>
            , which immediately stops all further data access. To have your stored record
            and hashed key deleted, email{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              {CONTACT_EMAIL}
            </a>{' '}
            and we will remove it.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">6. Changes</h2>
          <p className="text-gray-300 text-sm">
            This is a free beta and this policy may change as the Service evolves. Material
            changes will be reflected on this page.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">7. Contact</h2>
          <p className="text-gray-300 text-sm">
            Questions about this policy:{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>

        <nav className="flex items-center justify-center gap-4 text-gray-500 text-sm pt-2">
          <Link href="/" className="hover:text-gray-300 underline">
            Home
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="hover:text-gray-300 underline">
            Terms of Service
          </Link>
        </nav>
      </div>
    </main>
  );
}
