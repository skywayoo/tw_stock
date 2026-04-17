'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import { useHoldings, useStockPrices, useDailyReports } from '@/lib/hooks';
import { TrendingUp, TrendingDown, Plus, RefreshCw } from 'lucide-react';

function fmt(n: number) { return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }
function pct(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`; }

export default function DashboardPage() {
  const { holdings, isLoading } = useHoldings();
  const stockIds = holdings.map((h) => h.stockId);
  const { prices, mutate: refreshPrices } = useStockPrices(stockIds);
  const { reports } = useDailyReports();

  const latestReport = reports[0];

  let totalValue = 0;
  let totalCost = 0;
  const holdingRows = holdings.map((h) => {
    const p = prices[h.stockId];
    const value = (p?.price ?? h.avgCost) * h.shares * 1000;
    const cost = h.avgCost * h.shares * 1000;
    totalValue += value;
    totalCost += cost;
    return { ...h, price: p?.price, change: p?.change, changePct: p?.changePct, isTrading: p?.isTrading, value, cost };
  });

  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  return (
    <div>
      <Header
        title="台股庫存"
        right={
          <button onClick={() => refreshPrices()} className="rounded-full p-2 text-gray-400 hover:text-white">
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />
      <div className="min-h-[calc(100dvh-4rem)] space-y-4 p-4">

        {/* Summary Card */}
        <div className="rounded-2xl bg-gray-900 p-5">
          <p className="text-xs text-gray-400">總市值</p>
          <p className="mt-1 text-3xl font-bold">{fmt(totalValue)} <span className="text-sm text-gray-400">元</span></p>
          <div className="mt-2 flex items-center gap-4">
            <div>
              <p className="text-xs text-gray-500">成本</p>
              <p className="text-sm font-medium text-gray-300">{fmt(totalCost)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">未實現損益</p>
              <p className={`text-sm font-semibold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)} ({pct(totalPnlPct)})
              </p>
            </div>
          </div>
          {latestReport && (
            <div className="mt-3 border-t border-gray-800 pt-3">
              <p className="text-xs text-gray-500">今日 {latestReport.date}</p>
              <p className={`text-sm font-medium ${latestReport.dayChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {latestReport.dayChange >= 0 ? '▲' : '▼'} {fmt(Math.abs(latestReport.dayChange))} ({pct(latestReport.dayChangePct)})
              </p>
            </div>
          )}
        </div>

        {/* Holdings */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">持股明細</h2>
          <Link href="/holdings/new" className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus className="h-3 w-3" /> 新增
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : holdingRows.length === 0 ? (
          <div className="rounded-xl bg-gray-900 p-8 text-center text-gray-500">
            <p>尚無持股，點右上角新增</p>
          </div>
        ) : (
          <div className="space-y-2">
            {holdingRows.map((h) => (
              <Link key={h.id} href={`/holdings/${h.id}`} className="block rounded-xl bg-gray-900 p-4 hover:bg-gray-800 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">{h.stockName}</p>
                    <p className="text-xs text-gray-500">{h.stockId} · {h.shares}張</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-white">{h.price ? `${h.price}元` : '--'}</p>
                    {h.changePct !== undefined && (
                      <p className={`text-xs font-medium ${(h.changePct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(h.changePct ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(h.changePct ?? 0).toFixed(2)}%
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>成本 {h.avgCost}元</span>
                  <span className={(h.value - h.cost) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {(h.value - h.cost) >= 0 ? '+' : ''}{fmt(h.value - h.cost)}元
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
