/**
 * Supabase 客户端
 *
 * 环境变量（来自 .env.local）：
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（sb_publishable_ 开头的新格式密钥）
 *   - SUPABASE_SERVICE_ROLE_KEY（sb_secret_ 开头的密钥，仅服务端可用，绝不能加 NEXT_PUBLIC_ 前缀）
 *
 * 说明：
 *   1. 当前是多租户改造的第一步，先只初始化客户端 + 提供核心业务表的轻量仓储函数，
 *      尚未引入 Supabase Auth 登录会话（后续接 Google OAuth 时再加 @supabase/ssr 的
 *      cookie 会话客户端）。
 *   2. 浏览器与 Node 运行时走同一份初始化逻辑（本文件不依赖 next/headers 等
 *      Server-Only API），可在 Route Handler / Client Component 中复用。
 *   3. 服务端（Route Handler、Node 脚本、MCP）不需要把会话写进 localStorage，
 *      因此在非浏览器环境关闭 persistSession / autoRefreshToken，避免无意义的
 *      后台刷新定时器与 “storage not available” 警告。
 *   4. 本文件含 supabaseAdmin（service_role）。它只应在服务端使用：
 *      - 不要在 'use client' 组件里 import；
 *      - service_role 绕过了 RLS，一旦泄露等于整个数据库裸奔。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 缺少配置时尽早失败，避免请求打到 undefined URL 得到难以定位的报错
const missing = [
  !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
  !supabaseKey && 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
].filter(Boolean);

if (missing.length > 0) {
  throw new Error(
    `Missing environment variables: ${missing.join(', ')}\n` +
      `Make sure .env.local contains the Supabase credentials.`
  );
}

const isBrowser = typeof window !== 'undefined';

/**
 * 单例 Supabase 客户端（publishable key，受 RLS 约束）。
 * 浏览器端复用同一实例（HMR 期间也不会重复创建）；服务端每个请求共用只读客户端即可，
 * 因为当前未使用 Supabase Auth 的 cookie 会话。
 */
export const supabase: SupabaseClient = createClient(supabaseUrl!, supabaseKey!, {
  auth: {
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: isBrowser,
  },
});

/** 直接返回共享的 Supabase 客户端。 */
export function getSupabaseClient(): SupabaseClient {
  return supabase;
}

// ── Admin 客户端（service_role，绕过 RLS）──────────────────────
// users_tokens 开启了 RLS 且零策略，publishable key 读不到任何行，
// 所以服务端查 Google refresh token 必须走这个客户端。

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** service_role key 是否已配置（用于给出可读的报错，而不是 undefined URL 之类的怪错误）。 */
export function hasAdminClient(): boolean {
  return Boolean(serviceRoleKey);
}

let adminClient: SupabaseClient | null = null;

/**
 * 返回 service_role 客户端（绕过 RLS）。
 *
 * - 懒加载单例：未配置 key 时才抛错，不会因为某个模块没用到 admin 就让整个应用启动失败。
 * - 浏览器环境直接拒绝：service_role 绝不能被前端代码拿到。
 *
 * @throws 在浏览器环境中调用，或 .env.local 缺少 SUPABASE_SERVICE_ROLE_KEY 时抛出
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (isBrowser) {
    throw new Error(
      'getSupabaseAdmin() cannot be used in the browser: service_role bypasses RLS. ' +
        'Call it from server code (Route Handler / Server Component / Node script) only.'
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      'Missing environment variable: SUPABASE_SERVICE_ROLE_KEY\n' +
        'Add it to .env.local (Supabase Dashboard > Project Settings > API Keys > secret key).'
    );
  }

  if (!adminClient) {
    adminClient = createClient(supabaseUrl!, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return adminClient;
}

// ── users_tokens：Google OAuth refresh token 存储 ─────────────
// 与 supabase/migrations/0001_create_users_tokens.sql 保持一致

export interface UserTokenRow {
  id: string;
  user_email: string;
  google_refresh_token: string;
  provider_token: string | null;
  created_at: string;
}

/**
 * 按邮箱读取某个租户的 Google 授权记录；不存在返回 null。
 *
 * 走 service_role 客户端：users_tokens 的 RLS 不放行任何普通角色，
 * 用 publishable key 查询只会得到空结果（看起来像“用户没授权”，实则是被拦截）。
 */
