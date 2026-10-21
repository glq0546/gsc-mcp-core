/**
 * scripts/run-radar.js
 *
 * 直接调用 gsc_opportunity_radar 的工具函数（不经 MCP 协议），
 * 扫描指定站点最近 N 天的 SEO 机会词，结果以 JSON 输出到控制台。
 *
 * 运行命令：
 *   node scripts/run-radar.js
 *
 * 代理配置（与 src/gsc-client.js 一致）：
 *   优先读取环境变量 HTTPS_PROXY / HTTP_PROXY，
 *   否则回退到 Windows 注册表系统代理。
 */

const path = require('path');

// ── 加载 .env.local（含 OAuth 凭据） ───────────────────────────
require('dotenv').config({
  path: path.join(__dirname, '..', '.env.local'),
});

// ── 确保代理环境变量被加载（兼容 Windows 下未显式 export 的场景） ──
// gsc-client.js 内的 getProxyAgent() 已处理注册表回退，
// 此处仅做兜底：若 env 中无代理变量，尝试从注册表读取并注入。
function ensureProxyEnv() {
  if (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  ) {
    return; // 已有显式配置，跳过
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

// ── 调用 gsc_opportunity_radar 核心函数 ─────────────────────────
const { executeOpportunityRadar } = require('../src/tools/opportunity-radar');

const args = {
  siteUrl: 'https://glq-api.asia/',
  daysBack: 30,
  minImpressions: 1,
  maxPosition: 50,
  topN: 10,
};

executeOpportunityRadar(args)
  .then((result) => {
    // result.content[0].text 是 JSON 字符串，直接打印
    const text = result?.content?.[0]?.text;
    if (text) {
      console.log(text);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  })
  .catch((err) => {
    console.error('[run-radar] 执行失败:', err.message);
    console.error(err.stack || '');
    process.exit(1);
  });
