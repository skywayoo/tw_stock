'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, BookOpen, Newspaper, TrendingUp, Settings } from 'lucide-react';

const nav = [
  { href: '/', label: '總覽', icon: BarChart2 },
  { href: '/holdings', label: '庫存', icon: BookOpen },
  { href: '/news', label: '新聞', icon: Newspaper },
  { href: '/reports', label: '報告', icon: TrendingUp },
  { href: '/settings', label: '設定', icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-gray-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link key={href} href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${active ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
