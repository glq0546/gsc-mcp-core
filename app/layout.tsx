import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://mcp.glq-api.asia'),
  title: 'GSC MCP Core — Query Search Console from Cursor & Claude',
  description:
    'Find striking-distance keywords and index issues in natural language — no CSV exports.',
  openGraph: {
    title: 'GSC MCP Core',
    description:
      'Query GSC data directly in Cursor & Claude — find striking-distance keywords and index issues without exporting a single CSV.',
    url: 'https://mcp.glq-api.asia',
    siteName: 'GSC MCP Core',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
