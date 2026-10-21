import { NextResponse } from 'next/server';

// 动态 require 现有的 CommonJS 工具模块（避免 Next.js 打包问题）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { executeInspectUrl } = require('../../../src/tools/inspect-url');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { siteUrl, inspectionUrl } = body;

    const args = {
      siteUrl: siteUrl || 'https://glq-api.asia/',
      inspectionUrl: inspectionUrl || siteUrl || 'https://glq-api.asia/',
    };

    const raw = await executeInspectUrl(args);
    const json = JSON.parse(raw.content[0].text);

    return NextResponse.json({ success: true, data: json });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message });
  }
}
