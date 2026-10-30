import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/src/lib/supabase/server';

/**
 * GET /auth/callback
 *
 * Supabase OAuth 登录的回调落地页（PKCE 流程）。
 *
 * 浏览器流程：
 *   1. 'use client' 中 supabase.auth.signInWithOAuth() 把 code_verifier 写进 cookie，
 *      然后把浏览器跳到 https://<ref>.supabase.co/auth/v1/authorize?provider=google...
 *   2. Supabase 与 Google 完成握手，回跳到这里并带 ?code=xxxx
 *   3. 我们在服务端用 exchangeCodeForSession(code) 换取 session + provider_refresh_token
 *   4. 把 Google 的 refresh token 交给 service_role 写入 users_tokens
 *
 * ⚠️ 为什么必须在服务端做第 3、4 步：
 *   - provider_refresh_token 是长期凭据，不能落到浏览器 localStorage / JS 内存里；
 *   - users_tokens 开启了 RLS 且零策略，浏览器用的 publishable key 写不进去。
 */

export const dynamic = 'force-dynamic';

/** 失败时统一回首页并带上错误码，方便前端展示。 */
function redirectWithError(request: Request, code: string, detail?: string) {
  const url = new URL('/', request.url);
  url.searchParams.set('auth_error', code);
  if (detail) url.searchParams.set('auth_error_detail', detail.slice(0, 200));
  return NextResponse.redirect(url);
}

/** 统一的成功落地页。 */
function redirectWithSuccess(request: Request) {
  return NextResponse.redirect(new URL('/?auth=connected', request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // Supabase / Google 可能直接带 error 回跳（如用户点了取消）
  const oauthError =
    url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (oauthError) {
    return redirectWithError(request, 'oauth_denied', oauthError);
  }

  if (!code) {
    return redirectWithError(request, 'missing_code');
  }

  const supabase = createSupabaseServerClient();

  // ── 1. code → session ────────────────────────────────────────
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return redirectWithError(request, 'exchange_failed', error?.message);
  }

  const { session } = data;
  const email = session.user.email?.toLowerCase().trim();

  // Supabase 会话本身不依赖邮箱，但 users_tokens 用邮箱做租户主键。
  // 邮箱缺失说明 Google 账号没授权 email scope，属于配置问题。
  if (!email) {
    return redirectWithError(request, 'missing_email');
  }

  const googleRefreshToken = session.provider_refresh_token;
  const googleAccessToken = session.provider_token;

  // ── 2. 落库 ──────────────────────────────────────────────────
  // 注意：refresh token 缺失时不能直接判失败 —— 用户可能之前授权过，
  // Google 不再重复下发。storeProviderTokens() 会回落到库里已有的 refresh token，
  // 只有在「新 token 没有 + 库里也没有」时才抛错。
  try {
    // 动态导入，确保 service_role 相关逻辑只在 Node 运行时被加载
    const { storeProviderTokens } = await import('@/src/lib/supabase');
    await storeProviderTokens({
      userEmail: email,
      providerToken: googleAccessToken,
      providerRefreshToken: googleRefreshToken,
    });
  } catch (error) {
    // 打印完整错误对象，而不是只取 message：
    // PostgREST 的关键线索多半在 details / hint / code 里（hint 常常直接给出修复用的 SQL），
    // 前端只显示截断后的短消息，所以真实报错必须看这里。
    console.error('Callback Error:', error);

    // ⚠️ 这里抛出的不一定是 Error 实例：postgrest-js 在 fetch 层失败等路径上
    // 会抛普通对象，String(err) 就退化成 "[object Object]"（线上就是这么丢的信息）。
    // 所以先取 message，取不到再序列化整个对象，保证前端能看到人话。
    const message =
      (error as { message?: string } | null | undefined)?.message ||
      JSON.stringify(error);

    // 用户已经通过 Supabase 登录成功，数据库没写成功时明确区分开，
    // 方便前端提示“登录成功但未绑定 GSC”。
    return redirectWithError(
      request,
      googleRefreshToken ? 'store_failed' : 'no_provider_refresh_token',
      message
    );
  }

  return redirectWithSuccess(request);
}
