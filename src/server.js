/**
 * MCP Server 创建 & 工具注册
 *
 * 本文件只负责：
 *   1. 创建 MCP Server 实例（使用 SDK 的 McpServer 高级 API）
 *   2. 注册所有工具
 *   3. 导出 createMcpServer() 供 transport 层调用
 *
 * 注意：本文件不包含 transport 启动逻辑 — transport 在 index.js 中启动。
 * 未来切换到 Streamable HTTP 时，只需修改 index.js 中的 transport 部分。
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
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
//   { definition: { name, description, inputSchema }, handler: async (args) => ({ content: [...] }) }
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
 * @returns {McpServer} 已注册工具的 MCP Server
 */
function createMcpServer() {
  const server = new McpServer(
    {
      name: 'gsc-mcp-core',
      version: '2.0.0-day3',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

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
          return await handler(args);
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
