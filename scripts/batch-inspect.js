/**
 * scripts/batch-inspect.js
 *
 * 批量探测 charge-decode/pages/ 目录下所有 .html 文件的 Google 收录状态。
 * 读取本地 HTML 文件名 → 拼接为无后缀 URL → 逐个调用 URL Inspection API，
 * 每隔 2 秒探测一个，避免并发超限。最终输出统计摘要。
 *
 * 运行命令：
 *   node scripts/batch-inspect.js
 *
 * 可选环境变量：
 *   SITE_URL          — GSC 站点 URL（默认 https://glq-api.asia/）
 *   PAGES_DIR         — HTML 文件所在目录（默认 ../bulletwork-repo/charge-decode/pages）
 *   INSPECT_DELAY_MS  — 每次探测间隔毫秒数（默认 2000）
 */

const fs = require('fs');
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

// ── 加载核心探测函数 ──────────────────────────────────────────
const { executeInspectUrl } = require('../src/tools/inspect-url');

// ── 配置 ──────────────────────────────────────────────────────
const SITE_URL = process.env.SITE_URL || 'https://glq-api.asia/';
const PAGES_DIR =
  process.env.PAGES_DIR ||
  path.join(__dirname, '..', '..', 'bulletwork-repo', 'charge-decode', 'pages');
const INSPECT_DELAY_MS = parseInt(process.env.INSPECT_DELAY_MS || '2000', 10);
const BASE_URL = `${SITE_URL.replace(/\/$/, '')}/charge-decode/pages/`;

// ── 工具函数 ──────────────────────────────────────────────────

/** 延时 sleep */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 从 .html 文件名生成无后缀 URL */
function htmlFileToUrl(filename) {
  const slug = filename.replace(/\.html?$/i, '');
  return `${BASE_URL}${slug}`;
}

// ── 主流程 ────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('🔍 批量收录探测 — Google URL Inspection API');
  console.log('='.repeat(60));
  console.log(`📂 目录: ${PAGES_DIR}`);
  console.log(`🌐 站点: ${SITE_URL}`);
  console.log(`⏱️  间隔: ${INSPECT_DELAY_MS}ms`);
  console.log('');

  // Step 1: 读取所有 .html 文件
  if (!fs.existsSync(PAGES_DIR)) {
    console.error(`❌ 目录不存在: ${PAGES_DIR}`);
    console.error('   请设置环境变量 PAGES_DIR 或确认 charge-decode/pages/ 路径');
    process.exit(1);
  }

  const allFiles = fs.readdirSync(PAGES_DIR);
  const htmlFiles = allFiles.filter((f) => /\.html?$/i.test(f));

  if (htmlFiles.length === 0) {
    console.warn(`⚠️  目录中未找到 .html 文件: ${PAGES_DIR}`);
    process.exit(0);
  }

  console.log(`📄 发现 ${htmlFiles.length} 个 HTML 文件，开始逐个探测...\n`);

  // Step 2: 逐个探测
  const results = [];

  for (let i = 0; i < htmlFiles.length; i++) {
    const filename = htmlFiles[i];
    const inspectionUrl = htmlFileToUrl(filename);
    const index = i + 1;
    const total = htmlFiles.length;

    console.log(`[${index}/${total}] ${'-'.repeat(50)}`);
    console.log(`🔗 ${inspectionUrl}`);

    try {
      const result = await executeInspectUrl({
        siteUrl: SITE_URL,
        inspectionUrl,
      });

      const text = result?.content?.[0]?.text;
      const data = JSON.parse(text);

      const verdict = data.verdict || 'UNKNOWN';
      const coverageState = data.coverageState || '未知';

      // 实时打印 verdict 和 coverageState
      const icon =
        verdict === 'PASS'
          ? '✅'
          : verdict === 'FAIL'
            ? '❌'
            : verdict === 'NEUTRAL'
              ? '⚠️'
              : '❓';
      console.log(`${icon} verdict: ${verdict}  |  coverageState: ${coverageState}`);

      results.push({ filename, inspectionUrl, verdict, coverageState, success: true });
    } catch (err) {
      console.error(`💥 探测失败: ${err.message}`);
      results.push({
        filename,
        inspectionUrl,
        verdict: 'ERROR',
        coverageState: err.message,
        success: false,
      });
    }

    // 间隔延迟（最后一个不用等）
    if (i < htmlFiles.length - 1) {
      await sleep(INSPECT_DELAY_MS);
    }
  }

  // Step 3: 统计摘要
  console.log('\n');
  console.log('='.repeat(60));
  console.log('📊 统计摘要');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.verdict === 'PASS');
  const crawledNotIndexed = results.filter(
    (r) => r.coverageState === 'Crawled - currently not indexed'
  );
  const otherErrors = results.filter(
    (r) => r.verdict !== 'PASS' && r.coverageState !== 'Crawled - currently not indexed'
  );

  console.log(`\n📁 总文件数:     ${results.length}`);
  console.log(`✅ PASS (已收录): ${passed.length}`);
  console.log(`🕷️  Crawled - currently not indexed: ${crawledNotIndexed.length}`);
  console.log(`💥 其他错误:     ${otherErrors.length}`);

  if (passed.length > 0) {
    console.log(`\n✅ 已收录页面 (${passed.length}):`);
    passed.forEach((r) => console.log(`   • ${r.inspectionUrl}`));
  }

  if (crawledNotIndexed.length > 0) {
    console.log(`\n🕷️ 已抓取但未收录 (${crawledNotIndexed.length}):`);
    crawledNotIndexed.forEach((r) => console.log(`   • ${r.inspectionUrl}`));
  }

  if (otherErrors.length > 0) {
    console.log(`\n💥 其他错误 (${otherErrors.length}):`);
    otherErrors.forEach((r) =>
      console.log(`   • ${r.inspectionUrl}  —  ${r.verdict}: ${r.coverageState}`)
    );
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('🏁 批量探测完成');
  console.log('='.repeat(60));
}

main();
