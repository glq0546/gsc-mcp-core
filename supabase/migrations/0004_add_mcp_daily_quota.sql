-- ============================================================
-- 0004_add_mcp_daily_quota.sql
-- 防刷：给 /api/mcp 增加「每租户每日调用配额」（免费版 50 次/天）
--
-- 背景：
--   API Key 长期有效，一旦被脚本狂刷，会直接烧掉 Google API 配额和
--   Vercel 函数执行时间。这里用两个字段做服务端计数：
--     mcp_daily_calls      当天已进入 /api/mcp 的次数
--     mcp_last_call_date   该计数所属的日期（UTC 自然日）
--
-- 为什么必须用 RPC，而不是应用层「先 SELECT 再 UPDATE」：
--   serverless 下同一用户会有多个并发实例，读改写之间会产生丢失更新
--   （50 个并发请求都读到 0，最后只写了 1，配额形同虚设）。本函数把
--   「判断 + 自增 + 跨天重置」压进一条带条件的 UPDATE：
--     * 单条 UPDATE 会对目标行加行锁，天然串行化同一用户的并发请求；
--     * 后到的 UPDATE 拿到锁后会按新行版本重新校验 WHERE（READ COMMITTED
--       的 EvalPlanQual），所以第 51 个请求必然匹配不到行 → allowed=false，
--       既不会超发，也不会丢计数。
--
-- 日期口径：统一 UTC 自然日（函数内 now() at time zone 'utc'）。
--   Vercel 实例分布在不同时区，只有 UTC 能让“跨天重置”对所有实例一致。
--
-- 安全：
--   函数是 security definer（以 owner 身份绕过 RLS 完成原子更新），
--   因此必须收回 public / anon / authenticated 的 EXECUTE，只留 service_role
--   （/api/mcp 走的正是它）。否则任何拿到 publishable key 的浏览器都能
--   调用本函数去刷别人的计数。
--
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run
-- ============================================================

-- ── 1. 计数列 ────────────────────────────────────────────────
-- not null + default 0：历史行会被回填为 0（PG 11+ 是 fast default，不重写表）
alter table public.users_tokens
  add column if not exists mcp_daily_calls     integer not null default 0,
  add column if not exists mcp_last_call_date  date;

-- 计数只允许非负：兜住“代码 bug 写入负数导致配额永远用不完”的情况
alter table public.users_tokens
  drop constraint if exists users_tokens_mcp_daily_calls_non_negative;
alter table public.users_tokens
  add constraint users_tokens_mcp_daily_calls_non_negative
  check (mcp_daily_calls >= 0);

comment on column public.users_tokens.mcp_daily_calls is
  '当天已调用 /api/mcp 的次数；跨天由 increment_mcp_daily_calls() 原子重置为 1';
comment on column public.users_tokens.mcp_last_call_date is
  'mcp_daily_calls 所属日期（UTC 自然日，YYYY-MM-DD）；不等于今天时下一次调用触发重置';

-- ── 2. 原子计数函数 ─────────────────────────────────────────
-- 返回一行：allowed（本次是否放行）、used（本次之后的当天计数）、
--           daily_limit（生效上限）、call_date（计数所属日期）
-- 语义要点：
--   * 放行时就把计数写成「本次之后的数值」——调用方拿到 allowed=true 即已扣费；
--   * 超限时不写库（UPDATE 0 行），计数保持不变，避免“被拒绝也扣次数”；
--   * 用户不存在时抛 P0002，让调用方能区分“Key 有效但行被删了”和“被限流”。
create or replace function public.increment_mcp_daily_calls(
  p_user_id     uuid,
  p_daily_limit integer default 50
)
returns table (
  allowed     boolean,
  used        integer,
  daily_limit integer,
  call_date   date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- UTC 自然日：所有 serverless 实例口径一致
  v_today date := (now() at time zone 'utc')::date;
  v_used  integer;
  v_date  date;
begin
  if p_daily_limit is null or p_daily_limit < 1 then
    raise exception 'p_daily_limit must be >= 1 (got %)', p_daily_limit
      using errcode = '22023';
  end if;

  -- 一条语句完成「跨天重置 + 未超限才自增」：
  --   日期不是今天 → 计数重置为 1、日期写成今天
  --   日期是今天   → 计数 +1（WHERE 保证 +1 之后不会超过上限）
  -- 今天已满额时 0 行受影响，不产生任何写入。
  update public.users_tokens as t
     set mcp_daily_calls    = case
                                when t.mcp_last_call_date = v_today
                                  then coalesce(t.mcp_daily_calls, 0) + 1
                                else 1
                              end,
         mcp_last_call_date = v_today
   where t.id = p_user_id
     and (
       t.mcp_last_call_date is distinct from v_today
       or coalesce(t.mcp_daily_calls, 0) < p_daily_limit
     )
  returning t.mcp_daily_calls, t.mcp_last_call_date
       into v_used, v_date;

  if found then
    return query select true, v_used, p_daily_limit, v_date;
    return;
  end if;

  -- 0 行受影响：要么今天已满额，要么这个用户不存在。查一次区分两种情况。
  select t.mcp_daily_calls, t.mcp_last_call_date
    into v_used, v_date
    from public.users_tokens as t
   where t.id = p_user_id;

  if not found then
    raise exception 'users_tokens row not found: %', p_user_id
      using errcode = 'P0002';
  end if;

  return query select false, v_used, p_daily_limit, v_date;
end;
$$;

comment on function public.increment_mcp_daily_calls(uuid, integer) is
  '/api/mcp 每日配额原子计数：放行时自增并返回剩余信息，超限时 allowed=false 且不写库';

-- ── 3. 只允许 service_role 调用 ─────────────────────────────
-- 函数是 security definer，默认 EXECUTE 给 PUBLIC 等于把“改任意租户计数”
-- 的入口暴露给浏览器端 publishable key。显式收回，只授权服务端。
revoke all on function public.increment_mcp_daily_calls(uuid, integer) from public;
revoke all on function public.increment_mcp_daily_calls(uuid, integer) from anon, authenticated;
grant execute on function public.increment_mcp_daily_calls(uuid, integer) to service_role;

-- 让 PostgREST 立刻感知新列与新函数（否则 RPC 报 PGRST202 function not found）
notify pgrst, 'reload schema';
