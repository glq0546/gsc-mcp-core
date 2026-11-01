/**
 * MCP API Key —— Header 鉴权（服务端专用）
 *
 * 为什么需要它：
 *   Web 控制台用 Supabase 登录 Cookie 鉴权，但 MCP 客户端（Claude Desktop、
 *   Cursor、Codex…）是纯 HTTP 调用方，不会带浏览器 Cookie。因此给每个租户
 *   发一把长期 API Key，客户端用
 *       Authorization: Bearer <API_KEY>
 *   访问 /api/mcp，服务端据此反查用户，再拿该用户的 Google refresh token 调 GSC。
 *
 * 存储设计：
 *   users_tokens.api_key_hash = sha256(明文 Key) 的十六进制串（见 0003 迁移）。
 *   数据库里没有明文，即使泄露也无法反推出可用的 Key。
 *
 * ⚠️ 本文件只能被服务端代码 import：
 *   - 它依赖 node:crypto；
 *   - 它通过 getSupabaseAdmin() 使用 service_role，绕过 RLS。
 *   绝不能出现在任何 'use client' 组件里。
 */

import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from './supabase';

/** Key 明文前缀，方便用户和日志里一眼认出这是 GSC MCP 的 Key。 */
export const API_KEY_PREFIX = 'gsc_live_';

/** 32 字节随机数 → base64url 后约 43 字符，熵足够（远超 128 位）。 */
const API_KEY_RANDOM_BYTES = 32;

/** 合法 Key 的长度区间，用于在查库前快速拒绝明显的垃圾请求。 */
const MIN_KEY_LENGTH = 32;
const MAX_KEY_LENGTH = 200;

/** 一次成功鉴权得到的租户身份。 */
export interface ApiKeyIdentity {
  /** users_tokens.id（uuid） */
  userId: string;
  userEmail: string;
  /** 该租户自己的 Google refresh token */
  googleRefreshToken: string;
}

/**
 * 生成一把新的 API Key（明文只在此刻存在，之后只存摘要）。
 * 未来的「生成 Key」页面直接调用本函数，展示一次后即丢弃明文。
 */
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(API_KEY_RANDOM_BYTES).toString('base64url')}`;
}

/**
 * 计算 Key 的 sha256 摘要（十六进制小写）。
 * 与 scripts/create-api-key.js 保持同一算法 —— 两处必须一致。
 */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

/**
 * 从 Authorization 头里取出 Bearer 凭据。
 * 兼容大小写（Bearer / bearer），不符合格式返回 null。
 */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;

  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;

  return match[1] ?? null;
}

/** 查库前的本地格式校验：拦掉空串、超长串、带空白的串，避免无意义的 DB 往返。 */
function looksLikeApiKey(rawKey: string): boolean {
  if (rawKey.length < MIN_KEY_LENGTH || rawKey.length > MAX_KEY_LENGTH) return false;
  // 只允许可见 ASCII，防止把换行/控制字符塞进 header
  return /^[\x21-\x7e]+$/.test(rawKey);
}

/**
 * 用明文 Key 反查租户。
 *
 * @returns 匹配到的租户身份；Key 不存在 / 格式不对 / 该租户没有 refresh token 时返回 null
 * @throws 数据库不可用、缺 service_role key、或 0003 迁移未执行时抛出（由调用方转成 5xx）
 */
export async function resolveApiKey(rawKey: string): Promise<ApiKeyIdentity | null> {
  if (!looksLikeApiKey(rawKey)) return null;

  const { data, error } = await getSupabaseAdmin()
    .from('users_tokens')
    .select('id, user_email, google_refresh_token')
    .eq('api_key_hash', hashApiKey(rawKey))
    .maybeSingle();

  if (error) {
    // 42703 = undefined_column：多半是 0003 迁移还没跑
    if (error.code === '42703') {
      throw new Error(
        'users_tokens.api_key_hash does not exist. Run ' +
          'supabase/migrations/0003_add_api_keys.sql in the Supabase SQL Editor, ' +
          "then notify pgrst, 'reload schema'."
      );
    }
    throw error;
  }

  if (!data) return null;

  const row = data as {
    id: string;
    user_email: string;
    google_refresh_token: string | null;
  };

  // 有 Key 但没 refresh token：说明用户还没完成 Google 授权，等同于“无凭据可用”
  if (!row.google_refresh_token) return null;

  return {
    userId: row.id,
    userEmail: row.user_email,
    googleRefreshToken: row.google_refresh_token,
  };
}

/**
 * 记录 Key 的最后使用时间（失败不影响主流程）。
 * 页面上用来展示「这把 Key 最近有没有在用」。
 */
export async function markApiKeyUsed(userId: string): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from('users_tokens')
      .update({ api_key_last_used_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (err) {
    console.warn('[mcp] Failed to update api_key_last_used_at:', err);
  }
}
