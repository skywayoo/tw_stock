'use client';
import Header from '@/components/layout/Header';
import { useNews, usePublicInfos } from '@/lib/hooks';

const sentimentColor = { bullish: 'text-emerald-400 bg-emerald-950', bearish: 'text-red-400 bg-red-950', neutral: 'text-gray-400 bg-gray-800' };
const sentimentLabel = { bullish: '利多', bearish: '利空', neutral: '中性' };

export default function NewsPage() {
  const { news, isLoading } = useNews();
  const { publicInfos } = usePublicInfos();

  return (
    <div>
      <Header title="新聞 & 公告" />
      <div className="min-h-[calc(100dvh-4rem)] space-y-4 p-4">

        {/* Public Announcements */}
        {publicInfos.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">重大公告</h2>
            <div className="space-y-2">
              {publicInfos.slice(0, 5).map((info) => (
                <div key={info.id} className={`rounded-xl p-3 ${info.isImportant ? 'bg-yellow-950 border border-yellow-800' : 'bg-gray-900'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">{info.stockName} · {info.date.slice(0, 10)}</p>
                      <p className="text-sm font-medium text-white">{info.title}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{info.summary}</p>
                    </div>
                    {info.isImportant && <span className="shrink-0 rounded bg-yellow-600 px-1.5 py-0.5 text-xs text-white">重要</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* News Digest */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">新聞摘要</h2>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
          ) : news.length === 0 ? (
            <div className="rounded-xl bg-gray-900 p-6 text-center text-gray-500 text-sm">尚無新聞記錄</div>
          ) : (
            <div className="space-y-2">
              {news.map((n) => (
                <div key={n.id} className="rounded-xl bg-gray-900 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">{n.stockName} · {n.date.slice(0, 16).replace('T', ' ')}</p>
                      <p className="text-sm font-medium text-white">{n.summary}</p>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${sentimentColor[n.sentiment]}`}>
                      {sentimentLabel[n.sentiment]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
