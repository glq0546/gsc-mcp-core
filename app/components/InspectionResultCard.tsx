'use client';

import type { InspectionResult } from '@/app/types/gsc';
import { formatDateTime } from '@/app/lib/format';

interface VerdictStyle {
  badge: string;
  dot: string;
  label: string;
}

const VERDICT_STYLES: Record<string, VerdictStyle> = {
  PASS: {
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
    dot: 'bg-emerald-400',
    label: 'PASS · Indexed',
  },
  FAIL: {
    badge: 'bg-red-500/10 text-red-300 border-red-500/40',
    dot: 'bg-red-400',
    label: 'FAIL · Not indexed',
  },
  NEUTRAL: {
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
    dot: 'bg-amber-400',
    label: 'NEUTRAL · Not indexed',
  },
  PARTIAL: {
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/40',
    dot: 'bg-sky-400',
    label: 'PARTIAL · Partially indexed',
  },
  UNKNOWN: {
    badge: 'bg-gray-500/10 text-gray-300 border-gray-500/40',
    dot: 'bg-gray-400',
    label: 'UNKNOWN · Status unavailable',
  },
};

export default function InspectionResultCard({
  result,
}: {
  result: InspectionResult;
}) {
  const style = VERDICT_STYLES[result.verdict] ?? VERDICT_STYLES.UNKNOWN;

  // The API sometimes omits inspectionResultLink; fall back to the property page.
  const inspectionLink =
    result.inspectionLink ||
    `https://search.google.com/search-console?resource_id=${encodeURIComponent(
      result.siteUrl
    )}`;

  const canonicalMismatch =
    Boolean(result.googleCanonical) &&
    Boolean(result.userCanonical) &&
    result.googleCanonical !== result.userCanonical;

  const richResults = result.richResultsResult;

  return (
    <div className="bg-[#0f172a] border border-gray-700 rounded-xl overflow-hidden shadow-lg">
      <div className="p-6 border-b border-gray-700/70">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Index Status
            </p>
            <p className="mt-1 text-sm text-gray-300 break-all">
              {result.inspectionUrl}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-bold tracking-wide ${style.badge}`}
          >
            <span className={`w-2 h-2 rounded-full ${style.dot}`} />
            {style.label}
          </span>
        </div>

        {result.summary && (
          <p className="mt-4 text-sm text-gray-300 leading-relaxed">
            {result.summary}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-700/50">
        <StatField label="Coverage State" value={result.coverageState} />
        <StatField
          label="Last Crawl Time"
          value={formatDateTime(result.lastCrawlTime, 'Not crawled yet')}
        />
        <StatField label="Indexing State" value={result.indexingState} />
        <StatField label="Verdict" value={result.verdict} />
        <StatField
          label="Google Canonical"
          value={result.googleCanonical || '—'}
          mono
        />
        <StatField
          label="User Canonical"
          value={result.userCanonical || '—'}
          mono
        />
      </dl>

      {canonicalMismatch && (
        <div className="mx-6 my-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Canonical mismatch — Google selected a different canonical than the one
          declared on the page.
        </div>
      )}

      {richResults && (
        <div className="px-6 py-4 border-t border-gray-700/70">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Rich Results · {richResults.verdict}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {richResults.detectedItems.length === 0 && (
              <span className="text-xs text-gray-500">
                No rich result items detected.
              </span>
            )}
            {richResults.detectedItems.map((item, index) => (
              <span
                key={`${item.richResultType}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-800/60 px-3 py-1 text-xs text-gray-300"
              >
                <span className="font-medium text-white">
                  {item.richResultType}
                </span>
                {item.items.length > 0 && (
                  <span className="text-gray-400">
                    · {item.items.filter(Boolean).join(', ')}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-gray-700/70">
        <p className="text-xs text-gray-500">
          Live data from the Google URL Inspection API (~200 queries/day quota).
        </p>
        <a
          href={inspectionLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Open Inspection Link
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}

function StatField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-[#0f172a] px-6 py-4">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm text-white ${
          mono ? 'font-mono text-xs break-all' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
