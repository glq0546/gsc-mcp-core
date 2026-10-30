/**
 * Supabase 连通性自检脚本
 *
 * 验证 .env.local 里的 Supabase 配置是否可用：
 *   1. URL / 两个 key 是否已填写、格式是否正确
 *   2. 项目能否建立 HTTPS 连接（网络 / 代理）
 *   3. users_tokens 表是否可访问，且 service_role 能否绕过 RLS 读到数据
 *
 * 判断依据：
 *   - service_role   查 users_tokens：能正常返回行数 ✅（说明绕过了 RLS）
 *   - publishable key 查 users_tokens：被拦截 / 0 行 ✅（RLS 生效）
 *   - 42P01 → 表不存在，需执行 supabase/migrations/0001_create_users_tokens.sql
 *   - PGRST301 / invalid api key → key 填错
 *   - 网络错误 → 本机需代理时提示设置 HTTPS_PROXY + NODE_USE_ENV_PROXY=1
 *
 * 用法：npm run test:supabase
 *      需要代理：$env:HTTPS_PROXY='http://127.0.0.1:7892'; $env:NODE_USE_ENV_PROXY='1'; npm run test:supabase
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 检查环境变量
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error('\n❌ 缺少环境变量：');
  missing.forEach((k) => console.error(`   - ${k}`));
  console.error('\n   请在 .env.local 中补充 Supabase 配置');
  console.error('   （Dashboard > Project Settings > API Keys：publishable key + secret key）\n');
  process.exit(1);
}

const isPlaceholder = (v) => /REPLACE|xxxx|your-project-ref/i.test(v);

/** 只打印前缀 + 长度，避免把密钥写进终端日志 */
const maskKey = (key) => `${key.slice(0, 12)}... (${key.length} 字符)`;

/** 统一的网络错误提示（Node 的 fetch 不走系统代理） */
function explainNetworkError(err) {
  console.error(`❌ 网络请求失败: ${err.message}`);
  if (err.cause && err.cause.code) {
    console.error(`   底层错误码: ${err.cause.code}`);
  }
  console.error('\n   如果本机需要代理，请这样运行：');
  console.error(
    "   PowerShell: $env:HTTPS_PROXY='http://127.0.0.1:7892'; $env:NODE_USE_ENV_PROXY='1'; npm run test:supabase\n"
  );
}

/** 根据 PostgREST 错误码给出可执行建议 */
function explainTableError(error, keyLabel) {
  if (error.code === '42P01') {
    console.error('❌ 表 public.users_tokens 不存在。请到 SQL Editor 执行：');
    console.error('   supabase/migrations/0001_create_users_tokens.sql');
    return;
  }
  if (error.code === 'PGRST301' || /invalid api key/i.test(error.message)) {
    console.error(`❌ ${keyLabel} 无效：${error.message}`);
    console.error('   请到 Dashboard > Project Settings > API Keys 重新复制');
    return;
  }
  if (error.code === 'PGRST205' || /Could not find the table/i.test(error.message)) {
    console.error('❌ PostgREST 的 schema cache 里没有这个表，但项目连接本身是正常的。');
    console.error(`   ${error.code} / ${error.message}`);
    console.error('\n   请在 Supabase Dashboard → SQL Editor 依次确认：');
    console.error("   a) select to_regclass('public.users_tokens');  -- NULL 表示表真的不存在");
    console.error('   b) select grantee, privilege_type from information_schema.role_table_grants');
    console.error("        where table_name = 'users_tokens';  -- 确认 service_role 有权限");
    console.error("   c) notify pgrst, 'reload schema';  -- 手动刷新 PostgREST 缓存");
    console.error('\n   最常见原因：建表 SQL 执行在了另一个 Supabase 项目里，');
    console.error('   请核对 Dashboard 左上角的 project ref 是否与 .env.local 的 URL 一致。');
    return;
  }
  console.error(`❌ ${keyLabel} 查询失败: ${error.code} / ${error.message}`);
}

/** 统一的失败退出：设置退出码而不硬中断，避免 Node 在 fetch 未收尾时打印 libuv 断言 */
function fail() {
  process.exitCode = 1;
  console.error('');
}

