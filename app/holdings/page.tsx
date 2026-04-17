'use client';
import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import { useHoldings, useExDividends, useLendings, useStockPrices } from '@/lib/hooks';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';

function fmt(n: number) { return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }

export default function HoldingsPage() {
  const { holdings, isLoading, mutate } = useHoldings();
  const { exDividends, mutate: mutateEx } = useExDividends();
  const { lendings, mutate: mutateLend } = useLendings();
  const stockIds = holdings.map((h) => h.stockId);
  const { prices } = useStockPrices(stockIds);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function toggleDeduct(exDivId: string, current: boolean) {
    await fetch('/api/notion/ex-dividend', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: exDivId, deductFromCost: !current }),
    });
    mutateEx();
  }

  async function returnLending(lendingId: string) {
    if (!confirm('確認還券？')) return;
    const today = new Date().toISOString().split('T')[0];
    const lending = lendings.find((l) => l.id === lendingId);
    await fetch('/api/notion/lending', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lendingId, action: 'return', endDate: today, totalInterest: lending?.accruedInterest ?? 0 }),
    });
    mutateLend();
  }

  return (
    <div>
      <Header title="庫存管理" right={
        <Link href="/holdings/new" className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
          <Plus className="h-3 w-3" /> 新增
        </Link>
      } />
      <div className="min-h-[calc(100dvh-4rem)] space-y-2 p-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
        ) : holdings.map((h) => {
          const p = prices[h.stockId];
          const limitUp = p?.limitUp;
          const limitDown = p?.limitDown;
          const exDivs = exDividends.filter((e) => e.stockId === h.stockId);
          const activeLendings = lendings.filter((l) => l.stockId === h.stockId && l.isActive);
          const isOpen = expanded === h.id;

          // Effective cost after deducting dividends
          const totalDeducted = exDivs.filter((e) => e.deductFromCost).reduce((sum, e) => sum + e.cashDividend, 0);
          const effectiveCost = h.avgCost - totalDeducted;

          return (
            <div key={h.id} className={`rounded-xl overflow-hidden ${limitUp ? 'ring-1 ring-red-500 bg-red-950' : limitDown ? 'ring-1 ring-green-600 bg-green-950' : 'bg-gray-900'}`}>
              <div className="flex items-center justify-between px-4 pt-4 pb-0">
                <Link href={`/holdings/${h.id}`} className="text-xs text-blue-400">編輯</Link>
              </div>
              <button className="w-full p-4 text-left" onClick={() => setExpanded(isOpen ? null : h.id)}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{h.stockName} <span className="text-xs text-gray-500">{h.stockId}</span></p>
                      {limitUp && <span className="animate-pulse rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white">漲停</span>}
                      {limitDown && <span className="animate-pulse rounded px-1.5 py-0.5 text-[10px] font-bold bg-green-600 text-white">跌停</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{h.shares}張 · 成本 {h.avgCost}元{totalDeducted > 0 ? ` (實際 ${effectiveCost.toFixed(2)}元)` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className={`font-bold ${limitUp ? 'text-red-400' : limitDown ? 'text-green-400' : 'text-white'}`}>{p?.price ?? '--'}</p>
                      {p && <p className={`text-xs ${(p.changePct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(p.changePct ?? 0) >= 0 ? '▲' : '▼'}{Math.abs(p.changePct ?? 0).toFixed(2)}%
                      </p>}
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 p-4 space-y-4">
                  {/* Ex-Dividend */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-400">除息記錄</p>
                      <Link href={`/holdings/${h.id}/ex-dividend/new`} className="text-xs text-blue-400">+ 新增</Link>
                    </div>
                    {exDivs.length === 0 ? <p className="text-xs text-gray-600">無記錄</p> : (
                      exDivs.map((e) => (
                        <div key={e.id} className="flex items-center justify-between py-1 text-xs">
                          <span className="text-gray-400">{e.exDate} 現金 {e.cashDividend}元</span>
                          <button onClick={() => toggleDeduct(e.id, e.deductFromCost)}
                            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${e.deductFromCost ? 'bg-emerald-800 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}>
                            {e.deductFromCost ? '已扣成本' : '扣成本'}
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Lending */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-400">借券</p>
                      <Link href={`/holdings/${h.id}/lending/new`} className="text-xs text-blue-400">+ 設定借券</Link>
                    </div>
                    {activeLendings.length === 0 ? <p className="text-xs text-gray-600">未借出</p> : (
                      activeLendings.map((l) => (
                        <div key={l.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">{l.sharesLent}張 · {l.annualRate}%/年 · 累積 {fmt(l.accruedInterest)}元</span>
                          <button onClick={() => returnLending(l.id)}
                            className="rounded bg-red-900 px-2 py-0.5 text-red-300 hover:bg-red-800">還券</button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
