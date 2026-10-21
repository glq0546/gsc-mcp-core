'use client';

import { useState, useCallback } from 'react';

type StatusType = 'idle' | 'loading' | 'success' | 'error';

interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export default function Home() {
  const [siteUrl, setSiteUrl] = useState('https://glq-api.asia/');
  const [minImpressions, setMinImpressions] = useState(1);
  const [daysBack, setDaysBack] = useState(30);
  const [inspectionUrl, setInspectionUrl] = useState('');

  const [status, setStatus] = useState<StatusType>('idle');
  const [result, setResult] = useState<string>('');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const escapeHtml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  const showResult = useCallback((content: string) => {
    setResult(content);
  }, []);

  const callApi = useCallback(
    async (endpoint: string, payload: Record<string, unknown>): Promise<ActionResult> => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    []
  );

  const runOpportunityRadar = useCallback(async () => {
    setLoadingAction('radar');
    setStatus('loading');
    showResult('⏳ 正在从 GSC 拉取数据，请稍候...');

    try {
      const json = await callApi('/api/radar', {
        siteUrl: siteUrl.trim(),
        minImpressions,
        daysBack,
      });

      if (json.success) {
        setStatus('success');
        showResult(JSON.stringify(json.data, null, 2));
      } else {
        setStatus('error');
        showResult(`❌ 错误: ${json.error}`);
      }
    } catch (err: unknown) {
      setStatus('error');
      const message = err instanceof Error ? err.message : '未知错误';
      showResult(`❌ 请求失败: ${message}`);
    } finally {
      setLoadingAction(null);
    }
  }, [siteUrl, minImpressions, daysBack, callApi, showResult]);

  const runInspectUrl = useCallback(async () => {
    setLoadingAction('inspect');
    setStatus('loading');
    showResult('⏳ 正在调用 URL Inspection API...');

    try {
      const json = await callApi('/api/inspect', {
        siteUrl: siteUrl.trim(),
        inspectionUrl: inspectionUrl.trim() || siteUrl.trim(),
      });

      if (json.success) {
        setStatus('success');
        showResult(JSON.stringify(json.data, null, 2));
      } else {
        setStatus('error');
        showResult(`❌ 错误: ${json.error}`);
      }
    } catch (err: unknown) {
      setStatus('error');
      const message = err instanceof Error ? err.message : '未知错误';
      showResult(`❌ 请求失败: ${message}`);
    } finally {
      setLoadingAction(null);
    }
  }, [siteUrl, inspectionUrl, callApi, showResult]);

  const statusBadge = {
    idle: null,
    loading: { text: '加载中', cls: 'bg-blue-900/40 text-blue-300 border-blue-700' },
    success: { text: '成功', cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700' },
    error: { text: '失败', cls: 'bg-red-900/40 text-red-300 border-red-700' },
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-200 p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-50 tracking-tight">
            GSC 工具测试台
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            本地 Web UI — 直接调用 opportunity-radar 和 inspect-url 工具
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-6 mb-6 shadow-lg">
          {/* Site URL */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">
              站点 URL
            </label>
            <input
              type="url"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://example.com/"
              className="w-full px-4 py-2.5 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 text-sm placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
            />
          </div>

          {/* Inspection URL */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">
              探测目标 URL <span className="text-slate-500 normal-case">(留空则与站点 URL 相同)</span>
            </label>
            <input
              type="url"
              value={inspectionUrl}
              onChange={(e) => setInspectionUrl(e.target.value)}
              placeholder="https://example.com/specific-page"
              className="w-full px-4 py-2.5 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 text-sm placeholder:text-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
            />
          </div>

          {/* Parameters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">
                最小曝光量
              </label>
              <input
                type="number"
                value={minImpressions}
                onChange={(e) => setMinImpressions(Number(e.target.value))}
                min={0}
                className="w-full px-4 py-2.5 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 tracking-wide uppercase">
                回溯天数
              </label>
              <input
                type="number"
                value={daysBack}
                onChange={(e) => setDaysBack(Number(e.target.value))}
                min={1}
                max={90}
                className="w-full px-4 py-2.5 bg-slate-900/80 border border-slate-600/50 rounded-xl text-slate-100 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={runOpportunityRadar}
              disabled={loadingAction !== null}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-900/30 transition-all active:scale-95"
            >
              {loadingAction === 'radar' && (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />
              )}
              扫描机会词
            </button>
            <button
              onClick={runInspectUrl}
              disabled={loadingAction !== null}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-900/30 transition-all active:scale-95"
            >
              {loadingAction === 'inspect' && (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin-slow" />
              )}
              探测收录
            </button>
          </div>
        </div>

        {/* Result Card */}
        <div className="bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl overflow-hidden shadow-lg">
          {/* Result Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
            <h2 className="text-sm font-semibold text-slate-200">结果</h2>
            {status !== 'idle' && statusBadge[status] && (
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusBadge[status].cls}`}
              >
                {statusBadge[status].text}
              </span>
            )}
          </div>

          {/* Result Body */}
          <div className="p-6">
            {status === 'idle' ? (
              <div className="text-center text-slate-500 py-12">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-sm">点击上方按钮开始测试</p>
              </div>
            ) : (
              <pre
                className="result-scroll bg-slate-950/80 border border-slate-700/30 rounded-xl p-4 overflow-auto max-h-[600px] text-xs leading-relaxed text-cyan-200/90 whitespace-pre-wrap break-words font-mono"
                dangerouslySetInnerHTML={{ __html: escapeHtml(result) }}
              />
            )}
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-slate-600 mt-6">
          Powered by Next.js · GSC API · Tailwind CSS
        </p>
      </div>
    </main>
  );
}
