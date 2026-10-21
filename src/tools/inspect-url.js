/**
 * Tool: gsc_inspect_url（收录探测针）
 *
 * 调用 Google URL Inspection API，实时探测特定 URL 的收录状态。
 * 返回 verdict、coverageState、indexingState、canonical 等关键字段。
 *
 * 注意：URL Inspection API 配额较严格（约 200 次/天），
 * 仅用于针对关键页面的定向探测，不适合批量扫描。
 */

const { z } = require('zod');
const { getGscClient } = require('../gsc-client');

// ── Zod 输入 schema ────────────────────────────────────────────
const inputSchema = z.object({
  siteUrl: z
    .string()
    .describe('GSC 站点 URL，例如 https://glq-api.asia/'),
  inspectionUrl: z
    .string()
    .url()
    .describe(
      '要探测的目标 URL，例如 https://glq-api.asia/charge-decode/pages/intuit-qb'
    ),
});

// ── 工具定义 ──────────────────────────────────────────────────
const toolDefinition = {
  name: 'gsc_inspect_url',
  description:
    '调用 Google URL Inspection API，实时探测特定 URL 的收录状态、' +
    'Canonical、抓取状态。返回 verdict、coverageState、indexingState、' +
    'googleCanonical、userCanonical、lastCrawlTime 等关键字段。',
  inputSchema: inputSchema,
};

// ── 核心实现 ──────────────────────────────────────────────────
async function executeInspectUrl(args) {
  const { siteUrl, inspectionUrl } = inputSchema.parse(args);

  const searchconsole = getGscClient();

  // Step 1: 调用 URL Inspection API
  const response = await searchconsole.urlInspection.index.inspect({
    requestBody: {
      inspectionUrl,
      siteUrl,
    },
  });

  const result = response.data.inspectionResult;

  // Step 2: 提取关键字段（API 可能返回 null 的字段做兜底）
  const indexResult = result?.indexStatusResult || {};
  const inspectionResultLink = result?.inspectionResultLink || null;

  const output = {
    inspectionUrl,
    siteUrl,
    verdict: indexResult.verdict || 'UNKNOWN',
    // verdict 含义：
    //   PASS  — 页面已收录
    //   FAIL  — 页面未收录（有具体问题）
    //   NEUTRAL — 页面未被收录但无严重问题
    //   PARTIAL — 部分收录
    coverageState: indexResult.coverageState || '未知',
    indexingState: indexResult.indexingState || '未知',
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
    // 速查摘要：一行判断收录健康度
    summary: buildSummary(indexResult),
    // 原始 API 链接（可在浏览器中打开查看详情）
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
 * 根据 verdict 和 coverageState 生成一行速查摘要。
 */
function buildSummary(indexResult) {
  const verdict = indexResult?.verdict;
  const coverage = indexResult?.coverageState;

  if (verdict === 'PASS') {
    return `✅ 已收录 — Google 已索引此页面（coverage: ${coverage}）`;
  }
  if (verdict === 'FAIL') {
    return `❌ 收录失败 — 页面存在问题，需检查具体原因（coverage: ${coverage}）`;
  }
  if (verdict === 'NEUTRAL') {
    return `⚠️ 未收录 — 页面未被 Google 索引，但无明确错误（coverage: ${coverage}）`;
  }
  if (verdict === 'PARTIAL') {
    return `🔶 部分收录 — 页面部分索引（coverage: ${coverage}）`;
  }
  return `❓ 状态未知 — 无法确定收录状态（coverage: ${coverage}）`;
}

module.exports = { toolDefinition, executeInspectUrl };
