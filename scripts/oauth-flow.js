/**
 * GSC OAuth 授权流程 (Day 1)
 *
 * 流程：
 * 1. 启动本地 HTTP 服务监听 3000 端口
 * 2. 打印 Google OAuth 同意屏幕 URL
 * 3. 用户在浏览器授权后，Google 回调到 /oauth2callback
 * 4. 拿到 code，换取 access_token + refresh_token
 * 5. 把 refresh_token 打印到控制台，用户手动存入 .env.local
 *
 * 前置条件：
 * - .env.local 中已填入 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * - Google Cloud Console 中 OAuth 客户端已配置回调 URI: http://localhost:3000/oauth2callback
 */

const http = require('http');
const { google } = require('googleapis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const PORT = 3000;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

// 检查环境变量
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('\n❌ 缺少环境变量！');
  console.error('   请确保项目根目录有 .env.local，包含：');
  console.error('   GOOGLE_CLIENT_ID=...');
  console.error('   GOOGLE_CLIENT_SECRET=...');
  console.error('   GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback\n');
  process.exit(1);
}

// 生成授权 URL（请求 offline access 以获取 refresh_token）
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',           // 必须，否则拿不到 refresh_token
  prompt: 'consent',                // 强制显示同意屏幕，确保拿到 refresh_token
  scope: [
    'https://www.googleapis.com/auth/webmasters.readonly',
  ],
});

console.log('\n========================================');
console.log('  GSC OAuth 授权流程 (Day 1)');
console.log('========================================\n');
console.log('请在浏览器打开以下链接：\n');
console.log(`  ${authUrl}\n`);
console.log('授权完成后，Google 会自动跳转到本地回调地址。');
console.log('授权结果将显示在此处。\n');
console.log('----------------------------------------\n');

// 启动本地 HTTP 服务
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/oauth2callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>授权失败</h1><p>错误: ${error}</p>`);
      console.error(`\n❌ 授权错误: ${error}\n`);
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>缺少 code 参数</h1>`);
      console.error('\n❌ 回调缺少 code 参数\n');
      server.close();
      process.exit(1);
    }

    try {
      // 用 code 换 token
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      console.log('✅ 授权成功！\n');
      console.log('----------------------------------------');
      console.log('  请复制以下内容到 .env.local：');
      console.log('----------------------------------------\n');

      if (tokens.refresh_token) {
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      } else {
        console.log('⚠️  未返回 refresh_token（可能之前已授权过，Google 不会重复下发）');
        console.log('   如需重新获取，请在 Google 账号的 "第三方应用授权" 中移除本应用，然后重试。\n');
      }

      console.log(`Access Token : ${tokens.access_token}`);
      console.log(`Token Type   : ${tokens.token_type}`);
      if (tokens.expiry_date) {
        const expiry = new Date(tokens.expiry_date);
        console.log(`Expires At   : ${expiry.toISOString()}`);
      }
      console.log('\n----------------------------------------\n');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <head><title>GSC OAuth 授权成功</title></head>
          <body style="font-family: sans-serif; padding: 40px;">
            <h1>✅ 授权成功！</h1>
            <p>请回到终端查看 token 信息。</p>
            <p>把输出的 GOOGLE_REFRESH_TOKEN 复制到 .env.local 中。</p>
            <p>此页面可以关闭。</p>
          </body>
        </html>
      `);

      // 关闭服务
      server.close();
      console.log('🎉 Day 1 授权完成！现在可以运行: node scripts/test-gsc.js\n');
      process.exit(0);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Token 交换失败</h1><p>${err.message}</p>`);
      console.error(`\n❌ Token 交换失败: ${err.message}\n`);
      server.close();
      process.exit(1);
    }
  } else {
    // 根路径，显示简单指引
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <head><title>GSC OAuth</title></head>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>GSC MCP - OAuth 回调服务</h1>
          <p>等待 Google 授权回调...</p>
          <p>如果看到此页面，说明本地服务已启动。请在浏览器打开终端中显示的授权链接。</p>
        </body>
      </html>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`本地回调服务已启动: http://localhost:${PORT}`);
  console.log(`回调地址: ${REDIRECT_URI}\n`);
});
