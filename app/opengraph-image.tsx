import { ImageResponse } from 'next/og';

/**
 * /opengraph-image — 1200x630 分享卡（Discord / X / Slack / iMessage 通用）
 *
 * 用 Next.js 内置的 next/og 动态渲染成 PNG，不需要任何图片素材。
 * 注意 satori 的限制：只支持 flexbox、必须写内联样式、容器有多子元素时必须显式 display: 'flex'。
 */

export const runtime = 'edge';

export const alt = 'GSC MCP Core — Query Google Search Console from Cursor & Claude';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0f172a',
          backgroundImage:
            'linear-gradient(135deg, #0f172a 0%, #1e293b 58%, #312e81 100%)',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* 顶部标签 */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 24px',
              border: '1px solid rgba(148, 163, 184, 0.45)',
              borderRadius: '999px',
              color: '#cbd5e1',
              fontSize: '24px',
              letterSpacing: '0.04em',
            }}
          >
            FREE BETA · REMOTE MCP SERVER
          </div>
        </div>

        {/* 主标题 + 副标题 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: '112px',
              letterSpacing: '-0.035em',
              lineHeight: 1,
            }}
          >
            GSC MCP Core
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: '30px',
              color: '#cbd5e1',
              fontSize: '38px',
              lineHeight: 1.35,
            }}
          >
            Query Google Search Console from Cursor & Claude
          </div>
        </div>

        {/* 底部信息条 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              height: '6px',
              width: '100%',
              borderRadius: '999px',
              backgroundImage: 'linear-gradient(90deg, #6366f1 0%, #22d3ee 100%)',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '26px',
            }}
          >
            <div style={{ display: 'flex', color: '#e2e8f0', fontSize: '28px' }}>
              gsc-mcp-core.vercel.app
            </div>
            <div style={{ display: 'flex', color: '#a5b4fc', fontSize: '26px' }}>
              striking-distance keywords · index status
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
