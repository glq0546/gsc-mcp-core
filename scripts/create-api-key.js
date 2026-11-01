/**
 * 生成 / 轮换某个租户的 MCP API Key
 *
 * 用途：
 *   /api/mcp 是给 MCP 客户端调的，客户端带不了浏览器 Cookie，所以用
 *   Authorization: Bearer <API_KEY> 鉴权。本脚本负责签发这把 Key。
 *
 * 用法：
 *   npm run api-key -- user@example.com
 *   # 或
 *   node scripts/create-api-key.js user@example.com
 *
 * 安全约定：
 *   * 明文 Key 只在本次运行里打印一次，数据库只存 sha256 摘要；
 *   * 丢掉就只能重新生成（再次运行本脚本即可轮换，旧 Key 立即失效）；
 *   * 不会打印数据库里的 refresh token。
 *
 * 前置条件：
 *   1) .env.local 里有 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   2) 已执行 supabase/migrations/0003_add_api_keys.sql
 *   3) 该邮箱已在 users_tokens 里（即用户已完成 Google 登录授权）
 */

const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// 与 src/lib/api-keys.ts 保持完全一致的算法
const API_KEY_PREFIX = 'gsc_live_';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fail(message, hint) {
  console.error(`\n❌ ${message}`);
  if (hint) console.error(`   ${hint}`);
  console.error('');
  process.exitCode = 1;
}

/** 只打印前缀 + 长度，避免整把 Key 出现在日志里（生成时除外，那是唯一一次） */
const maskKey = (key) => `${key.slice(0, 16)}... (${key.length} 字符)`;

async function main() {
  // ── Step 1: 环境变量 ────────────────────────────────────────
  const missing = [
    !SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
    !SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);

  if (missing.length > 0) {
    fail(
      `缺少环境变量：${missing.join(', ')}`,
      '请在 .env.local 中补充（Supabase Dashboard > Project Settings > API Keys）'
    );
    return;
  }

  // ── Step 2: 参数 ────────────────────────────────────────────
  const rawEmail = process.argv[2];
  if (!rawEmail) {
    fail(
      '缺少邮箱参数',
      '用法：npm run api-key -- user@example.com'
    );
    return;
  }

  const email = rawEmail.toLowerCase().trim();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // ── Step 3: 确认该租户存在且有 Google refresh token ─────────
  const { data: row, error: selectError } = await admin
    .from('users_tokens')
    .select('id, user_email, google_refresh_token, api_key_prefix')
    .eq('user_email', email)
    .maybeSingle();

  if (selectError) {
    if (selectError.code === '42703') {
      fail(
        'users_tokens.api_key_hash 等列不存在（0003 迁移未执行）',
        "请到 Supabase SQL Editor 执行 supabase/migrations/0003_add_api_keys.sql，再执行 notify pgrst, 'reload schema';"
      );
      return;
    }
    fail(`查询 users_tokens 失败：${selectError.code} / ${selectError.message}`);
    return;
  }

  if (!row) {
    fail(
      `users_tokens 里没有 ${email}`,
      '请先让该用户用 Google 登录一次 Web 控制台（完成授权后会写入 refresh token）'
    );
    return;
  }

  if (!row.google_refresh_token) {
    fail(
      `${email} 存在但没有 Google refresh token`,
      '请重新走一次授权流程（access_type=offline, prompt=consent）'
    );
    return;
  }

  // ── Step 4: 生成 Key + 存摘要 ───────────────────────────────
  const apiKey = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
  const keyPrefix = apiKey.slice(0, 16);
  const now = new Date().toISOString();

  const { error: updateError } = await admin
    .from('users_tokens')
    .update({
      api_key_hash: keyHash,
      api_key_prefix: keyPrefix,
      api_key_created_at: now,
      // 新 Key 还没被用过，清空旧的活跃时间避免误导
      api_key_last_used_at: null,
    })
    .eq('id', row.id);

  if (updateError) {
    if (updateError.code === '42703') {
      fail(
        '写入 api_key_hash 失败：列不存在（0003 迁移未执行）',
        '请到 Supabase SQL Editor 执行 supabase/migrations/0003_add_api_keys.sql'
      );
      return;
    }
    fail(`写入 API Key 失败：${updateError.code} / ${updateError.message}`);
    return;
  }

  // ── Step 5: 打印结果（明文只此一次）─────────────────────────
  console.log('');
  console.log('✅ API Key 已生成');
  console.log(`   租户       : ${email}`);
  console.log(`   前缀       : ${keyPrefix}（数据库里只存摘要，可用它核对是哪一把）`);
  console.log(`   数据库摘要 : ${keyHash.slice(0, 12)}...（完整 64 位十六进制）`);
  if (row.api_key_prefix) {
    console.log(`   已轮换     : 旧 Key ${row.api_key_prefix}... 已立即失效`);
  }
  console.log('');
  console.log('   ┌─────────────────────────────────────────────────────────────┐');
  console.log('   │  下面这行只会显示这一次，请立刻复制保存（密码管理器 / .env）  │');
  console.log('   └─────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log(`   ${apiKey}`);
  console.log('');
  console.log('   本地测试：');
  console.log('     npm run dev');
  console.log('     curl -s http://localhost:3000/api/mcp \\');
  console.log('       -H "Content-Type: application/json" \\');
  console.log('       -H "Accept: application/json, text/event-stream" \\');
  console.log(`       -H "Authorization: Bearer ${maskKey(apiKey)}" \\`);
  console.log(
    '       -d \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.0"}}}\''
  );
  console.log('');
}

main().catch((err) => {
  console.error(`\n❌ 未预期的错误：${err.message}\n`);
  process.exitCode = 1;
});
