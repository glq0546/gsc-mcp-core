# GSC MCP Core — Day 3

Google Search Console MCP Server + 多租户 Next.js Micro-SaaS：把 GSC 数据封装成
Claude 可调用的结构化工具，同时提供一个带登录的 Web 控制台。

- **MCP Server**：Claude Desktop 通过 stdio 直连，调用 `gsc_opportunity_radar` / `gsc_inspect_url`
- **Web SaaS**：Next.js App Router + Supabase 多租户登录，Vercel 部署，每位用户用自己的 Google 授权数据

---

## 版本进度

### Day 3（当前）— Web 化 / 多租户 / 上线

- **Next.js SaaS 界面**：`app/page.tsx` 提供 "Scan Opportunities" 与 "Inspect Index Status" 两个入口，结果以 JSON 面板展示
- **多租户认证**：Supabase Auth（Google OAuth）登录；`users_tokens` 表按 `user_email` 保存每位用户自己的 Google refresh token
- **服务端鉴权 API**：`POST /api/radar`、`POST /api/inspect` 先校验 session，再用该用户的 token 调 GSC；未登录或无 token 返回 401
- **Token 自动刷新中间件**：`src/middleware.ts` 每次请求前 `getUser()`，把 1 小时过期的 access_token 换新并回写 cookie
- **gsc_inspect_url 工具**：调用 URL Inspection API，查看单个 URL 的真实收录状态
- **Vercel 部署 + Analytics**：`app/layout.tsx` 挂载 `@vercel/analytics/next`，跟踪真实访客与客户端路由切换
- **全站英文 UI/API**：面向海外 SEO 用户
- **变现入口**：结果页底部 CTA 指向 Pro SEO & Chargeback Guide

### Day 2 — 机会词雷达

- **gsc_opportunity_radar** 工具：扫描 GSC 数据，找出高展现量 + 低 CTR 的 SEO 机会词
- **分段 CTR 模型**：排名 1-3 (28%) / 4-6 (12%) / 7-10 (5%)，替代粗算 `imp * 0.15`
- **处方级输出**：每个机会词附带 3 条可执行建议（标题重构 / AI 答案胶囊 / 内链加权）
- **Stdio transport**：本地 Claude Desktop 直连，未来可无缝切换 Streamable HTTP

### Day 1 — 打通 GSC

- `scripts/oauth-flow.js`：手工 OAuth 授权流程，换取 `GOOGLE_REFRESH_TOKEN`
- `scripts/test-gsc.js`：验证能真实拉到 GSC 数据

---

## 目录结构

```
gsc-mcp-core/
├── app/                                # Next.js App Router（Web SaaS）
│   ├── layout.tsx                      # 根布局 + <Analytics />（@vercel/analytics/next）
│   ├── page.tsx                        # 控制台：Scan Opportunities / Inspect Index Status
│   ├── components/GoogleSignInButton.tsx
│   ├── auth/callback/route.ts          # code → session → 写 users_tokens
│   └── api/
│       ├── radar/route.ts              # POST：鉴权后跑机会词雷达
│       └── inspect/route.ts            # POST：鉴权后跑 URL 收录检查
├── src/
│   ├── index.js                        # MCP 入口：Stdio transport
│   ├── server.js                       # Server 创建 & 工具注册表
│   ├── gsc-client.js                   # 共享 GSC 客户端（OAuth + 代理）
│   ├── middleware.ts                   # Supabase token 刷新（Edge Runtime）
│   ├── lib/
│   │   ├── supabase.ts                 # getUserToken() 等服务端数据访问
│   │   └── supabase/
│   │       ├── browser.ts              # 浏览器端客户端
│   │       └── server.ts               # 服务端客户端
│   ├── tools/
│   │   ├── opportunity-radar.js        # gsc_opportunity_radar
│   │   └── inspect-url.js              # gsc_inspect_url
│   ├── views/index.ejs                 # 早期 Express 视图（npm run web）
│   └── web-server.js                   # 早期 Express 服务
├── scripts/                            # oauth-flow / test-gsc / test-inspect / test-supabase / run-radar / batch-inspect
├── supabase/migrations/                # 0001 users_tokens / 0002 provider_token
├── .env.example
├── .env.local                          # 本地凭据（不提交 git）
├── .mcp.json                           # 本地 MCP 客户端配置
├── next.config.js / tailwind.config.ts / tsconfig.json
├── package.json
└── README.md
```