async function main() {
  console.log('\n========================================');
  console.log('  Supabase 连通性自检');
  console.log('========================================\n');
  console.log(`URL:              ${SUPABASE_URL}`);
  console.log(`publishable key:  ${maskKey(PUBLISHABLE_KEY)}`);
  console.log(`service_role key: ${maskKey(SERVICE_ROLE_KEY)}\n`);

  // ── Step 1: key 格式 ────────────────────────────────────────
  if (isPlaceholder(PUBLISHABLE_KEY) || isPlaceholder(SERVICE_ROLE_KEY)) {
    console.error('❌ 检测到占位符，请填入真实的 key 后重试');
    fail();
    return;
  }
  if (!PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
    console.warn('⚠️  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 不是 sb_publishable_ 开头（legacy anon JWT 也能用）');
  }
  if (!SERVICE_ROLE_KEY.startsWith('sb_secret_') && !SERVICE_ROLE_KEY.startsWith('eyJ')) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY 既不是 sb_secret_ 也不是 legacy JWT，格式可疑');
    console.error('   注意：不要把 publishable key 填到这里');
    fail();
    return;
  }
  if (PUBLISHABLE_KEY === SERVICE_ROLE_KEY) {
    console.error('❌ publishable key 和 service_role key 不能相同');
    fail();
    return;
  }
  console.log('✅ key 格式检查通过');

  // ── Step 2: 两个客户端 ──────────────────────────────────────
  // 脚本环境不需要会话持久化，显式关掉，避免 localStorage 相关告警
  const authOpts = { auth: { persistSession: false, autoRefreshToken: false } };
  const anonClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, authOpts);
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, authOpts);

  // ── Step 3: service_role 读取 users_tokens（核心验证）───────
  // 只取 count，不 select google_refresh_token，避免把 token 打到终端。
  // 注意：不能用 head:true —— 它对 204 No Content 也返回 error=null、count=null，
  // 会把“表根本不存在”误判成“读取成功 0 行”。改用真实 GET 请求拿 status。
  let adminCount;
  try {
    const { count, error, status } = await adminClient
      .from('users_tokens')
      .select('id', { count: 'exact' });

    if (error) {
      explainTableError(error, 'service_role');
      console.error(`   HTTP ${status}`);
      fail();
      return;
    }

    adminCount = count ?? 0;
    console.log(`✅ service_role 读取 users_tokens 成功（HTTP ${status}，当前 ${adminCount} 行）`);
    console.log('   → RLS 已被绕过，服务端可正常查询 Google refresh token');
  } catch (err) {
    console.error('');
    explainNetworkError(err);
    fail();
    return;
  }

  // ── Step 4: publishable key 对照（应被 RLS 拦住）────────────
  try {
    const { count, error, status } = await anonClient
      .from('users_tokens')
      .select('id', { count: 'exact' });

    if (error) {
      // 权限层被 revoke 时 PostgREST 直接报错（401/403/PGRST301），同样属于“被拦住”。
      // 但 PGRST205 是“表不存在”，说明 Step 3 之外的另一类环境问题，不能算 RLS 生效。
      if (error.code === 'PGRST205' || error.code === '42P01') {
        console.error(`❌ publishable key 也找不到表（${error.code}）：PostgREST schema cache 未加载 public 表`);
        console.error('   这不是 RLS 生效，而是数据库 schema 不可见，请按脚本末尾提示处理');
        fail();
        return;
      }
      console.log(`✅ publishable key 被拒绝（${error.code || `HTTP ${status}`}），RLS/权限层生效`);
    } else if ((count ?? 0) === 0) {
      console.log(`✅ publishable key 读到 0 行（HTTP ${status}），RLS 正确拦截了匿名访问`);
    } else {
      console.warn(`⚠️  publishable key 竟然读到了 ${count} 行！`);
      console.warn('   users_tokens 的 RLS 或权限配置有问题，请确认建表 SQL 已完整执行：');
      console.warn('   enable row level security + revoke all from anon, authenticated');
    }
  } catch (err) {
    console.warn(`⚠️  publishable key 对照检查未完成: ${err.message}`);
  }

  // ── Step 5: upsert 约束自检 ─────────────────────────────────
  // 用不可能冲突的探测邮箱写入再删除，验证 onConflict: 'user_email' 有效
  const probeEmail = 'selfcheck@example.com';
  try {
    const { error: upsertError } = await adminClient
      .from('users_tokens')
      .upsert(
        { user_email: probeEmail, google_refresh_token: 'selfcheck-placeholder' },
        { onConflict: 'user_email' }
      );

    if (upsertError) {
      if (/no unique or exclusion constraint/i.test(upsertError.message)) {
        console.error('❌ upsert 失败：user_email 缺少列级唯一约束');
        console.error('   请确认存在 constraint users_tokens_user_email_key unique (user_email)');
      } else {
        console.error(`❌ upsert 自检失败: ${upsertError.code} / ${upsertError.message}`);
      }
      fail();
      return;
    }

    const { error: cleanupError } = await adminClient
      .from('users_tokens')
      .delete()
      .eq('user_email', probeEmail);

    if (cleanupError) {
      console.warn(`⚠️  清理自检数据失败，请手动删除 user_email='${probeEmail}' 的行`);
    } else {
      console.log('✅ upsert(onConflict: user_email) 自检通过（写入后已清理）');
    }
  } catch (err) {
    console.error('');
    explainNetworkError(err);
    fail();
    return;
  }

  console.log('\n🎉 Supabase 环境搭建完成：publishable + service_role 均可用\n');
}

main();
