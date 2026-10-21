/**
 * Tool: gsc_opportunity_radar
 *
 * Scans GSC data to find "high impressions + low CTR + mid-range ranking" keyword opportunities.
 * Uses a segmented CTR model to estimate incremental traffic gains and outputs prescription-grade advice.
 *
 * Segmented CTR model (industry benchmarks, estimates not guaranteed):
 *   - Rank 1-3:   estimated CTR 28% (top of page 1)
 *   - Rank 4-6:   estimated CTR 12% (mid / lower page 1)
 *   - Rank 7-10:  estimated CTR 5%  (bottom of page 1 / top of page 2)
 *
 * Estimation assumptions:
 *   1. CTR curve is based on publicly available Google industry benchmark studies (2024-2025 academic research)
 *   2. Actual CTR varies significantly by industry, branded vs non-branded queries, and SERP features (ads / featured snippets / People Also Ask)
 *   3. Incremental clicks = (targetCTR - currentCTR) × impressions, assuming impressions remain stable after ranking improvement
 *   4. This is a directional estimate, not a precise prediction — real results depend on content quality and competitive dynamics
 */

const { z } = require('zod');
const { getGscClient, getDateRange } = require('../gsc-client');

// ── Segmented CTR model constants ───────────────────────────────
const CTR_TIERS = [
  { min: 1, max: 3, ctr: 0.28, label: 'Rank 1-3 (top of page 1)' },
  { min: 4, max: 6, ctr: 0.12, label: 'Rank 4-6 (mid page 1)' },
  { min: 7, max: 10, ctr: 0.05, label: 'Rank 7-10 (bottom of page 1)' },
];

/**
 * Returns the target CTR tier for a given average position.
 * If position > 10, returns the lowest tier (optimizing into top 10).
 */
function getTargetCtr(avgPosition) {
  for (const tier of CTR_TIERS) {
    if (avgPosition >= tier.min && avgPosition <= tier.max) {
      return tier;
    }
  }
  // position > 10, estimate using the 7-10 tier (assuming optimization into top 10)
  return CTR_TIERS[CTR_TIERS.length - 1];
}

// ── Zod input schema ────────────────────────────────────────────
const inputSchema = z.object({
  siteUrl: z
    .string()
    .describe('GSC site URL, e.g. https://example.com/'),
  daysBack: z
    .number()
    .int()
    .min(1)
    .max(90)
    .default(7)
    .describe('Lookback window in days (default 7)'),
  minImpressions: z
    .number()
    .int()
    .min(0)
    .default(100)
    .describe('Minimum impressions filter (filters low-volume noise, default 100)'),
  maxPosition: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe('Maximum average position to include (default 20)'),
  topN: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Return Top N opportunities (default 10)'),
});

// ── Tool definition ─────────────────────────────────────────────
const toolDefinition = {
  name: 'gsc_opportunity_radar',
  description:
    'Scans Google Search Console data to find high-impression, low-CTR SEO opportunity keywords. ' +
    'Uses a segmented CTR model to estimate incremental clicks after ranking improvement, ' +
    'and provides 3 prescription-grade recommendations (Title Optimization, AI Answer Capsule, Internal Linking). ' +
    'Output includes scan overview, top opportunities list, incremental gain forecast, and prioritization advice.',
  inputSchema: inputSchema,
};