---

## 🔐 多租户登录（Supabase Auth + Google OAuth）

### 1) Supabase 后台配置

| 位置 | 填什么 |
| --- | --- |
| Authentication → Providers → Google | 打开开关，粘贴 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`（复用现有凭据，不要新建 OAuth Client） |
| 同上，页面里的 **Callback URL (for OAuth)** | 复制它（形如 `https://<project-ref>.supabase.co/auth/v1/callback`），粘到 Google Cloud Console |
| Google Cloud Console → Credentials → 该 OAuth 客户端 | **Authorized redirect URIs** 添加上面那个 Supabase 回调地址；**Authorized JavaScript origins** 添加 `http://localhost:3000` 与线上域名 |
| Authentication → URL Configuration | Site URL = `http://localhost:3000`；Redirect URLs 加 `http://localhost:3000/**`（线上同理加 `https://your-domain/**`） |

> ⚠️ 回调地址填错是本流程最常见故障：`redirect_uri_mismatch` 说明 Google 侧没加 Supabase 的回调地址；
> 登录后跳回 `localhost` 但报错，说明 Supabase 的 Redirect URLs 白名单没加 `/auth/callback`。

### 2) 数据库

在 SQL Editor 执行 `supabase/migrations/0002_add_provider_token.sql`，为 `users_tokens` 增加
`provider_token` 列（保存 Supabase 下发的短期 Google access_token）。

### 3) 代码结构

```
app/
├── page.tsx                          # 首页，Header 挂载 <GoogleSignInButton />
├── components/
│   └── GoogleSignInButton.tsx        # 登录/登出按钮 + signInWithOAuth（access_type=offline）
└── auth/callback/route.ts            # 服务端：code → session → 写 users_tokens
src/lib/supabase/
├── browser.ts                        # 浏览器端客户端（会话存 cookie）
└── server.ts                         # 服务端客户端（读 cookie）
```

### 4) 凭据落库流程

```
点击登录
  → signInWithOAuth({ provider: 'google', scopes: [...,webmasters.readonly],
                      queryParams: { access_type: 'offline', prompt: 'consent' } })
  → 跳转 https://<ref>.supabase.co/auth/v1/authorize?provider=google
  → Google 授权
  → 回跳 /auth/callback?code=xxx
  → exchangeCodeForSession(code) 得到 session.provider_token / provider_refresh_token
  → storeProviderTokens() 用 service_role 写入 users_tokens（upsert on user_email）
  → 302 回 /?auth=connected
```

**为什么 token 不经过浏览器 JS**：`users_tokens` 开了 RLS 且零策略，publishable key 写不进；
把 service_role 放进前端等于数据库裸奔。所以刷新凭据只在 Route Handler 内流转。

**为什么必须 `access_type=offline`**：不加这个参数 Google 不下发 refresh token；
`prompt=consent` 保证二次登录时仍会重新下发（否则只能拿到 1 小时有效的 access token）。

---

## 🚀 快速开始

### 前置条件

- 已安装依赖：`npm install`
- Node.js >= 18
- 复制 `.env.example` → `.env.local` 并填写 Google / Supabase 凭据

### 启动 Web 控制台（Next.js）

```bash
npm run dev
# http://localhost:3000
```

打开页面 → 右上角用 Google 登录 → 授权完成后即可点击
"Scan Opportunities" 或 "Inspect Index Status"，结果会显示在下方 JSON 面板。

