-- ============================================================
-- 0003_add_api_keys.sql
-- 多租户改造 Step 3：为 /api/mcp（Streamable HTTP）增加 Header API Key 鉴权
--
-- 背景：
--   Web 控制台的 /api/radar、/api/inspect 靠 Supabase 登录 Cookie 鉴权，
--   而 MCP 客户端（Claude Desktop / Cursor / Codex 等）不会带浏览器 Cookie。
--   所以这里给每个租户追加一把长期 API Key，用
--     Authorization: Bearer <API_KEY>
--   访问 /api/mcp，服务端用 sha256(key) 反查 users_tokens 得到租户。
--
-- 安全设计：
--   * 只存 sha256 十六进制摘要，不存明文 —— 数据库泄露也无法还原 Key；
--   * Key 明文只在生成时（scripts/create-api-key.js / 未来的页面）返回一次；
--   * api_key_prefix 只存前 12 位左右，用于在页面上展示「哪一把 Key」，
--     不构成可用的凭据；
--   * 本表 RLS 依旧零策略，只有 service_role 能读写，publishable key 拿不到。
--
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文 → Run
-- ============================================================

alter table public.users_tokens
  add column if not exists api_key_hash        text,
  add column if not exists api_key_prefix      text,
  add column if not exists api_key_created_at  timestamptz,
  add column if not exists api_key_last_used_at timestamptz;

-- 一把 Key 只能对应一个租户。
-- 用部分唯一索引：允许大量 NULL（还没生成 Key 的用户），但非 NULL 必须唯一。
create unique index if not exists users_tokens_api_key_hash_key
  on public.users_tokens (api_key_hash)
  where api_key_hash is not null;

comment on column public.users_tokens.api_key_hash is
  'sha256(API Key) 的十六进制摘要；MCP 客户端用 Authorization: Bearer <Key> 访问 /api/mcp 时反查本列';
comment on column public.users_tokens.api_key_prefix is
  'API Key 明文前缀（如 gsc_live_ab12cd），仅供界面展示，不可用于鉴权';
comment on column public.users_tokens.api_key_created_at is
  'API Key 生成时间（轮换 Key 时更新）';
comment on column public.users_tokens.api_key_last_used_at is
  'API Key 最后一次成功调用 /api/mcp 的时间，用于在页面上显示活跃度';

-- 让 PostgREST 立刻感知新列（否则 /api/mcp 查询会报 column not found）
notify pgrst, 'reload schema';
