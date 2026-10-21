import { NextResponse } from 'next/server';

// Dynamically require the existing CommonJS tool module (avoids Next.js bundling issues)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { executeOpportunityRadar } = require('../../../src/tools/opportunity-radar');

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { siteUrl, daysBack, minImpressions, maxPosition, topN } = body;

    const args = {
      siteUrl: siteUrl || 'https://glq-api.asia/',
      daysBack: Number(daysBack) || 7,
      minImpressions: Number(minImpressions) || 100,
      maxPosition: Number(maxPosition) || 20,
      topN: Number(topN) || 10,
    };

    const raw = await executeOpportunityRadar(args);
    const json = JSON.parse(raw.content[0].text);

    return NextResponse.json({ success: true, data: json });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message });
  }
}
