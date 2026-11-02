'use client';

/**
 * API Key 自助生成卡片
 *
 * 状态机：idle → generating → revealed（明文只在这一步可见）→ dismissed
 * 明文只保存在组件内存里：关闭卡片 / 刷新页面后就丢了，这就是「只展示一次」的含义。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDateTime } from '@/app/lib/format';

/** 与 src/lib/api-keys.ts 的 API_KEY_PREFIX 一致，仅用于界面展示。 */
const API_KEY_DISPLAY_PREFIX = 'gsc_live_';

/** 默认按线上部署地址生成配置；本地开发时自动指向当前 origin。 */
const DEFAULT_MCP_URL = 'https://gsc-mcp-core.vercel.app/api/mcp';

interface IssuedKey {
  apiKey: string;
  apiKeyPrefix: string;
  createdAt: string;
}

interface ExistingKey {
  prefix: string;
  createdAt: string | null;
}

interface GenerateResponse {
  success: boolean;
  data?: IssuedKey;
  error?: string;
}

type CopyTarget = 'key' | 'config';

/** 复制到剪贴板，返回是否成功（非 https 环境下 navigator.clipboard 不可用）。 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落回下面的兜底方案
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export default function ApiKeyCard({ email }: { email: string }) {
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [existing, setExisting] = useState<ExistingKey | null>(null);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  const mcpUrl = useMemo(() => {
    if (typeof window === 'undefined') return DEFAULT_MCP_URL;
    return /^localhost$|^127\.0\.0\.1$/.test(window.location.hostname)
      ? `${window.location.origin}/api/mcp`
      : DEFAULT_MCP_URL;
  }, []);

  // 进页面时问一下「是否已经签发过」，只取前缀，不回明文。
  useEffect(() => {
    let active = true;

    fetch('/api/keys/generate', { method: 'GET', cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as { success: boolean; data?: ExistingKey | null };
        if (!active) return;
        if (res.ok && json.success) setExisting(json.data ?? null);
      })
      .catch(() => {
        // 元信息只是锦上添花，失败就当作「还没签发过」
      })
      .finally(() => {
        if (active) setMetadataLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    // 已有 Key 时再点等于轮换，旧 Key 会立刻失效 —— 必须先确认。
    if (existing && !issued) {
      const confirmed = window.confirm(
        `You already have an API key (${existing.prefix}...).\n` +
          'Generating a new one revokes it immediately. Continue?'
      );
      if (!confirmed) return;
    }

    setIssuing(true);
    setError(null);
    setCopied(null);

    try {
      const res = await fetch('/api/keys/generate', { method: 'POST', cache: 'no-store' });
      const json = (await res.json()) as GenerateResponse;

      if (res.status === 401) throw new Error('Session expired. Please sign in again.');
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Failed to generate API key.');
      }

      setIssued(json.data);
      setExisting({ prefix: json.data.apiKeyPrefix, createdAt: json.data.createdAt });
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate API key.');
    } finally {
      setIssuing(false);
    }
  }, [existing, issued]);

  const handleCopy = useCallback(async (target: CopyTarget, text: string) => {
    const ok = await copyText(text);
    if (!ok) {
      setError('Copy failed — please select the text and copy it manually.');
      return;
    }
    setCopied(target);
    window.setTimeout(() => setCopied((current) => (current === target ? null : current)), 2000);
  }, []);

  const handleDismiss = () => {
    // 明文从内存里抹掉，之后无法再取回
    setIssued(null);
    setCopied(null);
  };

  const maskPrefix = existing ? `${existing.prefix}${'•'.repeat(12)}` : null;

  const clientConfig = useMemo(() => {
    if (!issued) return '';
    return JSON.stringify(
      {
        mcpServers: {
          'gsc-mcp': {
            url: mcpUrl,
            headers: {
              Authorization: `Bearer ${issued.apiKey}`,
            },
          },
        },
      },
      null,
      2
    );
  }, [issued, mcpUrl]);

  return (
    <section className="bg-[#1e293b] p-6 rounded-xl border border-gray-700 shadow-lg space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">API Key</h2>
          <p className="text-gray-400 mt-1 text-sm">
            Use this key to connect Cursor, Claude or any MCP client to your own
            Search Console data.
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-2">
          <button
            onClick={handleGenerate}
            disabled={issuing}
            className="bg-amber-500 hover:bg-amber-400 text-gray-900 px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-amber-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {issuing
              ? 'Generating...'
              : existing
                ? 'Regenerate API Key'
                : 'Generate API Key'}
          </button>
          {metadataLoaded && existing && !issued && (
            <span className="text-xs text-gray-500">
              Active key{' '}
              <span className="font-mono text-gray-400">{existing.prefix}...</span>
              {existing.createdAt && ` · created ${formatDateTime(existing.createdAt)}`}
            </span>
          )}
          {metadataLoaded && !existing && !issued && (
            <span className="text-xs text-gray-500">
              No key yet for <span className="text-gray-400">{email}</span>
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-950/60 border border-red-800/70 rounded-lg p-4 text-sm text-red-300">
          <p className="font-semibold text-red-200 mb-1">Could not generate API key</p>
          <p className="break-words">{error}</p>
        </div>
      )}

      {issued && (
        <div className="space-y-4 border border-amber-500/40 bg-amber-500/5 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-lg">
              ⚠️
            </span>
            <p className="text-sm font-semibold text-amber-200">
              Please save this key securely. It will not be shown again.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Your API Key
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <code className="flex-1 min-w-0 bg-[#0f172a] border border-gray-700 rounded-lg px-3 py-2 font-mono text-xs text-emerald-300 break-all">
                {issued.apiKey}
              </code>
              <button
                onClick={() => handleCopy('key', issued.apiKey)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >
                {copied === 'key' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Cursor / Claude MCP config
              </label>
              <button
                onClick={() => handleCopy('config', clientConfig)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
              >
                {copied === 'config' ? '✓ Copied' : 'Copy config'}
              </button>
            </div>
            <pre className="result-scroll max-h-[260px] overflow-auto bg-[#0f172a] border border-gray-700 rounded-lg px-3 py-3 font-mono text-xs text-gray-300">
              {clientConfig}
            </pre>
            <p className="mt-2 text-xs text-gray-500">
              Paste into <span className="text-gray-400">~/.cursor/mcp.json</span> (Cursor) or{' '}
              <span className="text-gray-400">claude_desktop_config.json</span> (Claude
              Desktop), then restart the client.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-gray-500">
              Prefix <span className="font-mono text-gray-400">{issued.apiKeyPrefix}</span> ·
              starts with {API_KEY_DISPLAY_PREFIX}
            </span>
            <button
              onClick={handleDismiss}
              className="bg-transparent border border-gray-600 text-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 hover:border-gray-500 transition-colors"
            >
              I&apos;ve saved it — hide key
            </button>
          </div>
        </div>
      )}

      {!issued && metadataLoaded && existing && (
        <p className="text-xs text-gray-500">
          Stored key: <span className="font-mono text-gray-400">{maskPrefix}</span> — only a
          hash is kept on the server, so the full key can&apos;t be shown again.
        </p>
      )}
    </section>
  );
}
