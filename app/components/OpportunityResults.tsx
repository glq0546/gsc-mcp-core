'use client';

import { useState } from 'react';
import type { RadarResult } from '@/app/types/gsc';
import { formatNumber, formatPosition } from '@/app/lib/format';

export default function OpportunityResults({ result }: { result: RadarResult }) {
  const [expandedRanks, setExpandedRanks] = useState<number[]>([]);

  const opportunities = result.opportunities ?? [];
  const overview = result.overview;
  const allExpanded =
    opportunities.length > 0 && expandedRanks.length === opportunities.length;

  const dateRange =
    overview?.dateRange ??
    (overview?.startDate && overview?.endDate
      ? `${overview.startDate} ~ ${overview.endDate}`
      : '—');

  const toggleRank = (rank: number) => {
    setExpandedRanks((prev) =>
      prev.includes(rank) ? prev.filter((r) => r !== rank) : [...prev, rank]
    );
  };

  const toggleAll = () => {
    setExpandedRanks(allExpanded ? [] : opportunities.map((o) => o.rank));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label="Queries Scanned"
          value={formatNumber(overview?.totalQueriesScanned)}
        />
        <SummaryTile
          label="Opportunities"
          value={formatNumber(opportunities.length)}
        />
        <SummaryTile
          label="Lookback"
          value={overview?.daysBack ? `${overview.daysBack} days` : '—'}
        />
        <SummaryTile label="Date Range" value={dateRange} small />
      </div>

      {result.message && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {result.message}
        </div>
      )}

      {opportunities.length === 0 && !result.message && (
        <div className="rounded-lg border border-gray-700 bg-[#0f172a] px-4 py-10 text-center text-sm text-gray-400">
          No opportunities matched the current filters. Try lowering the minimum
          impressions or widening the lookback window.
        </div>
      )}

      {opportunities.length > 0 && (
        <div className="bg-[#0f172a] border border-gray-700 rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-700/70">
            <div>
              <h3 className="font-semibold text-white">Keyword Opportunities</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Sorted by estimated incremental clicks
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs font-medium text-indigo-400 transition-colors hover:border-indigo-400/60 hover:text-indigo-300"
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          </div>

          <ul className="divide-y divide-gray-700/60">
            {opportunities.map((opp) => {
              const isOpen = expandedRanks.includes(opp.rank);
              return (
                <li key={opp.rank} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2 text-xs font-bold text-indigo-300">
                        #{opp.rank}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-base font-semibold text-white break-words">
                          {opp.query}
                        </h4>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Target: {opp.targetTier} · CTR {opp.targetCtr}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                      +{formatNumber(opp.incrementalClicks)} clicks est.
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric
                      label="Position"
                      value={formatPosition(opp.currentPosition)}
                    />
                    <Metric
                      label="Impressions"
                      value={formatNumber(opp.impressions)}
                    />
                    <Metric label="Clicks" value={formatNumber(opp.clicks)} />
                    <Metric
                      label="Current CTR"
                      value={opp.currentCtr}
                      hint={`target ${opp.targetCtr}`}
                    />
                  </dl>

                  <button
                    type="button"
                    onClick={() => toggleRank(opp.rank)}
                    aria-expanded={isOpen}
                    aria-controls={`prescriptions-${opp.rank}`}
                    className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300"
                  >
                    <span
                      aria-hidden="true"
                      className={`text-[10px] transition-transform ${
                        isOpen ? 'rotate-90' : ''
                      }`}
                    >
                      ▶
                    </span>
                    {isOpen ? 'Hide' : 'Show'} {opp.prescriptions.length}{' '}
                    prescriptions
                  </button>

                  {isOpen && (
                    <div
                      id={`prescriptions-${opp.rank}`}
                      className="mt-3 space-y-2 border-t border-gray-700/60 pt-3"
                    >
                      {opp.prescriptions.map((prescription, index) => (
                        <PrescriptionItem
                          key={`${opp.rank}-${index}`}
                          type={prescription.type}
                          action={prescription.action}
                          detail={prescription.detail}
                        />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {result.prioritizeTop3 && result.prioritizeTop3.length > 0 && (
        <div className="bg-[#0f172a] border border-gray-700 rounded-xl p-5">
          <h3 className="font-semibold text-white">Prioritize Now</h3>
          <ol className="mt-3 space-y-2">
            {result.prioritizeTop3.map((item, index) => (
              <li key={`${item.query}-${index}`} className="flex gap-3 text-sm">
                <span className="font-mono text-gray-500">{index + 1}.</span>
                <p className="min-w-0 text-gray-400">
                  <span className="font-medium text-white">{item.query}</span>
                  <span> — {item.reason}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {result.ctrModelNote && (
        <p className="text-xs leading-relaxed text-gray-500">
          <span className="font-semibold text-gray-400">Estimate model:</span>{' '}
          {result.ctrModelNote}
        </p>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-[#0f172a] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 font-semibold text-white ${
          small ? 'text-xs' : 'text-lg'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-700/60 bg-[#0b1220] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-white">
        {value}
        {hint && (
          <span className="ml-1 text-[11px] font-normal text-gray-500">
            {hint}
          </span>
        )}
      </dd>
    </div>
  );
}

function PrescriptionItem({
  type,
  action,
  detail,
}: {
  type: string;
  action: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-gray-700/60 bg-[#0b1220] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
        {type}
      </p>
      <p className="mt-1 text-sm text-gray-200">{action}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}
