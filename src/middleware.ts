/**
 * Supabase 认证中间件：刷新 token 并回写 cookie
 *
 * ⚠️ 文件位置说明：
 *   项目里有 `src/lib`，符合 Next.js 的 src 目录约定，因此本文件放在
 *   `src/middleware.ts`（Next.js 官方支持的位置之一），效果等同于根目录
 *   `middleware.ts`。之所以不放在根目录：根目录已被一个**同名空目录**
 *   `middleware.ts` 占用（目录无法作为文件被加载）。
 *   清理掉那个空目录后，可把本文件移到根目录 `middleware.ts`，二者不要同时存在。
 *
 * 为什么需要它：
 *   浏览器端 access_token 只有 1 小时有效期。@supabase/ssr 的浏览器客户端
 *   只在「浏览器 JS 发起请求」时才会自动刷新；而 /api/radar、/api/inspect
 *   这类 Route Handler 是服务端请求，服务端读 cookie 时拿到的可能是过期的
 *   access_token → createSupabaseServerClient().auth.getSession() 返回空
 *   → 前端看到 401 Unauthorized。
 *
 *   中间件在每次请求前调用 supabase.auth.getUser()，用 refresh_token 换新的
 *   access_token，并把新 cookie 同时写到：
 *     - req.cookies  → 让**本次**请求的 Route Handler 立刻读到新 token
 *     - response     → 让浏览器保存，供后续请求使用
 *
 * 为什么「隐身模式正常、普通模式失败」：隐身窗口是全新登录，cookie 里的
 * access_token 还很新；普通窗口里的是几小时前登录留下的旧 token，已过期。
 *
 * ⚠️ 中间件跑在 Edge 运行时：不能 import src/lib/supabase/server.ts
 *    （它用了 next/headers 的 cookies()，只适用于 Server Component / Route Handler），
 *    所以按 @supabase/ssr 官方推荐写法直接 createServerClient + NextRequest/NextResponse。
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // 透传响应；若刷新了 token 就基于它重建（保留 req 上的 header 改动）
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // ① 写回请求：让同一次请求里的 Route Handler / Server Component 读到新 token
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));

          // ② 写回响应：让浏览器保存新 cookie，供后续请求使用
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 触发刷新：getUser() 会校验 token，必要时用 refresh_token 换新，
  // 新会话经上面的 setAll() 写回 cookie。
  // 用 getUser() 而非 getSession()：后者只读 cookie，不校验也不刷新。
  await supabase.auth.getUser();

  return res;
}

export const config = {
  // 排除静态资源，避免给图片/JS/CSS 请求做无意义的鉴权与 token 刷新
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