### 启动 MCP Server

```bash
npm run mcp
# 等同于: node src/index.js
```

> **注意**：MCP Server 通过 stdio 通信，直接运行会"卡住"等待连接 — 这是正常的。需要在 Claude Desktop 中配置后使用。

---

## ☁️ Vercel 部署

### 1) 环境变量

在 Vercel 项目 → Settings → Environment Variables 配置（Production 与 Preview 都要加）：

| 变量 | 说明 |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 客户端凭据 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 可安全暴露到浏览器的 publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅服务端使用（写 `users_tokens`） |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` 绝不能加 `NEXT_PUBLIC_` 前缀，否则会被打包进浏览器代码，
> 等于把整个数据库交出去。

### 2) 上线后必须回填的地址

- Google Cloud Console → 该 OAuth 客户端 → **Authorized JavaScript origins** 添加线上域名
- Supabase → Authentication → URL Configuration：Site URL 改成线上域名，Redirect URLs 加 `https://your-domain/**`

否则线上登录会报 `redirect_uri_mismatch`，或者登录完跳回 `localhost`。

### 3) 部署

```bash
npm run build     # 本地先验证构建
vercel --prod     # 或直接 push 到 main，由 Vercel 自动构建
```

### 4) 访问统计

`app/layout.tsx` 挂载的是 `@vercel/analytics/next` 的 `<Analytics />`。
它专为 Next.js 设计，会跟随客户端路由切换自动上报 pageview（`/react` 入口只在首次进入时上报一次）。
部署后到 Vercel 项目 → Analytics 查看数据。

---

## 🔌 Claude Desktop 配置

### 配置文件路径

```
Windows: %APPDATA%\Claude\claude_desktop_config.json
macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
Linux:   ~/.config/claude/claude_desktop_config.json
```

### 配置步骤

#### Step 1: 找到配置文件

按 `Win + R`，输入以下路径后回车：

```
%APPDATA%\Claude\claude_desktop_config.json
```

> 如果文件不存在，手动创建一个空 JSON 文件 `claude_desktop_config.json`。

#### Step 2: 添加 MCP Server 配置

在 JSON 中添加 `mcpServers` 字段（如果已有则合并）：

```json
{
  "mcpServers": {
    "gsc-mcp-core": {
      "command": "node",
      "args": [
        "C:\\Users\\Administrator\\Desktop\\gsc-mcp-core\\src\\index.js"
      ],
      "env": {
        "GOOGLE_CLIENT_ID": "你的Client ID.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "你的Client Secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:3000/oauth2callback",
        "GOOGLE_REFRESH_TOKEN": "你的Refresh Token"
      }
    }
  }
}
```

> **重要**：`args` 中的路径是 `src/index.js` 的**绝对路径**，请根据实际安装位置修改。
> `env` 字段可选 — 如果 `.env.local` 已正确配置，Claude Desktop 会在项目目录启动时自动读取。

#### Step 3: 重启 Claude Desktop

1. 完全退出 Claude Desktop（系统托盘右键 → Quit，确保进程结束）
2. 重新打开 Claude Desktop
3. 新对话中应该能看到 🔧 `gsc_opportunity_radar` 工具

#### Step 4: 验证连接

在新对话中问：

> "用 gsc_opportunity_radar 扫描一下 https://glq-api.asia/ 最近 30 天的机会词"

Claude 应该会自动调用工具并返回结构化 JSON 结果。

---

## 📋 工具说明

### gsc_opportunity_radar

扫描 GSC 数据，找出 SEO 机会词。

#### 输入参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `siteUrl` | string | 必填 | GSC 站点 URL |
| `daysBack` | number | 7 | 回溯天数 (1-90) |
| `minImpressions` | number | 100 | 最低展现量筛选 |
| `maxPosition` | number | 20 | 最高排名筛选 |
| `topN` | number | 10 | 返回 Top N 机会词 |

