/**
 * /api/mcp 每日配额（防刷）自检脚本
 *
 * 验证 supabase/migrations/0004_add_mcp_daily_quota.sql 是否生效、并发是否准确：
 *   1. users_tokens.mcp_daily_calls / mcp_last_call_date 两列存在
 *   2. public.increment_mcp_daily_calls(...) 函数存在且已暴露给 PostgREST
 *   3. 并发爆炸测试：60 个并发调用里恰好放行 50 个，库里计数正好 50（不丢、不超）
 *   4. 跨天重置：把计数伪造成“昨天已满 50 次”，下一次调用应放行且计数回到 1
 *
 * 用法：npm run test:quota
 *      需要代理：$env:HTTPS_PROXY='http://127.0.0.1:7892'; $env:NODE_USE_ENV_PROXY='1'; npm run test:quota
 *
 * 自检会临时插入一行 user_email='quota-selfcheck@example.com' 的占位租户，
 * 结束时（含失败分支）自动删除；不会碰任何真实用户的计数。
 */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error('\n❌ 缺少环境变量：');
  missing.forEach((k) => console.error(`   - ${k}`));
  console.error('\n   请在 .env.local 中补充 Supabase 配置\n');
  process.exit(1);
}

const PROBE_EMAIL = 'quota-selfcheck@example.com';
const DAILY_LIMIT = 50;
const CONCURRENT_CALLS = 60;

/** UTC 日期（与 RPC 内 now() at time zone 'utc' 的口径一致） */
const utcDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);

let failures = 0;
const fail = () => {
  failures += 1;
};

function explainNetworkError(err) {
  console.error(`❌ 网络请求失败: ${err.message}`);
  if (err.cause && err.cause.code) console.error(`   底层错误码: ${err.cause.code}`);
  console.error('\n   如果本机需要代理，请这样运行：');
  console.error(
    "   PowerShell: $env:HTTPS_PROXY='http://127.0.0.1:7892'; $env:NODE_USE_ENV_PROXY='1'; npm run test:quota\n"
  );
}

/** 迁移未执行时给出唯一正确的修复动作 */
function explainMissingMigration(code, message) {
  if (['42883', 'PGRST202', '42703'].includes(code || '')) {
    console.error('❌ 迁移 0004 还没执行（或 PostgREST schema cache 未刷新）。');
    console.error(`   ${code} / ${message}`);
    console.error('\n   请到 Supabase Dashboard → SQL Editor 执行：');
    console.error('   supabase/migrations/0004_add_mcp_daily_quota.sql');
    console.error("   文件末尾已包含 notify pgrst, 'reload schema'; 执行后重新运行本脚本\n");
    return true;
  }
  return false;
}

