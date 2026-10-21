/**
 * scripts/test-inspect.js
 *
 * 直接调用 gsc_inspect_url 的工具函数（不经 MCP 协议），
 * 探测指定页面的 Google 收录状态，结果以 JSON 输出到控制台。
 *
 * 运行命令：
 *   node scripts/test-inspect.js
 *
 * 代理配置与 src/gsc-client.js 一致，优先读取环境变量，
 * 否则回退到 Windows 注册表系统代理。
 */

const path = require('path');

// ── 加载 .env.local（含 OAuth 凭据） ───────────────────────────
require('dotenv').config({
  path: path.join(__dirname, '..', '.env.local'),
});

// ── 确保代理环境变量被加载 ────────────────────────────────────
function ensureProxyEnv() {
  if (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  ) {
    return;
  }

  try {
    const { execSync } = require('child_process');
    const regOutput = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    if (/ProxyEnable\s+REG_DWORD\s+0x1/.test(regOutput)) {
      const serverOutput = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const match = serverOutput.match(/ProxyServer\s+REG_SZ\s+(.+)/);
      if (match && match[1].trim()) {
        process.env.HTTPS_PROXY = `http://${match[1].trim()}`;
        process.env.HTTP_PROXY = process.env.HTTPS_PROXY;
        console.error(`[proxy] 已从注册表加载系统代理: ${process.env.HTTPS_PROXY}`);
      }
    }
  } catch (_) {
    // 忽略注册表读取失败
  }
}

ensureProxyEnv();

// ── 调用 gsc_inspect_url 核心函数 ─────────────────────────────
const { executeInspectUrl } = require('../src/tools/inspect-url');

const siteUrl = 'https://glq-api.asia/';

const targets = [
  'https://glq-api.asia/charge-decode/pages/intuit-qb',
  'https://glq-api.asia/charge-decode/pages/google-temp-hold',
];

async function main() {
  for (const inspectionUrl of targets) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 探测: ${inspectionUrl}`);
    console.log('='.repeat(60));

    try {
      const result = await executeInspectUrl({ siteUrl, inspectionUrl });
      const text = result?.content?.[0]?.text;
      if (text) {
        console.log(text);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error(`[inspect] 探测失败 (${inspectionUrl}):`, err.message);
      console.error(err.stack || '');
    }
  }
}

main();