// ── Core implementation ─────────────────────────────────────────
async function executeOpportunityRadar(args) {
  const { siteUrl, daysBack, minImpressions, maxPosition, topN } =
    inputSchema.parse(args);

  const searchconsole = getGscClient();
  const { startDate, endDate } = getDateRange(daysBack);

  // Step 1: Fetch query-level data
  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['query'],
      rowLimit: 250, // fetch enough rows for filtering
      dataState: 'final',
    },
  });

  const rows = response.data.rows || [];
  if (rows.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              overview: { siteUrl, startDate, endDate, daysBack },
              message: 'No GSC data for this period. Check the date range or site URL.',
              opportunities: [],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Step 2: Filter & calculate incremental gains
  const opportunities = rows
    .filter((row) => {
      const position = row.position;
      const impressions = row.impressions;
      return position <= maxPosition && impressions >= minImpressions;
    })
    .map((row) => {
      const query = row.keys[0];
      const clicks = row.clicks;
      const impressions = row.impressions;
      const currentCtr = row.ctr; // googleapis returns a 0-1 decimal
      const position = row.position;

      // Segmented CTR model
      const tier = getTargetCtr(position);
      const targetCtr = tier.ctr;

      // Incremental gain forecast
      const currentClicks = clicks;
      const predictedClicks = impressions * targetCtr;
      const incrementalClicks = Math.round(predictedClicks - currentClicks);
      // If current CTR already exceeds target CTR (likely branded), no incremental gain
      const positiveIncremental = Math.max(0, incrementalClicks);

      // Current CTR percentage
      const currentCtrPct = (currentCtr * 100).toFixed(2);

      return {
        query,
        position: +position.toFixed(1),
        impressions,
        clicks,
        currentCtr: `${currentCtrPct}%`,
        currentCtrRaw: currentCtr,
        targetTier: tier.label,
        targetCtr: `${(targetCtr * 100).toFixed(0)}%`,
        incrementalClicks: positiveIncremental,
      };
    })
    // Sort by incremental gain descending
    .sort((a, b) => b.incrementalClicks - a.incrementalClicks)
    .slice(0, topN);

  // Step 3: Generate prescription advice
  const opportunitiesWithAdvice = opportunities.map((opp, idx) => ({
    rank: idx + 1,
    query: opp.query,
    currentPosition: opp.position,
    impressions: opp.impressions,
    clicks: opp.clicks,
    currentCtr: opp.currentCtr,
    targetTier: opp.targetTier,
    targetCtr: opp.targetCtr,
    incrementalClicks: opp.incrementalClicks,
    prescriptions: generatePrescriptions(opp),
  }));

  // Step 4: Identify Top 3 keywords to prioritize
  const top3 = opportunitiesWithAdvice.slice(0, 3).map((o) => ({
    query: o.query,
    reason: `Position ${o.currentPosition} → Target ${o.targetTier}, est. +${o.incrementalClicks} clicks/period`,
  }));

  // Step 5: Build output
  const output = {
    overview: {
      siteUrl,
      dateRange: `${startDate} ~ ${endDate}`,
      daysBack,
      filters: {
        minImpressions,
        maxPosition,
      },
      totalQueriesScanned: rows.length,
      opportunitiesFound: opportunities.length,
    },
    ctrModelNote:
      'Segmented CTR model based on industry benchmark research (2024-2025). Actual results vary by industry, SERP features, and branded keyword share. This is a directional estimate, not a precise prediction.',
    ctrTiers: CTR_TIERS.map((t) => ({
      rankRange: t.label,
      estimatedCtr: `${(t.ctr * 100).toFixed(0)}%`,
    })),
    opportunities: opportunitiesWithAdvice,
    prioritizeTop3: top3,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}

/**
 * Generates 3 prescription-grade recommendations for each opportunity keyword
 */
function generatePrescriptions(opp) {
  const query = opp.query;
  const position = opp.position;

  return [
    {
      type: 'Title Optimization',
      action: `Include "${query}" in <title> and H1, and add numbers or power words to boost CTR`,
      detail:
        position <= 6
          ? 'Already on page 1 — title optimization can directly lift CTR by 3-8 percentage points'
          : 'A compelling title helps the result stand out in SERPs; combined with ranking improvement, effects compound',
    },
    {
      type: 'AI Answer Capsule',
      action: `Add a concise direct-answer paragraph (40-60 words) targeting "${query}" at the top of the page to earn Google AI Overview citations`,
      detail:
        'AI Overview citations drive additional visibility — even without a ranking change, you can capture Featured Snippet traffic',
    },
    {
      type: 'Internal Linking',
      action: `Add internal links from high-traffic pages on your site pointing to this page, using "${query}" or close variants as anchor text`,
      detail:
        'Internal links pass PageRank and contextual signals, helping search engines understand the page topic and boosting target keyword rankings',
    },
  ];
}

module.exports = { toolDefinition, executeOpportunityRadar };
