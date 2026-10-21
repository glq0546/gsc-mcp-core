/**
 * GSC 数据测试脚本 (Day 1)
 *
 * 从 https://glq-api.asia/ 拉取最近 7 天的 Search Analytics 数据
 * 输出: clicks / impressions / ctr / position
 *
 * 前置条件：
 * - .env.local 中有 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
 * - 该 Google 账号有 glq-api.asia 的 GSC 权限
 */

const { google } = require('googleapis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SITE_URL = 'https://glq-api.asia/';
const DAYS_BACK = 7;

// 检查环境变量
const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('\n❌ 缺少环境变量：');
  missing.forEach(k => console.error(`   - ${k}`));
  console.error('\n   请先运行: node scripts/oauth-flow.js');
  console.error('   然后把输出的 GOOGLE_REFRESH_TOKEN 填入 .env.local\n');
  process.exit(1);
}

async function main() {
  // 创建 OAuth2 客户端
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
  );

  // 设置 refresh_token，googleapis 会自动换取 access_token
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  // 初始化 Search Console API
  const searchconsole = google.searchconsole({
    version: 'v1',
    auth: oauth2Client,
  });

  // 计算日期范围（最近 7 天）
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // 昨天（GSC 数据有延迟）
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (DAYS_BACK - 1));

  const fmt = (d) => d.toISOString().split('T')[0];

  console.log('\n========================================');
  console.log('  GSC 数据拉取测试 (Day 1)');
  console.log('========================================\n');
  console.log(`站点: ${SITE_URL}`);
  console.log(`时间范围: ${fmt(startDate)} ~ ${fmt(endDate)} (${DAYS_BACK} 天)\n`);

  try {
    // Step 1: 先验证站点权限
    console.log('正在获取站点列表...');
    const sites = await searchconsole.sites.list();
    const siteList = sites.data.siteEntry || [];
    console.log(`已授权站点 (${siteList.length} 个):`);
    siteList.forEach(s => console.log(`  - ${s.siteUrl} (${s.permissionLevel})`));
    console.log();

    const hasAccess = siteList.some(s => s.siteUrl === SITE_URL || s.siteUrl === SITE_URL.replace(/\/$/, ''));
    if (!hasAccess) {
      console.warn(`⚠️  ${SITE_URL} 不在已授权站点列表中。`);
      console.warn('   请确保该 Google 账号已被添加为 GSC 站点的所有者或用户。\n');
    }

    // Step 2: 查询 Search Analytics（按日期汇总）
    console.log('正在拉取 Search Analytics 数据...\n');

    const response = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['date'],
        rowLimit: 50,
      },
    });

    const rows = response.data.rows || [];

    if (rows.length === 0) {
      console.log('⚠️  该时间段内无数据。');
      console.log('   可能原因：');
      console.log('   1. 站点确实没有流量');
      console.log('   2. 时间范围太近（GSC 通常有 1-3 天延迟）');
      console.log('   3. 站点 URL 格式不匹配（试试 https://glq-api.asia 或 https://www.glq-api.asia）\n');
      return;
    }

    // 打印表头
    console.log('----------------------------------------');
    console.log('  日期       点击    展现    CTR     排名');
    console.log('----------------------------------------');

    let totalClicks = 0;
    let totalImpressions = 0;

    // 只打印前 20 行
    const displayRows = rows.slice(0, 20);
    displayRows.forEach(row => {
      const date = row.keys[0];
      const clicks = row.clicks;
      const impressions = row.impressions;
      const ctr = (row.ctr * 100).toFixed(2);
      const position = row.position.toFixed(1);
      totalClicks += clicks;
      totalImpressions += impressions;
      console.log(
        `  ${date}  ${String(clicks).padStart(6)}  ${String(impressions).padStart(6)}  ${ctr.padStart(6)}%  ${position.padStart(6)}`
      );
    });

    if (rows.length > 20) {
      console.log(`  ... 还有 ${rows.length - 20} 行数据未显示`);
    }

    console.log('----------------------------------------');

    // 汇总
    const totalCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';
    const avgPosition = rows.reduce((sum, r) => sum + r.position, 0) / rows.length;

    console.log(`  汇总     ${String(Math.round(totalClicks)).padStart(6)}  ${String(Math.round(totalImpressions)).padStart(6)}  ${totalCtr.padStart(6)}%  ${avgPosition.toFixed(1).padStart(6)}`);
    console.log('----------------------------------------\n');

    console.log('🎉 Day 1 数据拉取成功！\n');

    // Step 3: 额外拉取 Top 查询词（前 10）
    console.log('--- Top 10 查询词 (按点击排序) ---\n');

    const queryResponse = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['query'],
        rowLimit: 10,
      },
    });

    const queryRows = queryResponse.data.rows || [];
    if (queryRows.length > 0) {
      console.log('  查询词                点击    展现    CTR      排名');
      console.log('  --------------------- ------ ------ ------- ------');
      queryRows.forEach(row => {
        const query = row.keys[0].length > 20 ? row.keys[0].slice(0, 20) + '...' : row.keys[0];
        const clicks = row.clicks;
        const impressions = row.impressions;
        const ctr = (row.ctr * 100).toFixed(2);
        const position = row.position.toFixed(1);
        console.log(
          `  ${query.padEnd(21)} ${String(clicks).padStart(6)} ${String(impressions).padStart(6)} ${(ctr + '%').padStart(7)} ${position.padStart(6)}`
        );
      });
      console.log();
    }

  } catch (err) {
    console.error('\n❌ 请求失败：');

    if (err.response) {
      const { status, data } = err.response;
      console.error(`   HTTP ${status}: ${data.error?.message || JSON.stringify(data)}`);

      if (status === 401) {
        console.error('\n   Token 可能已过期或无效。请重新运行: node scripts/oauth-flow.js\n');
      }
      if (status === 403) {
        console.error('\n   权限不足。请确保 Google 账号有该站点的 GSC 权限。\n');
      }
    } else {
      console.error(`   ${err.message}\n`);
    }

    process.exit(1);
  }
}

main();
