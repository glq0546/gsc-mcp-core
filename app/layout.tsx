import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GSC 工具测试台',
  description: '本地 Web UI — 直接调用 opportunity-radar 和 inspect-url 工具',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
