/**
 * GSC MCP Core - Day 2 入口文件
 *
 * Transport 层：当前使用 StdioServerTransport（本地 Claude Desktop 测试）。
 * 未来切换到 Streamable HTTP 时，只需替换本文件的 transport 部分，
 * 不需要修改 server.js 或 tools/ 中的任何代码。
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
