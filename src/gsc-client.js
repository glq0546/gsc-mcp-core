/**
 * GSC Client 共享模块
 *
 * 从 .env.local 读取 OAuth 凭据，创建并返回已认证的 google.searchconsole 客户端。
 * 所有 MCP 工具通过 getGscClient() 复用同一客户端，避免重复认证逻辑。
 *
 * 凭据来源（Day 1 已打通）：
 *   - GOOGLE_CLIENT_ID
 *   - GOOGLE_CLIENT_SECRET
 *   - GOOGLE_REFRESH_TOKEN
 *   - GOOGLE_REDIRECT_URI
 */

const { google } = require('googleapis');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// ── 校验环境变量 ──────────────────────────────────────────────
const REQUIRED_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
];

const missing = REQUIRED_KEYS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `缺少环境变量: ${missing.join(', ')}\n` +
    `请确保 .env.local 中已填入 Day 1 获取的凭据。`
  );
}

// ── 代理配置（Windows 系统代理自动检测） ──────────────────────
// Node.js googleapis 不使用系统代理，需要手动注入 agent。
// 优先读取 env 中的 HTTPS_PROXY，否则尝试 Windows 注册表默认代理。
function getProxyAgent() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (proxyUrl) {
    return new HttpsProxyAgent(proxyUrl);
  }

  // Windows 注册表回退（Clash/V2Ray 等本地代理）
  try { // eslint-disable-next-line global-require
    const { execSync } = require('child_process');
    const regOutput = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const match = regOutput.match(/ProxyServer\s+REG_SZ\s+(.+)/);
    if (match && match[1].trim()) {
      const server = match[1].trim();
      return new HttpsProxyAgent(`http://${server}`);
    }
  } catch (_) {
    // 忽略注册表读取失败
  }
  return undefined;
}

const proxyAgent = getProxyAgent();

// ── 单例 OAuth2 客户端（自动通过 refresh_token 换取 access_token） ──
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// ── 代理注入（googleapis v186 的 transporter 不自动使用系统代理）
// 必须通过 transporter.defaults.agent 注入，才能覆盖 OAuth token 刷新和 API 调用。
if (proxyAgent) {
  oauth2Client.transporter.defaults = { ...oauth2Client.transporter.defaults, agent: proxyAgent };
}

// ── Search Console API 客户端 ──────────────────────────────────
const searchconsole = google.searchconsole({
  version: 'v1',
  auth: oauth2Client,
});

/**
 * 返回已认证的 Google Search Console API 客户端。
 * @returns {import('googleapis').searchconsole_v1.Searchconsole}
 */
function getGscClient() {
  return searchconsole;
}

/**
 * 返回已认证的 OAuth2 客户端（用于 sites.list 等操作）。
 * @returns {import('googleapis').OAuth2Client}
 */
function getAuthClient() {
  return oauth2Client;
}

/**
 * 工具函数：计算日期范围字符串 [startDate, endDate]。
 * GSC 数据通常有 1-3 天延迟，默认 endDate = 昨天。
 * @param {number} daysBack - 回溯天数（含今天）
 * @returns {{ startDate: string, endDate: string }}
 */
function getDateRange(daysBack = 7) {
  const fmt = (d) => d.toISOString().split('T')[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // 昨天
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (daysBack - 1));
  return { startDate: fmt(startDate), endDate: fmt(endDate) };
}

module.exports = { getGscClient, getAuthClient, getDateRange };
