/**
 * Supabase 服务端客户端（@supabase/ssr，读 / 写 cookie）
 *
 * 用途：Route Handler 与 Server Component 里读取当前登录会话。
 * 与 browser.ts 的区别：这里没有 "use client"，并接入了 next/headers 的 cookie。
 *
 * ⚠️ 与 src/lib/supabase.ts 的分工：
 *   - 本文件：用户登录会话（publishable key + RLS）
 *   - src/lib/supabase.ts 的 getSupabaseAdmin()：service_role，写 users_tokens
 *   两者职责不同，不要混用。
 *
 * ⚠️ 每个请求都必须调用 createSupabaseServerClient() 新建实例，
 *    绝不能跨请求复用（会把 A 用户的 cookie 泄漏给 B 用户）。
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// 自定义 fetch：目前只是原生 fetch 的透传。
//
// ⚠️ 为什么这里不再注入 HttpsProxyAgent：
//   Node 的原生 fetch（undici）不认 `agent` 选项，只认 `dispatcher`，
//   而 HttpsProxyAgent 是 http.Agent，不能当 dispatcher 用 —— 注入了也无效。
//   需要代理时请用环境变量，由 Node 自己接管：
//     $env:HTTPS_PROXY='http://127.0.0.1:7892'; $env:NODE_USE_ENV_PROXY='1'; npm run dev
const customFetch = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

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

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // 在 Server Component 里调用 set 会抛错（响应头已发出）。
          // 这里忽略即可：登录流程本身就在 Route Handler 里，cookie 能正常写入。
        }
      },
    },
    global: {
      fetch: customFetch as typeof fetch,
    },
  });
}
