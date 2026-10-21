/**
 * 极简本地 Web UI — 用于测试 GSC MCP 工具（无需 MCP client）
 *
 * 启动: npm run web
 * 访问: http://localhost:8080
 */

const path = require('path');
const express = require('express');
const { executeOpportunityRadar } = require('./tools/opportunity-radar');
const { executeInspectUrl } = require('./tools/inspect-url');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── 首页 ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.render('index', { result: null, error: null });
});

// ── API: 扫描机会词 ───────────────────────────────────────────
app.post('/api/opportunity-radar', async (req, res) => {
  try {
    const { siteUrl, daysBack, minImpressions, maxPosition, topN } = req.body;
    const args = {
      siteUrl: siteUrl || 'https://glq-api.asia/',
      daysBack: Number(daysBack) || 7,
      minImpressions: Number(minImpressions) || 100,
      maxPosition: Number(maxPosition) || 20,
      topN: Number(topN) || 10,
    };
    const raw = await executeOpportunityRadar(args);
    const json = JSON.parse(raw.content[0].text);
    res.json({ success: true, data: json });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── API: 探测收录 ─────────────────────────────────────────────
app.post('/api/inspect-url', async (req, res) => {
  try {
    const { siteUrl, inspectionUrl } = req.body;
    const args = {
      siteUrl: siteUrl || 'https://glq-api.asia/',
      inspectionUrl: inspectionUrl || siteUrl || 'https://glq-api.asia/',
    };
    const raw = await executeInspectUrl(args);
    const json = JSON.parse(raw.content[0].text);
    res.json({ success: true, data: json });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  GSC Web UI 已启动`);
  console.log(`  → http://localhost:${PORT}\n`);
});
