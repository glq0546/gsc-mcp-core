/**
 * /terms — 极简服务条款（静态页）
 *
 * Google OAuth 验证要求同一域名下提供服务条款；同时明确这是免费 Beta、无 SLA。
 */

import type { Metadata } from 'next';
import Link from 'next/link';

const CONTACT_EMAIL = 'glq0546@gmail.com';

export const metadata: Metadata = {
  title: 'Terms of Service — GSC MCP Core',
  description:
    'Terms for using GSC MCP Core, a free beta MCP server that connects Google Search Console to AI clients.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0f172a] text-white p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="border-b border-gray-700 pb-6">
          <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to app
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mt-3">Terms of Service</h1>
          <p className="text-gray-400 mt-1 text-sm">
            These terms apply to GSC MCP Core (&ldquo;the Service&rdquo;). By signing in or
            using an API key you agree to them.
          </p>
        </header>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">1. The Service</h2>
          <p className="text-gray-300 text-sm">
            The Service is a free beta that exposes Google Search Console data to MCP
            clients such as Cursor and Claude. It is provided as-is, without any service
            level agreement. Features, quotas and availability may change or be withdrawn
            at any time.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">2. Your account and API key</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-300 text-sm">
            <li>
              You must only connect Search Console properties that you own or are
              authorised to access.
            </li>
            <li>
              Your API key is personal. Keep it secret, do not publish it, and do not share
              it between people or applications.
            </li>
            <li>
              Regenerating a key revokes the previous one immediately. Lost keys cannot be
              recovered — only replaced.
            </li>
            <li>
              You are responsible for all requests made with your key and for staying within
              the published daily quota (currently 50 requests per day).
            </li>
          </ul>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">3. Acceptable use</h2>
          <p className="text-gray-300 text-sm">
            Do not use the Service to break any law, to access data you are not authorised
            to access, to resell the Service as your own, or to attempt to bypass quotas,
            authentication or rate limits. We may suspend access that puts the Service or
            other users at risk.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">4. Your data</h2>
          <p className="text-gray-300 text-sm">
            You keep ownership of your Search Console data and of your Google account. We
            process it only to answer the queries you send through the Service. See the{' '}
            <Link href="/privacy" className="text-indigo-400 hover:text-indigo-300 underline">
              Privacy Policy
            </Link>{' '}
            for what is stored and how to delete it.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">5. No warranty</h2>
          <p className="text-gray-300 text-sm">
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;,
            without warranties of any kind, express or implied. Search Console data is
            supplied by Google and may be delayed, incomplete or sampled; do not rely on it
            as the sole basis for business, financial or legal decisions.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">6. Limitation of liability</h2>
          <p className="text-gray-300 text-sm">
            To the maximum extent permitted by law, we are not liable for indirect,
            incidental or consequential damages, or for lost profits, revenue, data or
            rankings arising from use of the Service. Because the beta is provided free of
            charge, our total liability is limited to the amount you paid us, which is zero.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">7. Termination</h2>
          <p className="text-gray-300 text-sm">
            You may stop using the Service at any time by revoking access at{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              myaccount.google.com/permissions
            </a>
            . We may suspend or end the beta, or your access to it, at any time.
          </p>
        </section>

        <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 space-y-3">
          <h2 className="text-xl font-bold">8. Contact</h2>
          <p className="text-gray-300 text-sm">
            Questions about these terms:{' '}
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
          <Link href="/privacy" className="hover:text-gray-300 underline">
            Privacy Policy
          </Link>
        </nav>
      </div>
    </main>
  );
}
