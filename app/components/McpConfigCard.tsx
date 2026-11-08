'use client';

/**
 * 登录前展示的 mcp.json 示例
 *
 * 目的：访客在注册之前就能看到「接进 Cursor 之后长什么样」，
 * 降低「我不知道这东西怎么用」的流失。这里用的是占位 Key，
 * 真实 Key 由 ApiKeyCard 在登录后签发。
 */

import { useCallback, useMemo, useState } from 'react';
import { copyText } from '@/app/lib/clipboard';

/** 与 ApiKeyCard 保持一致：线上写死部署地址，本地开发用当前 origin。 */
const DEFAULT_MCP_URL = 'https://mcp.glq-api.asia/api/mcp';

const PLACEHOLDER_KEY = 'gsc_live_your_api_key_here';

export default function McpConfigCard() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mcpUrl = useMemo(() => {
    if (typeof window === 'undefined') return DEFAULT_MCP_URL;
    return /^localhost$|^127\.0\.0\.1$/.test(window.location.hostname)
      ? `${window.location.origin}/api/mcp`
      : DEFAULT_MCP_URL;
  }, []);

  const clientConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            'gsc-mcp': {
              url: mcpUrl,
              headers: {
                Authorization: `Bearer ${PLACEHOLDER_KEY}`,
              },
            },
          },
        },
        null,
        2
      ),
    [mcpUrl]
  );

  const handleCopy = useCallback(async () => {
    const ok = await copyText(clientConfig);
    if (!ok) {
      setError('Copy failed — please select the text and copy it manually.');
      return;
    }
    setError(null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [clientConfig]);

  return (
    <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 shadow-lg space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Use it in Cursor or Claude</h2>
          <p className="text-gray-400 mt-1 text-sm">
            Paste this into{' '}
            <span className="font-mono text-gray-300">~/.cursor/mcp.json</span> (Cursor) or{' '}
            <span className="font-mono text-gray-300">claude_desktop_config.json</span>{' '}
            (Claude Desktop), restart the client, then just ask in plain English — e.g.
            &ldquo;top 20 striking-distance keywords for mysite.com&rdquo;.
          </p>
        </div>

        <button
          onClick={handleCopy}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap self-start"
        >
          {copied ? '✓ Copied' : 'Copy config'}
        </button>
      </div>

      <pre className="result-scroll max-h-[260px] overflow-auto bg-[#0f172a] border border-gray-700 rounded-lg px-3 py-3 font-mono text-xs text-gray-300">
        {clientConfig}
      </pre>

      {error && <p className="text-xs text-red-300">{error}</p>}

      <p className="text-xs text-gray-500">
        Step 1 — sign in with Google (read-only Search Console access). Step 2 — generate
        your API key. Step 3 — replace{' '}
        <span className="font-mono text-gray-400">{PLACEHOLDER_KEY}</span> with the key you
        were shown, then restart the client.
      </p>
    </section>
  );
}
