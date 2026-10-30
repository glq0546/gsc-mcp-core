-- ============================================================
-- 0001_create_users_tokens.sql
-- 多租户改造 Step 1：存储每个租户的 Google OAuth refresh token
--
-- 执行方式（任选其一）：
--   1. Supabase Dashboard → SQL Editor → 粘贴本文件 → Run
--   2. supabase CLI：supabase db push（本文件已放在 supabase/migrations/）
--
-- ⚠️ 安全提示：google_refresh_token 等同于长期有效的 Google 授权凭据。
--    当前阶段用“服务端 + service_role key”访问本表，RLS 默认全表拒绝，
--    任何拿到 publishable/anon key 的浏览器都无法读取，这是刻意的默认值。
-- ============================================================

create extension if not exists "pgcrypto" with schema extensions;

create table if not exists public.users_tokens (
  id                    uuid primary key default gen_random_uuid(),
  user_email            text        not null,
  google_refresh_token  text        not null,
  created_at            timestamptz not null default now(),

  -- 一个邮箱只保留一条有效凭据。
  -- 必须是「列级」唯一约束：PostgREST 的 on_conflict=user_email（upsert）只认
  -- 列级约束/索引，表达式索引（如 lower(user_email)）会报
  -- "no unique or exclusion constraint matching the ON CONFLICT specification"。
  constraint users_tokens_user_email_key unique (user_email),

  -- 应用层已统一 toLowerCase()，这里加一道数据完整性兜底，防止大小写变体绕过唯一约束
  constraint users_tokens_user_email_lowercase check (user_email = lower(user_email)),
  -- 粗校验邮箱格式，避免写入空串之类的脏数据
  constraint users_tokens_user_email_format check (user_email like '%_@_%._%')
);

comment on table  public.users_tokens                      is '每个租户（Google 账号）的 GSC OAuth 凭据';
comment on column public.users_tokens.user_email           is '租户标识：Google 账号邮箱，统一存小写';
comment on column public.users_tokens.google_refresh_token is 'Google OAuth refresh token（长期凭据，仅服务端可读）';
comment on column public.users_tokens.created_at           is '首次写入时间';

-- ── 行级安全（RLS）────────────────────────────────────────────
-- 开启 RLS 且不创建任何策略 = 匿名/登录用户一律不可读写。
-- 服务端使用 service_role key 访问时自动绕过 RLS。
alter table public.users_tokens enable row level security;

-- 可选：显式收回公开角色权限，双保险（RLS 之外的权限层）
revoke all on table public.users_tokens from anon, authenticated;
