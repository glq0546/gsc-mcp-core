/**
 * MCP Streamable HTTP 端点 —— https://<your-domain>/api/mcp
 *
 * 协议层：@modelcontextprotocol/sdk 的 WebStandardStreamableHTTPServerTransport
 *         （原生 Request/Response，正好是 Next.js Route Handler 的入参/出参形态）
 * 业务层：复用 src/server.js 的 createMcpServer()，工具实现零改动
 * 版本：serverInfo.version 由 createMcpServer() 提供（当前 1.0.0，与 server.json 对齐），
 *       本文件刻意不写死版本号，避免两处版本各走各的
 * 鉴权层：Authorization: Bearer <API_KEY>
 *         → sha256 反查 users_tokens → 取该租户的 Google refresh token
 *
 * 为什么是「无状态」模式（sessionIdGenerator: undefined）：
 *   Vercel 是 serverless，多个实例之间不共享内存，MCP 的 in-memory session
 *   会在下一次请求落到别的实例时失效。无状态模式下每个 POST 自带完整上下文，
 *   天然适配水平扩容。
 *
 * 为什么开 enableJsonResponse：
 *   默认会回 text/event-stream，服务端要一直挂着连接；对我们这种
 *   “一问一答 + 无服务端主动推送”的工具体系，回 application/json 更快、
 *   更省 Vercel 执行时间，也更好用 curl 调试。
 */

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import {
  extractBearerToken,
  markApiKeyUsed,
  resolveApiKey,
} from '../../../src/lib/api-keys';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createMcpServer } = require('../../../src/server');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createGscClient } = require('../../../src/gsc-client');

// googleapis + node:crypto 都要求 Node runtime，不能用 Edge
export const runtime = 'nodejs';
// 每次请求都要查库 + 调 Google API，不能被静态化或缓存
export const dynamic = 'force-dynamic';
// GSC 偶尔会慢（URL Inspection 尤其），给足 Vercel 函数执行时间
export const maxDuration = 60;

/** 401 时告诉客户端该怎么带凭据（不指向 OAuth 发现文档，因为我们用静态 Key）。 */
const WWW_AUTHENTICATE = 'Bearer realm="gsc-mcp-core"';

/**
 * 统一返回 JSON-RPC 2.0 格式的错误。
 * MCP 客户端会优先看 HTTP 状态码，再解析 body，两边都给。
 */
function jsonRpcError(
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    }
  );
}

export async function POST(request: Request): Promise<Response> {
  // ── Step 1: 取 Key ────────────────────────────────────────────
  const rawKey = extractBearerToken(request.headers.get('authorization'));

  if (!rawKey) {
    return jsonRpcError(
      401,
      -32001,
      'Missing API key. Send header: Authorization: Bearer <YOUR_API_KEY>',
      { 'WWW-Authenticate': WWW_AUTHENTICATE }
    );
  }

  // ── Step 2: Key → 租户 ────────────────────────────────────────
  let identity;
  try {
    identity = await resolveApiKey(rawKey);
  } catch (err) {
    // 数据库/迁移问题属于服务端故障，明确区别于“Key 无效”
    console.error('[mcp] API key lookup failed:', err);
    return jsonRpcError(
      500,
      -32603,
      'API key lookup failed on the server. Check server logs (usually a missing migration 0003 or SUPABASE_SERVICE_ROLE_KEY).'
    );
  }

  if (!identity) {
    return jsonRpcError(401, -32001, 'Invalid API key.', {
      'WWW-Authenticate': WWW_AUTHENTICATE,
    });
  }

  // ── Step 3: 用该租户的凭据跑 MCP ──────────────────────────────
  try {
    const gscClient = createGscClient(identity.googleRefreshToken);
    const server = createMcpServer({ gscClient });

    const transport = new WebStandardStreamableHTTPServerTransport({
      // undefined = 无状态模式，不校验 Mcp-Session-Id（serverless 必需）
      sessionIdGenerator: undefined,
      // 直接回 JSON，而不是挂一条 SSE 长连接
      enableJsonResponse: true,
    });

    await server.connect(transport);

    // 交给 SDK 处理 initialize / tools/list / tools/call 等 JSON-RPC 消息
    const response = await transport.handleRequest(request);

    // 记录活跃时间：失败不影响本次调用（内部已 catch）
    await markApiKeyUsed(identity.userId);

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[mcp] Request handling failed:', message);
    return jsonRpcError(500, -32603, 'Internal MCP server error.');
  }
}

/**
 * 无状态模式下没有“服务端主动推送通道”，GET（SSE 流）和 DELETE（结束会话）
 * 都没有意义，按 Streamable HTTP 规范回 405，并告知客户端只用 POST。
 */
export async function GET(): Promise<Response> {
  return jsonRpcError(
    405,
    -32000,
    'Method Not Allowed: this endpoint is stateless Streamable HTTP. Use POST.',
    { Allow: 'POST' }
  );
}

export async function DELETE(): Promise<Response> {
  return jsonRpcError(
    405,
    -32000,
    'Method Not Allowed: stateless mode keeps no session to delete. Use POST.',
    { Allow: 'POST' }
  );
}
