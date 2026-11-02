/**
 * Shared response types for the GSC diagnostic SaaS.
 *
 * These mirror the JSON produced by the MCP tool modules:
 *   - src/tools/inspect-url.js       -> InspectionResult
 *   - src/tools/opportunity-radar.js -> RadarResult
 * `/api/inspect` and `/api/radar` wrap them in `{ success, data }`.
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface RichResultGroup {
  richResultType: string;
  items: (string | null)[];
}

export interface RichResultsResult {
  verdict: string;
  detectedItems: RichResultGroup[];
}

export interface InspectionResult {
  inspectionUrl: string;
  siteUrl: string;
  verdict: string;
  coverageState: string;
  indexingState: string;
  googleCanonical: string | null;
  userCanonical: string | null;
  lastCrawlTime: string | null;
  richResultsResult: RichResultsResult | null;
  summary: string;
  inspectionLink: string | null;
}

export interface Prescription {
  type: string;
  action: string;
  detail: string;
}

export interface RadarOpportunity {
  rank: number;
  query: string;
  currentPosition: number;
  impressions: number;
  clicks: number;
  currentCtr: string;
  targetTier: string;
  targetCtr: string;
  incrementalClicks: number;
  prescriptions: Prescription[];
}

export interface RadarOverview {
  siteUrl: string;
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  daysBack: number;
  filters?: {
    minImpressions: number;
    maxPosition: number;
  };
  totalQueriesScanned?: number;
  opportunitiesFound?: number;
}

export interface CtrTier {
  rankRange: string;
  estimatedCtr: string;
}

export interface RadarResult {
  overview?: RadarOverview;
  message?: string;
  ctrModelNote?: string;
  ctrTiers?: CtrTier[];
  opportunities?: RadarOpportunity[];
  prioritizeTop3?: {
    query: string;
    reason: string;
  }[];
}
