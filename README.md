# GSC MCP Core - Day 2

Google Search Console MCP Server，将 GSC 数据封装为 Claude 可调用的结构化工具。

---

## Day 2 完成内容

- **gsc_opportunity_radar** 工具：扫描 GSC 数据，找出高展现量 + 低 CTR 的 SEO 机会词
- **分段 CTR 模型**：排名 1-3 (28%) / 4-6 (12%) / 7-10 (5%)，替代粗算 `imp * 0.15`
- **处方级输出**：每个机会词附带 3 条可执行建议（标题重构 / AI 答案胶囊 / 内链加权）
- **Stdio transport**：本地 Claude Desktop 直连，未来可无缝切换 Streamable HTTP

---

## 目录结构

```
gsc-mcp-core/
├── src/
│   ├── index.js                    # 入口：启动 MCP Server + Stdio transport
│   ├── server.js                   # Server 创建 & 工具注册（与 transport 分离）
│   ├── gsc-client.js               # 共享 GSC 客户端（OAuth + 代理）
│   └── tools/
│       └── opportunity-radar.js    # gsc_opportunity_radar 工具实现
├── scripts/
│   ├── oauth-flow.js               # Day 1: OAuth 授权流程
│   └── test-gsc.js                 # Day 1: GSC 数据拉取测试
├── .env.example
├── .env.local                      # 凭据（不提交 git）
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 快速开始

### 前置条件

- Day 1 已完成：`.env.local` 中有 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN`
- Node.js >= 18
- 已安装依赖：`npm install`

### 启动 MCP Server

```bash
npm run mcp
# 等同于: node src/index.js
```

> **注意**：MCP Server 通过 stdio 通信，直接运行会"卡住"等待连接 — 这是正常的。需要在 Claude Desktop 中配置后使用。

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

## 📅 Day 3 预告

- 第 2-5 号工具：inspect_url / list_sitemaps / detect_anomalies / query_performance
- 支持多站点管理
- 周环比趋势对比

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
