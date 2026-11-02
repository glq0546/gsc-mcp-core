/**
 * 自助生成 / 轮换 MCP API Key —— POST /api/keys/generate
 *
 * 鉴权：Supabase 登录 Cookie（与 /api/radar、/api/inspect 同一套）。
 *       浏览器带不了「这个用户是谁」以外的信息，所以租户身份只能从 session 取，
 *       绝不接受请求体里传来的 email —— 否则任何人可以给任意租户签发 Key。
 *
 * 写库：users_tokens 的 RLS 是零策略，publishable key 写不进去，
 *       因此复用 src/lib/api-keys.ts 里的 createApiKeyForUser()（内部走 service_role）。
 *
 * 返回：明文 Key 只在这里出现这一次，前端展示后应立即丢弃。
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../src/lib/supabase/server';
import { createApiKeyForUser, getApiKeyMetadata } from '../../../../src/lib/api-keys';

// node:crypto + service_role 都要求 Node runtime，不能用 Edge
export const runtime = 'nodejs';
// 每次请求都要签发新 Key，绝不能被缓存
export const dynamic = 'force-dynamic';

/** POST：签发一把新 Key（旧 Key 立即失效）。 */
export async function POST() {
  // ── Step 1: 确认是谁登录的 ────────────────────────────────────
  let email: string | null = null;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    email = session?.user?.email ?? null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to read session: ${message}` },
      { status: 500 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: No active session or user email.' },
      { status: 401 }
    );
  }

  // ── Step 2: 生成 + 存摘要（明文只在响应里出现一次）───────────
  try {
    const { apiKey, apiKeyPrefix, createdAt } = await createApiKeyForUser(email);

    return NextResponse.json(
      {
        success: true,
        data: { apiKey, apiKeyPrefix, createdAt },
      },
      // 明文 Key 不允许被任何中间层缓存
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/keys/generate] Failed to issue API key:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** GET：只回当前 Key 的前缀与生成时间，用于页面提示「已签发过」——永远不回明文。 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: No active session or user email.' },
        { status: 401 }
      );
    }

    const metadata = await getApiKeyMetadata(email);

    return NextResponse.json(
      { success: true, data: metadata },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/keys/generate] Failed to read API key metadata:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
