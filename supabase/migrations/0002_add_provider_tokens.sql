-- ============================================================
-- 0002_add_provider_token.sql
-- 多租户改造 Step 2：为 Supabase OAuth 登录补充 provider_token 字段
--
-- 背景：
--   users_tokens 原本只有 google_refresh_token（Day 1 用 scripts/oauth-flow.js
--   手工换来的单租户凭据）。接入 Supabase Auth 的 Google 登录后，session 里还会有：
--     - provider_token          Google access_token，约 3600 秒后过期
--     - provider_refresh_token  Google refresh token，与 google_refresh_token 同源
--
-- 这里额外保存 provider_token，用途：
--   1) 登录后立刻调用 GSC API（如自动发现站点列表）无需再换一次 token；
--   2) 排查故障 —— refresh token 被吊销时，provider_token 也会连带失效。
--
-- 设计取舍：
--   * 不新增 provider_refresh_token 列：它与 google_refresh_token 是同一份凭据，
--     两列并存只会产生“哪列才是权威值”的不一致风险，统一写 google_refresh_token。
--   * 不新增 provider_expires_at 列：Supabase 的 session.expires_at 是它自己 JWT 的
--     过期时间，不是 Google access_token 的过期时间。把它当 Google token 过期时间
--     存进来是错的，而“当前时间 + 3600”属于猜测。缺字段好过存错数据，
--     真实过期时间以调用 GSC API 返回的 401 为准（届时用 refresh token 换新的）。
--   * google_refresh_token 的 not null 约束保持不动（0001 已定）。
--
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run
-- ============================================================

alter table public.users_tokens
  add column if not exists provider_token text;

comment on column public.users_tokens.provider_token is
  'Google OAuth access_token（Supabase session.provider_token），短期有效，可空';

-- 让 PostgREST 立即感知新列（否则 API 会缓存旧 schema，写入时报 PGRST204 column not found）
notify pgrst, 'reload schema';
