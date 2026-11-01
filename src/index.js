/**
 * GSC MCP Core - Day 2 入口文件
 *
 * Transport 层：本地使用 StdioServerTransport（Claude Desktop 直连）。
 * 云端多租户的 Streamable HTTP 端点见 app/api/mcp/route.ts ——
 * 那边只是换了一个 transport，server.js 与 tools/ 完全复用。
 */

const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createMcpServer } = require('./server');

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // stderr 输出到控制台（不干扰 stdio 通信）
  console.error('[gsc-mcp-core] MCP Server 已启动 (Stdio transport)');
  console.error('[gsc-mcp-core] 等待 Claude Desktop 连接...');
}

main().catch((err) => {
  console.error('[gsc-mcp-core] 启动失败:', err.message);
  process.exit(1);
});
