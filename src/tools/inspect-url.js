/**
 * Tool: gsc_inspect_url
 *
 * Calls the Google URL Inspection API to check the real-time index status of a specific URL.
 * Returns key fields: verdict, coverageState, indexingState, canonical, etc.
 *
 * Note: The URL Inspection API has strict quotas (~200 queries/day).
 * Use it only for targeted inspection of key pages — not for bulk scanning.
 */

const { z } = require('zod');
const { getGscClient } = require('../gsc-client');

// ── Zod input schema ────────────────────────────────────────────
const inputSchema = z.object({
  siteUrl: z
    .string()
    .describe('GSC site URL, e.g. https://example.com/'),
  inspectionUrl: z
    .string()
    .url()
    .describe(
      'Target URL to inspect, e.g. https://example.com/specific-page'
    ),
});

// ── Tool definition ─────────────────────────────────────────────
const toolDefinition = {
  name: 'gsc_inspect_url',
  description:
    'Calls the Google URL Inspection API to check the real-time index status, ' +
    'canonical URL, and crawl state of a specific page. Returns verdict, coverageState, ' +
    'indexingState, googleCanonical, userCanonical, lastCrawlTime, and other key fields.',
  inputSchema: inputSchema,
};

// ── Core implementation ─────────────────────────────────────────
async function executeInspectUrl(args) {
  const { siteUrl, inspectionUrl } = inputSchema.parse(args);

  const searchconsole = getGscClient();

  // Step 1: Call URL Inspection API
  const response = await searchconsole.urlInspection.index.inspect({
    requestBody: {
      inspectionUrl,
      siteUrl,
    },
  });

  const result = response.data.inspectionResult;

  // Step 2: Extract key fields (with fallbacks for potentially null API responses)
  const indexResult = result?.indexStatusResult || {};
  const inspectionResultLink = result?.inspectionResultLink || null;

  const output = {
    inspectionUrl,
    siteUrl,
    verdict: indexResult.verdict || 'UNKNOWN',
    // verdict meanings:
    //   PASS    — page is indexed
    //   FAIL    — page is not indexed (has specific issues)
    //   NEUTRAL — page is not indexed but has no critical errors
    //   PARTIAL — partially indexed
    coverageState: indexResult.coverageState || 'Unknown',
    indexingState: indexResult.indexingState || 'Unknown',
    googleCanonical: indexResult.googleCanonical || null,
    userCanonical: indexResult.userCanonical || null,
    lastCrawlTime: indexResult.lastCrawlTime || null,
    richResultsResult: indexResult.richResultsResult
      ? {
          verdict: indexResult.richResultsResult.verdict || 'UNKNOWN',
          detectedItems: (
            indexResult.richResultsResult.detectedItems || []
          ).map((item) => ({
            richResultType: item.richResultType,
            items: (item.items || []).map((i) => i.name),
          })),
        }
      : null,
    // Quick summary: single-line index health assessment
    summary: buildSummary(indexResult),
    // Raw API link (open in browser for full details)
    inspectionLink: inspectionResultLink,
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
 * Generates a single-line quick summary based on verdict and coverageState.
 */
function buildSummary(indexResult) {
  const verdict = indexResult?.verdict;
  const coverage = indexResult?.coverageState;

  if (verdict === 'PASS') {
    return `✅ Indexed — Google has indexed this page (coverage: ${coverage})`;
  }
  if (verdict === 'FAIL') {
    return `❌ Indexing failed — page has issues, investigate specifics (coverage: ${coverage})`;
  }
  if (verdict === 'NEUTRAL') {
    return `⚠️ Not indexed — page is not in the Google index, but no critical errors found (coverage: ${coverage})`;
  }
  if (verdict === 'PARTIAL') {
    return `🔶 Partially indexed — page is partially indexed (coverage: ${coverage})`;
  }
  return `❓ Unknown status — unable to determine index status (coverage: ${coverage})`;
}

module.exports = { toolDefinition, executeInspectUrl };
