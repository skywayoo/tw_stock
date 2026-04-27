'use client';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import { useHoldings, useStockPrices } from '@/lib/hooks';
import { Plus, RefreshCw } from 'lucide-react';

function fmt(n: number) { return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }
function pct(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`; }

export default function DashboardPage() {
  const { holdings, isLoading } = useHoldings();
  const stockIds = holdings.map((h) => h.stockId);
  const { prices, mutate: refreshPrices } = useStockPrices(stockIds);

  let totalValue = 0;
  let totalCost = 0;
  let dayChange = 0;
  let prevTotalValue = 0;
  let hasAnyPrice = false;
  const holdingRows = holdings.map((h) => {
    const p = prices[h.stockId];
    const value = (p?.price ?? h.avgCost) * h.shares * 1000;
    const cost = h.avgCost * h.shares * 1000;
    totalValue += value;
    totalCost += cost;
    if (p) {
      hasAnyPrice = true;
      const sharesCount = h.shares * 1000;
      dayChange += (p.change ?? 0) * sharesCount;
      const prevClose = p.price - (p.change ?? 0);
      prevTotalValue += prevClose * sharesCount;
    }
    return { ...h, price: p?.price, change: p?.change, changePct: p?.changePct, isTrading: p?.isTrading, limitUp: p?.limitUp, limitDown: p?.limitDown, value, cost };
  });

  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const dayChangePct = prevTotalValue > 0 ? (dayChange / prevTotalValue) * 100 : 0;
  const today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');

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
              <p className={`text-sm font-semibold ${totalPnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)} ({pct(totalPnlPct)})
              </p>
            </div>
          </div>
          {hasAnyPrice && (
            <div className="mt-3 border-t border-gray-800 pt-3">
              <p className="text-xs text-gray-500">今日 {today}</p>
              <p className={`text-sm font-medium ${dayChange >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {dayChange >= 0 ? '▲' : '▼'} {fmt(Math.abs(dayChange))} ({pct(dayChangePct)})
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
              <Link key={h.id} href={`/holdings/${h.id}`} className={`block rounded-xl p-4 transition-colors ${h.limitUp ? 'bg-red-950 hover:bg-red-900 ring-1 ring-red-500' : h.limitDown ? 'bg-green-950 hover:bg-green-900 ring-1 ring-green-600' : 'bg-gray-900 hover:bg-gray-800'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{h.stockName}</p>
                      {h.limitUp && <span className="animate-pulse rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white">漲停</span>}
                      {h.limitDown && <span className="animate-pulse rounded px-1.5 py-0.5 text-[10px] font-bold bg-green-600 text-white">跌停</span>}
                    </div>
                    <p className="text-xs text-gray-500">{h.stockId} · {(h.shares * 1000).toLocaleString()}股</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${h.limitUp ? 'text-red-400' : h.limitDown ? 'text-green-400' : 'text-white'}`}>{h.price ? `${h.price}元` : '--'}</p>
                    {h.changePct !== undefined && (
                      <p className={`text-xs font-medium ${(h.changePct ?? 0) >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {(h.changePct ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(h.changePct ?? 0).toFixed(2)}%
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>成本 {h.avgCost}元</span>
                  <span className={(h.value - h.cost) >= 0 ? 'text-red-400' : 'text-green-400'}>
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
