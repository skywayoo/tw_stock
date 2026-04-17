'use client';
import Header from '@/components/layout/Header';
import { useDailyReports } from '@/lib/hooks';

function fmt(n: number) { return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }

export default function ReportsPage() {
  const { reports, isLoading } = useDailyReports();

  return (
    <div>
      <Header title="每日報告" />
      <div className="min-h-[calc(100dvh-4rem)] space-y-3 p-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl bg-gray-900 p-8 text-center text-gray-500">尚無報告，每日收盤後自動生成</div>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="rounded-xl bg-gray-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white">{r.date}</p>
                <p className={`text-sm font-medium ${r.dayChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.dayChange >= 0 ? '▲' : '▼'} {fmt(Math.abs(r.dayChange))}元 ({r.dayChange >= 0 ? '+' : ''}{r.dayChangePct.toFixed(2)}%)
                </p>
              </div>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>市值 {fmt(r.totalValue)}</span>
                <span>成本 {fmt(r.totalCost)}</span>
              </div>
              {r.content && <p className="text-sm text-gray-300 leading-relaxed">{r.content}</p>}
              {r.holdingSnapshots.length > 0 && (
                <div className="border-t border-gray-800 pt-2 space-y-1">
                  {r.holdingSnapshots.map((s) => (
                    <div key={s.stockId} className="flex justify-between text-xs">
                      <span className="text-gray-400">{s.stockName}</span>
                      <span className={s.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {s.closePrice}元 ({s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
