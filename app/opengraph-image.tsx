import { ImageResponse } from 'next/og';

/**
 * /opengraph-image — 1200x630 分享卡（Discord / X / Slack / iMessage 通用）
 *
 * 用 Next.js 内置的 next/og 动态渲染成 PNG，不需要任何图片素材。
 * 注意 satori 的限制：只支持 flexbox、必须写内联样式、容器有多子元素时必须显式 display: 'flex'。
 *
 * 渲染要点（避免社交平台出现“黑色边框”）：
 * 1. 最外层画布用显式像素尺寸（1200x630），不要用 100% —— next/og 直接把这个元素当作 satori 根节点，
 *    根节点解析百分比尺寸时没有可靠的父容器参照，画布剩余区域会变成透明像素，Discord / X 会把它渲染成纯黑。
 * 2. 渐变 + 兜底底色都画在最外层画布上，画布自身 padding / margin 均为 0，保证渐变 100% 铺满。
 * 3. 所有留白（安全边距）交给内层内容容器，并用 boxSizing: 'border-box' 保证不撑破画布。
 */

export const runtime = 'edge';

export const alt = 'GSC MCP Core — Query Google Search Console from Cursor & Claude';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** 渐变起始色，同时作为画布兜底底色：即使渐变渲染异常也不会露出黑色 / 透明。 */
const CANVAS_BACKGROUND_COLOR = '#0f172a';
const CANVAS_BACKGROUND_IMAGE =
  'linear-gradient(135deg, #0f172a 0%, #1e293b 58%, #312e81 100%)';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          // 显式画布尺寸：与 size 严格一致，铺满整张 1200x630 PNG
          width: `${size.width}px`,
          height: `${size.height}px`,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: CANVAS_BACKGROUND_COLOR,
          backgroundImage: CANVAS_BACKGROUND_IMAGE,
          // 画布本身零留白，边缘不漏透明 / 底色
          padding: 0,
          margin: 0,
          overflow: 'hidden',
          fontFamily: 'sans-serif',
        }}
      >
        {/* 内容层：留白全部在这里，渐变已经铺满整张画布 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            padding: '72px 80px',
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
                mcp.glq-api.asia
              </div>
              <div style={{ display: 'flex', color: '#a5b4fc', fontSize: '26px' }}>
                striking-distance keywords · index status
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
