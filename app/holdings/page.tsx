'use client';
import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import { useHoldings, useExDividends, useLendings, useStockPrices, useSBL, SBLData } from '@/lib/hooks';
import { Plus, ChevronDown, ChevronUp, Pencil, TrendingUp, Percent, ArrowDownUp } from 'lucide-react';

function fmt(n: number) { return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }

export default function HoldingsPage() {
  const { holdings, isLoading } = useHoldings();
  const { exDividends, mutate: mutateEx } = useExDividends();
  const { lendings } = useLendings();
  const stockIds = holdings.map((h) => h.stockId);
  const { prices } = useStockPrices(stockIds);
  const { sbl } = useSBL(stockIds);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function toggleDeduct(exDivId: string, current: boolean) {
    await fetch('/api/notion/ex-dividend', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: exDivId, deductFromCost: !current }),
    });
    mutateEx();
  }

  return (
    <div>
      <Header title="庫存管理" right={
        <Link href="/holdings/new" className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white active:bg-blue-700">
          <Plus className="h-4 w-4" /> 新增
        </Link>
      } />
      <div className="min-h-[calc(100dvh-4rem)] space-y-3 p-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
        ) : holdings.map((h) => {
          const p = prices[h.stockId];
          const limitUp = p?.limitUp;
          const limitDown = p?.limitDown;
          const exDivs = exDividends.filter((e) => e.stockId === h.stockId);
          const activeLendings = lendings.filter((l) => l.stockId === h.stockId && l.isActive);
          const isOpen = expanded === h.id;
          const totalDeducted = exDivs.filter((e) => e.deductFromCost).reduce((sum, e) => sum + e.cashDividend, 0);
          const effectiveCost = h.avgCost - totalDeducted;
          const pnl = p ? (p.price - effectiveCost) * h.shares * 1000 : null;
          const pnlPct = p && effectiveCost > 0 ? ((p.price - effectiveCost) / effectiveCost) * 100 : null;
          const totalDividend = exDivs.reduce((sum, e) => sum + e.cashDividend * h.shares * 1000, 0);
          const totalLendingInterest = activeLendings.reduce((sum, l) => sum + l.accruedInterest, 0);
          const sblInfo: SBLData = sbl[h.stockId] ?? { value: null, delta: null };

          return (
            <div key={h.id} className={`rounded-2xl overflow-hidden shadow-lg ${limitUp ? 'ring-2 ring-red-500 bg-red-950' : limitDown ? 'ring-2 ring-green-600 bg-green-950' : 'bg-gray-900'}`}>

              {/* Main Card */}
              <div className="p-4">
                {/* Top row: name + edit */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white">{h.stockName}</span>
                      <span className="text-sm text-gray-500">{h.stockId}</span>
                      {limitUp && <span className="animate-pulse rounded-md px-2 py-0.5 text-xs font-bold bg-red-500 text-white">漲停</span>}
                      {limitDown && <span className="animate-pulse rounded-md px-2 py-0.5 text-xs font-bold bg-green-600 text-white">跌停</span>}
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {(h.shares * 1000).toLocaleString()} 股
                      {totalDeducted > 0
                        ? ` · 實際成本 ${effectiveCost.toFixed(2)} 元`
                        : ` · 成本 ${h.avgCost} 元`}
                    </p>
                  </div>
                  <Link href={`/holdings/${h.id}`}
                    className="flex items-center gap-1 rounded-xl bg-gray-800 px-3 py-2 text-sm text-gray-300 active:bg-gray-700">
                    <Pencil className="h-3.5 w-3.5" /> 編輯
                  </Link>
                </div>

                {/* Price row */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold text-white">{p?.price ?? '--'} <span className="text-base font-normal text-gray-500">元</span></p>
                    {p && (
                      <p className={`text-sm font-semibold ${p.changePct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {p.changePct >= 0 ? '▲' : '▼'} {Math.abs(p.changePct).toFixed(2)}%
                        <span className="ml-2 font-normal text-gray-500">({p.changePct >= 0 ? '+' : ''}{p.change?.toFixed(2)})</span>
                      </p>
                    )}
                  </div>
                  {pnl !== null && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">未實現損益</p>
                      <p className={`text-lg font-bold ${pnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                      </p>
                      <p className={`text-sm ${(pnlPct ?? 0) >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {(pnlPct ?? 0) >= 0 ? '+' : ''}{(pnlPct ?? 0).toFixed(2)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Dividend + Lending + SBL summary */}
              {(totalDividend > 0 || totalLendingInterest > 0 || sblInfo.value !== null) && (
                <div className="mx-4 mb-3 flex gap-2">
                  {totalDividend > 0 && (
                    <div className="flex-1 rounded-xl bg-gray-800 px-3 py-2">
                      <p className="text-xs text-gray-500">累積股利</p>
                      <p className="text-sm font-semibold text-yellow-400">+{fmt(totalDividend)} 元</p>
                    </div>
                  )}
                  {totalLendingInterest > 0 && (
                    <div className="flex-1 rounded-xl bg-gray-800 px-3 py-2">
                      <p className="text-xs text-gray-500">借券收益</p>
                      <p className="text-sm font-semibold text-blue-400">+{fmt(totalLendingInterest)} 元</p>
                    </div>
                  )}
                  {sblInfo.value !== null && (
                    <div className="flex-1 rounded-xl bg-gray-800 px-3 py-2">
                      <p className="text-xs text-gray-500">可出借 (9B00)</p>
                      <p className="text-sm font-semibold text-purple-400">
                        {fmt(Math.floor(sblInfo.value / 1000))} 張
                        {sblInfo.delta !== null && (
                          <span className={`ml-1 text-xs font-normal ${sblInfo.delta > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            ({sblInfo.delta > 0 ? '+' : ''}{fmt(Math.floor(sblInfo.delta / 1000))})
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="grid grid-cols-3 border-t border-gray-800">
                <Link href={`/holdings/${h.id}/ex-dividend/new`}
                  className="flex flex-col items-center gap-1 py-3 text-gray-400 active:bg-gray-800 border-r border-gray-800">
                  <Percent className="h-5 w-5" />
                  <span className="text-xs">新增除息</span>
                </Link>
                <Link href={`/holdings/${h.id}/lending/new`}
                  className="flex flex-col items-center gap-1 py-3 text-gray-400 active:bg-gray-800 border-r border-gray-800">
                  <TrendingUp className="h-5 w-5" />
                  <span className="text-xs">設定借券</span>
                </Link>
                <button onClick={() => setExpanded(isOpen ? null : h.id)}
                  className="flex flex-col items-center gap-1 py-3 text-gray-400 active:bg-gray-800">
                  <ArrowDownUp className="h-5 w-5" />
                  <span className="text-xs">明細 {isOpen ? '▲' : '▼'}</span>
                </button>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-gray-800 p-4 space-y-4">
                  {/* Ex-Dividend */}
                  <div>
                    <p className="text-sm font-semibold text-gray-300 mb-2">除息記錄</p>
                    {exDivs.length === 0 ? (
                      <p className="text-sm text-gray-600">無除息記錄</p>
                    ) : exDivs.map((e) => (
                      <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                        <div>
                          <p className="text-sm text-white">{e.exDate}</p>
                          <p className="text-xs text-gray-400">現金股利 {e.cashDividend} 元/股</p>
                        </div>
                        <button onClick={() => toggleDeduct(e.id, e.deductFromCost)}
                          className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${e.deductFromCost ? 'bg-emerald-800 text-emerald-300' : 'bg-gray-700 text-gray-300'}`}>
                          {e.deductFromCost ? '已扣成本' : '扣成本'}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Lending */}
                  {activeLendings.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-300 mb-2">借券中</p>
                      {activeLendings.map((l) => (
                        <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                          <div>
                            <p className="text-sm text-white">{l.sharesLent} 張</p>
                            <p className="text-xs text-gray-400">
                              年利率 {l.annualRate}% − 手續費 {l.brokerFee}% = 淨 {(l.annualRate - l.brokerFee).toFixed(2)}%
                            </p>
                          </div>
                          <Link href={`/holdings/${h.id}/lending/${l.id}/return`}
                            className="rounded-xl bg-red-900 px-3 py-1.5 text-sm font-medium text-red-300 active:bg-red-800">
                            還券
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
