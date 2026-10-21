/**
 * Tool: gsc_opportunity_radar
 *
 * 扫描 GSC 数据，找出"高展现 + 低 CTR + 中等排名"的机会词。
 * 使用分段 CTR 模型预估增量收益，输出处方级建议。
 *
 * 分段 CTR 模型（行业经验值，估算非保证）：
 *   - 排名 1-3 位：预估 CTR 28%（首页顶部黄金位）
 *   - 排名 4-6 位：预估 CTR 12%（首页中下部）
 *   - 排名 7-10 位：预估 CTR 5%（首页底部 / 第二页顶部）
 *
 * 测算假设：
 *   1. CTR 曲线基于 Google 公开的行业基准研究（2024-2025 多项学术研究）
 *   2. 实际 CTR 因行业、品牌词 vs 非品牌词、SERP 特征（广告/精选摘要/People Also Ask）差异很大
 *   3. 增量收益 = (目标CTR - 当前CTR) × 展现量，假设排名优化后展现量不变
 *   4. 这是方向性估算，不是精确预测 — 真实效果取决于内容质量和竞争变化
 */

const { z } = require('zod');
const { getGscClient, getDateRange } = require('../gsc-client');

// ── 分段 CTR 模型常量 ─────────────────────────────────────────
const CTR_TIERS = [
  { min: 1, max: 3, ctr: 0.28, label: '1-3 位 (首页顶部)' },
  { min: 4, max: 6, ctr: 0.12, label: '4-6 位 (首页中下部)' },
  { min: 7, max: 10, ctr: 0.05, label: '7-10 位 (首页底部)' },
];

/**
 * 根据当前排名获取目标 CTR（取该排名所在分段的 CTR）。
 * 如果排名 > 10，返回最低分段 CTR。
 */
function getTargetCtr(avgPosition) {
  for (const tier of CTR_TIERS) {
    if (avgPosition >= tier.min && avgPosition <= tier.max) {
      return tier;
    }
  }
  // 排名 > 10，按第 7-10 位分段估算（假设优化到前 10）
  return CTR_TIERS[CTR_TIERS.length - 1];
}

// ── Zod 输入 schema ────────────────────────────────────────────
const inputSchema = z.object({
  siteUrl: z
    .string()
    .describe('GSC 站点 URL，例如 https://glq-api.asia/'),
  daysBack: z
    .number()
    .int()
    .min(1)
    .max(90)
    .default(7)
    .describe('回溯天数（默认 7 天）'),
  minImpressions: z
    .number()
    .int()
    .min(0)
    .default(100)
    .describe('最低展现量筛选（过滤低量噪音词，默认 100）'),
  maxPosition: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe('最高排名筛选（只关注排名 ≤ 此值的词，默认 20）'),
  topN: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('返回 Top N 机会词（默认 10）'),
});

// ── 工具定义 ──────────────────────────────────────────────────
const toolDefinition = {
  name: 'gsc_opportunity_radar',
  description:
    '扫描 Google Search Console 数据，找出高展现量但低 CTR 的 SEO 机会词。' +
    '使用分段 CTR 模型预估排名优化后的增量点击量，并给出 3 条处方级建议' +
    '（标题重构、AI 答案胶囊、内链加权）。输出包含扫描概览、Top 机会词列表、' +
    '增量收益预测和优先处理建议。',
  inputSchema: inputSchema,
};

// ── 核心实现 ──────────────────────────────────────────────────
async function executeOpportunityRadar(args) {
  const { siteUrl, daysBack, minImpressions, maxPosition, topN } =
    inputSchema.parse(args);

  const searchconsole = getGscClient();
  const { startDate, endDate } = getDateRange(daysBack);

  // Step 1: 拉取按 query 维度的数据
  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['query'],
      rowLimit: 250, // 拉取足够多的行用于筛选
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
              message: '该时间段内无 GSC 数据。请检查时间范围或站点 URL。',
              opportunities: [],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Step 2: 筛选 & 计算增量收益
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
      const currentCtr = row.ctr; // googleapis 返回的是 0-1 小数
      const position = row.position;

      // 分段 CTR 模型
      const tier = getTargetCtr(position);
      const targetCtr = tier.ctr;

      // 增量收益预测
      const currentClicks = clicks;
      const predictedClicks = impressions * targetCtr;
      const incrementalClicks = Math.round(predictedClicks - currentClicks);
      // 如果当前 CTR 已经高于目标 CTR（可能品牌词），不产生增量
      const positiveIncremental = Math.max(0, incrementalClicks);

      // 当前 CTR 百分比
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
    // 按增量收益降序排列
    .sort((a, b) => b.incrementalClicks - a.incrementalClicks)
    .slice(0, topN);

  // Step 3: 生成处方建议
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

  // Step 4: 确定优先处理的 Top 3 词
  const top3 = opportunitiesWithAdvice.slice(0, 3).map((o) => ({
    query: o.query,
    reason: `排名 ${o.currentPosition} → 目标 ${o.targetTier}，预估增量 +${o.incrementalClicks} 点击/周期`,
  }));

  // Step 5: 构建输出
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
      '分段 CTR 模型基于行业基准研究（2024-2025），实际效果因行业、SERP 特征、品牌词占比差异较大。此为方向性估算，非精确预测。',
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
 * 为每个机会词生成 3 条处方级建议
 */
function generatePrescriptions(opp) {
  const query = opp.query;
  const position = opp.position;

  return [
    {
      type: '标题重构',
      action: `在 <title> 和 H1 中包含 "${query}" 关键词，并添加数字或情感词提升 CTR`,
      detail:
        position <= 6
          ? '当前已在首页，标题优化可直接提升 CTR 3-8 个百分点'
          : '标题优化有助于从搜索结果中脱颖而出，配合排名提升效果叠加',
    },
    {
      type: 'AI 答案胶囊',
      action: `在页面顶部添加针对 "${query}" 的直接回答段落（40-60 字），争取 Google AI Overview 引用`,
      detail:
        'AI Overview 引用可带来额外曝光，即使排名不变也能获得 Featured Snippet 流量',
    },
    {
      type: '内链加权',
      action: `从本站高流量页面添加指向该页面的内链，锚文本使用 "${query}" 或其变体`,
      detail:
        '内链传递 PageRank 和上下文信号，帮助搜索引擎理解页面主题并提升目标关键词排名',
    },
  ];
}

module.exports = { toolDefinition, executeOpportunityRadar };
