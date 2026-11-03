/**
 * /api/mcp 防刷 —— 每租户每日调用配额（服务端专用）
 *
 * 计数落在 users_tokens 的两列（见 supabase/migrations/0004）：
 *   mcp_daily_calls     当天已调用次数
 *   mcp_last_call_date  该计数所属的 UTC 日期
 *
 * 并发正确性不在 TypeScript 这一层解决：
 *   判断 + 自增 + 跨天重置全部在 public.increment_mcp_daily_calls() 里用
 *   一条带条件的 UPDATE 完成（行锁 + READ COMMITTED 的 EvalPlanQual 重校验）。
 *   应用层若写成「先查今天几次、再 +1 写回」，并发下会丢计数。
 *
 * ⚠️ 本文件只能被服务端代码 import：它依赖 getSupabaseAdmin()（service_role）。
 *    绝不能出现在任何 'use client' 组件里。
 */

import { getSupabaseAdmin } from './supabase';

/** 免费版每日配额。/api/mcp 每次 HTTP 请求（含 initialize / tools/list）都计 1 次。 */
export const MCP_DAILY_LIMIT = 50;

/** 一次配额检查的结果。allowed=false 表示本次请求应当被 429 拒绝。 */
export interface McpQuota {
  /** 本次请求是否放行；true 时计数已包含本次调用 */
  allowed: boolean;
  /** 本次之后的当天已用次数（超限时为「当前已满额」的数值，不再增长） */
  used: number;
  /** 生效的每日上限 */
  limit: number;
  /** 计数所属日期（UTC，YYYY-MM-DD）；历史数据可能为 null */
  callDate: string | null;
}

/** increment_mcp_daily_calls() 的返回行（PostgREST 对 returns table 一律回数组）。 */
interface QuotaRpcRow {
  allowed: boolean;
  used: number | null;
  daily_limit: number | null;
  call_date: string | null;
}

/** 迁移 0004 未执行时 PostgREST / Postgres 抛出的错误码。 */
const MISSING_MIGRATION_CODES = new Set([
  '42883', // undefined_function：函数不存在
  'PGRST202', // PostgREST schema cache 里找不到该函数
  '42703', // undefined_column：mcp_daily_calls 列不存在
]);

/**
 * 原子地消费一次配额（放行才扣次数）。
 *
 * 语义：
 *   - 进入 /api/mcp 且 Key 合法后调用；
 *   - 当天第 1 次 → 计数重置为 1；
 *   - 当天未超限 → 计数 +1；
 *   - 当天已到上限 → allowed=false，计数保持不变。
 *
 * @throws 迁移 0004 未执行、缺 service_role key、数据库不可用时抛出（由调用方决定
 *         放行还是 5xx；当前 /api/mcp 选择 fail-open + 日志）
 */
export async function consumeMcpDailyQuota(
  userId: string,
  dailyLimit: number = MCP_DAILY_LIMIT
): Promise<McpQuota> {
  const { data, error } = await getSupabaseAdmin().rpc('increment_mcp_daily_calls', {
    p_user_id: userId,
    p_daily_limit: dailyLimit,
  });

  if (error) {
    if (MISSING_MIGRATION_CODES.has(error.code ?? '')) {
      throw new Error(
        'users_tokens.mcp_daily_calls / increment_mcp_daily_calls() does not exist. Run ' +
          'supabase/migrations/0004_add_mcp_daily_quota.sql in the Supabase SQL Editor, ' +
          "then notify pgrst, 'reload schema'."
      );
    }
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as QuotaRpcRow | undefined;
  if (!row) {
    // 函数合同是「任何情况都回一行」：空结果说明函数被改坏或 PostgREST 行为异常
    throw new Error('increment_mcp_daily_calls() returned no row.');
  }

  return {
    allowed: Boolean(row.allowed),
    used: Number(row.used ?? 0),
    limit: Number(row.daily_limit ?? dailyLimit),
    callDate: row.call_date ?? null,
  };
}

/** 距离下一个 UTC 零点还有多少秒，用于 429 的 Retry-After 头。 */
export function secondsUntilNextUtcMidnight(now: Date = new Date()): number {
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  // 至少 1 秒：Retry-After: 0 会被部分客户端当成“立刻重试”
  return Math.max(1, Math.ceil((nextUtcMidnight - now.getTime()) / 1000));
}

/**
 * 标准限流响应头（成功与 429 都带），方便 MCP 客户端自己节流：
 *   X-RateLimit-Limit / Remaining / Used，X-RateLimit-Reset（Unix 秒）
 */
export function rateLimitHeaders(quota: McpQuota): Record<string, string> {
  const resetAt = Math.floor(Date.now() / 1000) + secondsUntilNextUtcMidnight();
  return {
    'X-RateLimit-Limit': String(quota.limit),
    'X-RateLimit-Remaining': String(Math.max(0, quota.limit - quota.used)),
    'X-RateLimit-Used': String(quota.used),
    'X-RateLimit-Reset': String(resetAt),
  };
}
