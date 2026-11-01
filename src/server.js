/**
 * MCP Server 创建 & 工具注册
 *
 * 本文件只负责：
 *   1. 创建 MCP Server 实例（使用 SDK 的 McpServer 高级 API）
 *   2. 注册所有工具
 *   3. 导出 createMcpServer() 供 transport 层调用
 *
 * 注意：本文件不包含 transport 启动逻辑 —— transport 由调用方提供：
 *   - 本地 stdio：src/index.js（StdioServerTransport）
 *   - 远程 HTTP：app/api/mcp/route.ts（WebStandardStreamableHTTPServerTransport）
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { createGscClient } = require('./gsc-client');
const {
  toolDefinition: opportunityRadarDef,
  executeOpportunityRadar,
} = require('./tools/opportunity-radar');
const {
  toolDefinition: inspectUrlDef,
  executeInspectUrl,
} = require('./tools/inspect-url');

// ── 工具注册表 ────────────────────────────────────────────────
// 新增工具时在此注册即可，格式：
//   { definition: { name, description, inputSchema }, handler: async (args, gscClient) => ({ content: [...] }) }
const TOOLS = [
  {
    definition: opportunityRadarDef,
    handler: executeOpportunityRadar,
  },
  {
    definition: inspectUrlDef,
    handler: executeInspectUrl,
  },
];

/**
 * 创建并配置 MCP Server 实例（不启动 transport）。
 *
 * GSC 客户端来源分两种，由 transport 层决定：
 *   1. Stdio（本地 Claude Desktop）：不传 gscClient，回落读取 .env.local 的
 *      GOOGLE_REFRESH_TOKEN（单租户兜底）。
 *   2. Streamable HTTP（app/api/mcp）：由 API Key 解析出所属租户后，注入该租户
 *      自己的 refresh token 建好的客户端（多租户，绝不复用别人的凭据）。
 *
 * @param {object} [options]
 * @param {object|null} [options.gscClient] 已认证的 google.searchconsole 客户端
 * @returns {McpServer} 已注册工具的 MCP Server
 */
function createMcpServer({ gscClient = null } = {}) {
  const server = new McpServer(
    {
      name: 'gsc-mcp-core',
      // 必须与 server.json 的 version 一致：MCP 客户端会把 serverInfo.version
      // 当作「这个端点跑的是哪个版本」，两边不一致会让用户困惑。
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // ── 凭据解析（懒加载 + 复用）─────────────────────────────────
  // 一次会话内多次调用工具时，避免重复拿 refresh token 换 access token。
  let fallbackClient = null;

  const getGscClient = () => {
    if (gscClient) return gscClient;
    if (fallbackClient) return fallbackClient;

    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      throw new Error(
        'No GSC credential available: the HTTP transport must inject a per-tenant ' +
          'client, and the stdio transport needs GOOGLE_REFRESH_TOKEN in .env.local.'
      );
    }

    fallbackClient = createGscClient(refreshToken);
    return fallbackClient;
  };

  // ── 注册所有工具 ────────────────────────────────────────────
  for (const { definition, handler } of TOOLS) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.inputSchema,
      },
      async (args, extra) => {
        try {
          return await handler(args, getGscClient());
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `工具执行失败 (${definition.name})`,
                    message: err.message,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

module.exports = { createMcpServer };
