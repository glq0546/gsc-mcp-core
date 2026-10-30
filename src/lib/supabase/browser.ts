/**
 * Supabase 浏览器端客户端（@supabase/ssr）
 *
 * 为什么不用 src/lib/supabase.ts 里的 `supabase`：
 *   那个实例用 supabase-js 把会话存 localStorage，服务端读不到 cookie，
 *   Route Handler 里 exchangeCodeForSession 会拿不到 PKCE code_verifier。
 *   走 OAuth 登录必须用 @supabase/ssr —— 会话存 cookie，前后端共享。
 *
 * 只供 'use client' 组件使用。本文件只读 NEXT_PUBLIC_* 变量，
 * 不含任何 service_role 信息，可以安全打进浏览器 bundle。
 */

'use client';

import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const missing = [
  !url && 'NEXT_PUBLIC_SUPABASE_URL',
  !key && 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
].filter(Boolean);

if (missing.length > 0) {
  throw new Error(
    `Missing environment variables: ${missing.join(', ')}\n` +
      `Make sure .env.local contains the Supabase credentials.`
  );
}

// 模块级单例：模块只求值一次，天然复用同一实例，
// 避免频繁创建 GoTrue 客户端（以及重复的锁/监听器）。
export const supabase = createBrowserClient(url!, key!);
