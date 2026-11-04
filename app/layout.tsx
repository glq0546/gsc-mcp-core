import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://gsc-mcp-core.vercel.app'),
  title: 'GSC MCP Core — Query Search Console from Cursor & Claude',
  description:
    'Find striking-distance keywords and index issues in natural language — no CSV exports.',
  openGraph: {
    title: 'GSC MCP Core',
    description:
      'Query GSC data directly in Cursor & Claude — find striking-distance keywords and index issues without exporting a single CSV.',
    url: 'https://gsc-mcp-core.vercel.app',
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