#### 输出结构

```json
{
  "overview": { "siteUrl": "...", "dateRange": "...", ... },
  "ctrModelNote": "分段 CTR 模型说明...",
  "ctrTiers": [
    { "rankRange": "1-3 位", "estimatedCtr": "28%" },
    { "rankRange": "4-6 位", "estimatedCtr": "12%" },
    { "rankRange": "7-10 位", "estimatedCtr": "5%" }
  ],
  "opportunities": [
    {
      "rank": 1,
      "query": "关键词",
      "currentPosition": 8.5,
      "impressions": 1200,
      "clicks": 48,
      "currentCtr": "4.00%",
      "targetTier": "7-10 位",
      "targetCtr": "5%",
      "incrementalClicks": 12,
      "prescriptions": [
        { "type": "标题重构", "action": "...", "detail": "..." },
        { "type": "AI 答案胶囊", "action": "...", "detail": "..." },
        { "type": "内链加权", "action": "...", "detail": "..." }
      ]
    }
  ],
  "prioritizeTop3": [
    { "query": "...", "reason": "..." }
  ]
}
```

#### 分段 CTR 模型假设

- 基于 Google 公开的行业基准研究（2024-2025 多项学术研究）
- 实际 CTR 因行业、品牌词 vs 非品牌词、SERP 特征差异很大
- 增量收益 = (目标CTR - 当前CTR) × 展现量，假设展现量不变
- **这是方向性估算，不是精确预测**

---

### gsc_inspect_url

调用 Google URL Inspection API，查看**单个 URL** 的真实收录状态。

#### 输入参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `siteUrl` | string | GSC 站点 URL，如 `https://example.com/` |
| `inspectionUrl` | string | 要检查的具体页面 URL |

#### 输出要点

`verdict`（PASS / NEUTRAL / FAIL）、`coverageState`、`indexingState`、
`googleCanonical` / `userCanonical`、`lastCrawlTime` 等。

> ⚠️ 配额提醒：URL Inspection API 每日约 200 次。它只适合抽查重点页面，
> 不要拿来做全站批量扫描（`scripts/batch-inspect.js` 也请控制条数）。

---

## 🔧 代理配置（中国大陆服务器必需）

如果服务器位于中国大陆或需要代理访问 Google API：

`src/gsc-client.js` 会自动检测代理：
1. 优先读取环境变量 `HTTPS_PROXY` / `HTTP_PROXY`
2. 回退读取 Windows 注册表 `HKCU\...\Internet Settings\ProxyServer`

手动设置代理：
```bash
set HTTPS_PROXY=http://127.0.0.1:7892
npm run mcp
```

---

## 📅 Day 4 路线图

- 补齐工具：`list_sitemaps` / `detect_anomalies` / `query_performance`
- 多站点管理（站点列表 + 一键切换）
- 周环比趋势对比
- 结果面板从裸 JSON 升级为图表

---

## ⚠️ 常见问题

### Q: Claude Desktop 看不到工具？
1. 确认配置文件路径正确（Windows: `%APPDATA%\Claude\claude_desktop_config.json`）
2. 确认 JSON 格式合法（用 JSON 校验工具检查）
3. 完全退出并重启 Claude Desktop
4. 查看 Claude Desktop 的 MCP 日志（Settings → Developer → MCP Server Logs）

### Q: 403 Permission Denied？
- 确保 Google 账号已被添加为目标站点的 GSC 用户
- GSC 后台：Settings → Users and permissions → Add user

### Q: 无数据返回？
- 检查 `daysBack` 是否足够长（GSC 数据通常有 1-3 天延迟，建议用 30 天）
- 降低 `minImpressions` 阈值（默认 100 可能过滤掉小站点数据）
- 确认站点 URL 格式正确（`https://glq-api.asia/` vs `https://glq-api.asia`）
