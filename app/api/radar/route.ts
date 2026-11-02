import { NextResponse } from 'next/server';

// Dynamically require the existing CommonJS tool module (avoids Next.js bundling issues)
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { createSupabaseServerClient } from '../../../src/lib/supabase/server';
import { getUserToken } from '../../../src/lib/supabase';
// Dynamically require the existing CommonJS tool module (avoids Next.js bundling issues)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { executeOpportunityRadar } = require('../../../src/tools/opportunity-radar');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createGscClient } = require('../../../src/gsc-client');

// Raise the serverless execution limit above the 10s default.
// Scanning 250 Search Analytics rows on a cold start can exceed 10s, which
// surfaces in the browser as "Failed to fetch".
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized: No active session or user email.' }, { status: 401 });
    }

    const email = session.user.email;
    const userToken = await getUserToken(email);

    if (!userToken?.google_refresh_token) {
      return NextResponse.json({ success: false, error: 'Unauthorized: No Google refresh token found for this user.' }, { status: 401 });
    }

    const refreshToken = userToken.google_refresh_token;
    const gscClient = createGscClient(refreshToken);

    const body = await request.json();
    const { siteUrl, daysBack, minImpressions, maxPosition, topN } = body;

    const args = {
      siteUrl: siteUrl || 'https://glq-api.asia/',
      daysBack: Number(daysBack) || 7,
      minImpressions: Number(minImpressions) || 100,
      maxPosition: Number(maxPosition) || 20,
      topN: Number(topN) || 10,
    };

    const raw = await executeOpportunityRadar(args, gscClient);
    const json = JSON.parse(raw.content[0].text);

    return NextResponse.json({ success: true, data: json });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message });
  }
}
