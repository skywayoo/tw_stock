import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/layout/BottomNav';

export const metadata: Metadata = {
  title: '台股庫存追蹤',
  description: '台灣股票庫存即時追蹤與分析',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: '台股' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  userScalable: false, viewportFit: 'cover', themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className="bg-gray-950 font-sans text-white antialiased">
        <main className="mx-auto max-w-lg pb-24">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