export async function getUserToken(userEmail: string): Promise<UserTokenRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('users_tokens')
    .select('id, user_email, google_refresh_token, provider_token, created_at')
    .eq('user_email', userEmail.toLowerCase().trim())
    .maybeSingle();

  if (error) throw error;
  return (data as UserTokenRow | null) ?? null;
}

/**
 * 写入 / 更新某个租户的 refresh token。
 * 依赖 user_email 上的列级唯一约束做 upsert，同一用户重复授权只更新 token 而不新增行。
 */
export async function upsertUserToken(
  userEmail: string,
  googleRefreshToken: string
): Promise<UserTokenRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('users_tokens')
    .upsert(
      {
        user_email: userEmail.toLowerCase().trim(),
        google_refresh_token: googleRefreshToken,
      },
      { onConflict: 'user_email' }
    )
    .select('id, user_email, google_refresh_token, created_at')
    .single();

  if (error) throw error;
  return data as UserTokenRow;
}

// ── Supabase OAuth 登录 → users_tokens ───────────────────────

/** 一次 OAuth 登录能拿到的 Google 凭据。字段来自 supabase.auth session。 */
export interface StoreProviderTokensInput {
  userEmail: string;
  /** session.provider_token：Google access_token，短期有效 */
  providerToken?: string | null;
  /** session.provider_refresh_token：Google refresh token，长期有效 */
  providerRefreshToken?: string | null;
}

/**
 * 登录授权成功后，把 Google 凭据写入 users_tokens。
 *
 * 与 upsertUserToken() 的区别：
 *   - 本函数额外保存 provider_token，供登录后立刻调用 GSC API；
 *   - refresh token 优先取 provider_refresh_token，缺失时回落到库里已有的值，
 *     避免“用户第二次登录 Google 没再下发 refresh_token”把长期凭据覆盖成空。
 *
 * 为什么必须有 refreshToken：0001 迁移里 google_refresh_token 是 not null，
 * 且没有默认值。没有 refresh token 时写入会直接失败 —— 这里提前给出明确报错，
 * 而不是让 PostgREST 返回一句难以理解的 not-null violation。
 *
 * @throws 当既没有新下发的 refresh token、库里也没有历史记录时抛出
 */
export async function storeProviderTokens({
  userEmail,
  providerToken,
  providerRefreshToken,
}: StoreProviderTokensInput): Promise<{ row: UserTokenRow; refreshTokenUpdated: boolean }> {
  const normalizedEmail = userEmail.toLowerCase().trim();

  let refreshToken = providerRefreshToken?.trim() || null;
  const refreshTokenUpdated = Boolean(refreshToken);

  if (!refreshToken) {
    const existing = await getUserToken(normalizedEmail);
    refreshToken = existing?.google_refresh_token ?? null;
  }

  if (!refreshToken) {
    throw new Error(
      'Google did not return a refresh token and no stored credential exists for ' +
        `${normalizedEmail}. Re-run the OAuth consent flow with queryParams ` +
        `{ access_type: 'offline', prompt: 'consent' }.`
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from('users_tokens')
    .upsert(
      {
        user_email: normalizedEmail,
        google_refresh_token: refreshToken,
        provider_token: providerToken?.trim() || null,
      },
      { onConflict: 'user_email' }
    )
    .select('id, user_email, google_refresh_token, provider_token, created_at')
    .single();

  if (error) throw error;

  return { row: data as UserTokenRow, refreshTokenUpdated };
}