async function main() {
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let probeId = null;

  try {
    // ── Step 1: 列是否存在 ─────────────────────────────────────
    const { error: columnError } = await client
      .from('users_tokens')
      .select('id, mcp_daily_calls, mcp_last_call_date')
      .limit(1);

    if (columnError) {
      if (explainMissingMigration(columnError.code, columnError.message)) {
        fail();
        return;
      }
      console.error(`❌ 读取计数列失败: ${columnError.code} / ${columnError.message}`);
      fail();
      return;
    }
    console.log('✅ 计数列存在：mcp_daily_calls / mcp_last_call_date');

    // ── Step 2: 函数是否存在 ───────────────────────────────────
    // 用一个不存在的 uuid 试调用：函数存在时应回 P0002（row not found），
    // 函数不存在则是 42883 / PGRST202。
    const { error: rpcProbeError } = await client.rpc('increment_mcp_daily_calls', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_daily_limit: DAILY_LIMIT,
    });

    if (rpcProbeError && rpcProbeError.code !== 'P0002') {
      if (explainMissingMigration(rpcProbeError.code, rpcProbeError.message)) {
        fail();
        return;
      }
      console.error(`❌ RPC 探测失败: ${rpcProbeError.code} / ${rpcProbeError.message}`);
      fail();
      return;
    }
    console.log('✅ 函数存在：increment_mcp_daily_calls(uuid, integer)');

    // ── Step 3: 建占位租户 ─────────────────────────────────────
    await client.from('users_tokens').delete().eq('user_email', PROBE_EMAIL);

    const { data: probe, error: insertError } = await client
      .from('users_tokens')
      .insert({
        user_email: PROBE_EMAIL,
        google_refresh_token: 'selfcheck-placeholder',
        mcp_daily_calls: 0,
        mcp_last_call_date: null,
      })
      .select('id')
      .single();

    if (insertError || !probe) {
      console.error(`❌ 插入占位租户失败: ${insertError?.code} / ${insertError?.message}`);
      fail();
      return;
    }

    probeId = probe.id;
    console.log(`✅ 占位租户已创建：${probeId}`);

    // ── Step 4: 60 并发里应恰好放行 50 ─────────────────────────
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () =>
        client.rpc('increment_mcp_daily_calls', {
          p_user_id: probeId,
          p_daily_limit: DAILY_LIMIT,
        })
      )
    );

    const rpcErrors = results.filter((r) => r.error);
    if (rpcErrors.length > 0) {
      console.error(`❌ 有 ${rpcErrors.length} 个并发调用报错：`);
      console.error(`   ${rpcErrors[0].error.code} / ${rpcErrors[0].error.message}`);
      fail();
    }

    const rows = results.filter((r) => !r.error).map((r) => r.data[0]);
    const allowed = rows.filter((row) => row.allowed);
    const rejected = rows.filter((row) => !row.allowed);
    const usedValues = allowed.map((row) => row.used).sort((a, b) => a - b);

    const { data: afterBurst, error: readError } = await client
      .from('users_tokens')
      .select('mcp_daily_calls, mcp_last_call_date')
      .eq('id', probeId)
      .single();

    if (readError) {
      console.error(`❌ 回读计数失败: ${readError.code} / ${readError.message}`);
      fail();
      return;
    }

    console.log(
      `   并发 ${CONCURRENT_CALLS} 次 → 放行 ${allowed.length}，拒绝 ${rejected.length}，` +
        `库里计数 ${afterBurst.mcp_daily_calls}（日期 ${afterBurst.mcp_last_call_date}）`
    );

    if (allowed.length !== DAILY_LIMIT) {
      console.error(`❌ 放行数量应为 ${DAILY_LIMIT}，实际 ${allowed.length}（并发计数不准确）`);
      fail();
    }
    if (afterBurst.mcp_daily_calls !== DAILY_LIMIT) {
      console.error(`❌ 库里计数应为 ${DAILY_LIMIT}，实际 ${afterBurst.mcp_daily_calls}`);
      fail();
    }
    if (usedValues.some((value, index) => value !== index + 1)) {
      console.error(
        `❌ 放行时的 used 应恰好是 1..${DAILY_LIMIT} 且无重复，实际：${usedValues.join(',')}`
      );
      fail();
    } else {
      console.log(`✅ 并发准确：恰好 ${DAILY_LIMIT} 次放行，计数 ${DAILY_LIMIT}，无重复无丢失`);
    }

    // ── Step 5: 跨天重置 ───────────────────────────────────────
    const yesterday = utcDate(-1);
    const { error: fakeError } = await client
      .from('users_tokens')
      .update({ mcp_daily_calls: DAILY_LIMIT, mcp_last_call_date: yesterday })
      .eq('id', probeId);

    if (fakeError) {
      console.error(`❌ 伪造“昨天已满额”失败: ${fakeError.code} / ${fakeError.message}`);
      fail();
      return;
    }

    const { data: resetRow, error: resetError } = await client.rpc('increment_mcp_daily_calls', {
      p_user_id: probeId,
      p_daily_limit: DAILY_LIMIT,
    });

    if (resetError) {
      console.error(`❌ 跨天重置调用失败: ${resetError.code} / ${resetError.message}`);
      fail();
      return;
    }

    const reset = resetRow[0];
    const today = utcDate(0);
    if (!reset.allowed || reset.used !== 1 || reset.call_date !== today) {
      console.error(
        `❌ 跨天重置错误：期望 allowed=true / used=1 / call_date=${today}，` +
          `实际 allowed=${reset.allowed} / used=${reset.used} / call_date=${reset.call_date}`
      );
      fail();
    } else {
      console.log(`✅ 跨天重置正常：昨天已满额 → 今天第 1 次放行，计数回到 1（${today}）`);
    }
  } catch (err) {
    console.error('');
    explainNetworkError(err);
    fail();
  } finally {
    // ── Step 6: 清理占位租户（含失败分支）─────────────────────
    if (probeId) {
      try {
        const { error: cleanupError } = await client
          .from('users_tokens')
          .delete()
          .eq('id', probeId);
        if (cleanupError) {
          console.warn(`⚠️  清理占位租户失败，请手动删除 user_email='${PROBE_EMAIL}' 的行`);
        } else {
          console.log('✅ 占位租户已清理');
        }
      } catch (cleanupErr) {
        console.warn(`⚠️  清理占位租户异常: ${cleanupErr.message}`);
      }
    }

    if (failures === 0) {
      console.log('\n🎉 每日配额（防刷）验证通过\n');
    } else {
      console.error(`\n❌ 自检失败（${failures} 项）\n`);
      process.exitCode = 1;
    }
  }
}

main();

