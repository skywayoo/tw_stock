'use client';
import { useState } from 'react';
import Header from '@/components/layout/Header';
import { useNews, usePublicInfos, useExDividends } from '@/lib/hooks';

const sentimentColor = { bullish: 'text-red-400 bg-red-950', bearish: 'text-green-400 bg-green-950', neutral: 'text-gray-400 bg-gray-800' };
const sentimentLabel = { bullish: '利多', bearish: '利空', neutral: '中性' };

export default function NewsPage() {
  const [tab, setTab] = useState<'news' | 'announcements'>('news');
  const { news, isLoading: newsLoading } = useNews();
  const { publicInfos, isLoading: infoLoading } = usePublicInfos();
  const { exDividends } = useExDividends();

  return (
    <div>
      <Header title="新聞 & 公告" />

      {/* Tabs */}
      <div className="flex border-b border-gray-800 px-4">
        <button
          onClick={() => setTab('news')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'news' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500'}`}>
          新聞摘要
        </button>
        <button
          onClick={() => setTab('announcements')}
          className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'announcements' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500'}`}>
          重大公告
          {(publicInfos.length + exDividends.length) > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">{publicInfos.length + exDividends.length}</span>
          )}
        </button>
      </div>

      <div className="min-h-[calc(100dvh-7rem)] space-y-2 p-4">
        {tab === 'news' ? (
          newsLoading ? (
            <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
          ) : news.length === 0 ? (
            <div className="rounded-xl bg-gray-900 p-6 text-center text-gray-500 text-sm">尚無新聞記錄</div>
          ) : (
            news.map((n) => (
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
            ))
          )
        ) : (
          infoLoading ? (
            <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
          ) : publicInfos.length === 0 && exDividends.length === 0 ? (
            <div className="rounded-xl bg-gray-900 p-6 text-center text-gray-500 text-sm">尚無公告記錄</div>
          ) : (
            <>
              {exDividends.map((e) => (
                <div key={e.id} className="rounded-xl bg-blue-950 border border-blue-800 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400">{e.stockName} ({e.stockId}) · {e.exDate}</p>
                      <p className="text-sm font-medium text-white">除息 {e.cashDividend > 0 ? `現金 ${e.cashDividend}元/股` : ''}{e.stockDividend > 0 ? ` 股票 ${e.stockDividend}元` : ''}</p>
                    </div>
                    <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white">除息</span>
                  </div>
                </div>
              ))}
              {publicInfos.map((info) => (
                <div key={info.id} className={`rounded-xl p-3 ${info.isImportant ? 'bg-yellow-950 border border-yellow-800' : 'bg-gray-900'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">{info.stockName} · {info.date.slice(0, 10)}</p>
                      <p className="text-sm font-medium text-white">{info.title}</p>
                      {info.summary && <p className="mt-0.5 text-xs text-gray-400">{info.summary}</p>}
                    </div>
                    {info.isImportant && <span className="shrink-0 rounded bg-yellow-600 px-1.5 py-0.5 text-xs text-white">重要</span>}
                  </div>
                </div>
              ))}
            </>
          )
        )}
      </div>
    </div>
  );
}
