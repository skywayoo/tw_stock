'use client';
import Link from 'next/link';
import { useState } from 'react';
import Header from '@/components/layout/Header';
import { useRealizedPnls, useLendings } from '@/lib/hooks';
import { Plus } from 'lucide-react';
import { Lending, RealizedPnl } from '@/types';

function fmt(n: number) { return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }

function calcPnl(r: RealizedPnl): number {
  const effectiveBuy = r.buyPrice - r.dividendDeducted;
  const gross = (r.sellPrice - effectiveBuy) * r.shares * 1000;
  return gross + r.lendingInterest;
}

type Filter = 'all' | 'sale' | 'lending';

interface UnifiedEntry {
  id: string;
  type: 'sale' | 'lending';
  date: string;
  stockId: string;
  stockName: string;
  pnl: number;
  raw: RealizedPnl | Lending;
}

export default function RealizedPage() {
  const { realizedPnls, isLoading: salesLoading } = useRealizedPnls();
  const { lendings, isLoading: lendingsLoading } = useLendings();
  const [filter, setFilter] = useState<Filter>('all');

  const isLoading = salesLoading || lendingsLoading;

  const saleEntries: UnifiedEntry[] = realizedPnls.map((r) => ({
    id: `sale-${r.id}`,
    type: 'sale',
    date: r.sellDate,
    stockId: r.stockId,
    stockName: r.stockName,
    pnl: calcPnl(r),
    raw: r,
  }));

  const lendingEntries: UnifiedEntry[] = lendings
    .filter((l) => !l.isActive && l.endDate)
    .map((l) => ({
      id: `lending-${l.id}`,
      type: 'lending',
      date: l.endDate!,
      stockId: l.stockId,
      stockName: l.stockName,
      pnl: l.netInterest ?? l.accruedInterest ?? 0,
      raw: l,
    }));

  const totalSale = saleEntries.reduce((s, e) => s + e.pnl, 0);
  const totalLending = lendingEntries.reduce((s, e) => s + e.pnl, 0);
  const totalAll = totalSale + totalLending;

  const visible = (
    filter === 'all'
      ? [...saleEntries, ...lendingEntries]
      : filter === 'sale'
      ? saleEntries
      : lendingEntries
  ).sort((a, b) => b.date.localeCompare(a.date));

  const visibleTotal = visible.reduce((s, e) => s + e.pnl, 0);

  return (
    <div>
      <Header title="已實現損益" right={
        <Link href="/realized/new" className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
          <Plus className="h-3 w-3" /> 新增
        </Link>
      } />
      <div className="min-h-[calc(100dvh-4rem)] space-y-3 p-4">
        {/* Summary */}
        <div className="rounded-xl bg-gray-900 p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">累計已實現損益（全部）</p>
            <p className={`text-2xl font-bold ${totalAll >= 0 ? 'text-red-400' : 'text-green-400'}`}>
              {totalAll >= 0 ? '+' : ''}{fmt(totalAll)} 元
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-gray-800 p-3">
              <p className="text-gray-400 mb-0.5">賣出損益</p>
              <p className={`text-lg font-semibold ${totalSale >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totalSale >= 0 ? '+' : ''}{fmt(totalSale)}
              </p>
              <p className="text-gray-500 mt-0.5">{saleEntries.length} 筆</p>
            </div>
            <div className="rounded-lg bg-gray-800 p-3">
              <p className="text-gray-400 mb-0.5">借券收入</p>
              <p className={`text-lg font-semibold ${totalLending >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totalLending >= 0 ? '+' : ''}{fmt(totalLending)}
              </p>
              <p className="text-gray-500 mt-0.5">{lendingEntries.length} 筆</p>
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { v: 'all', label: '全部', count: saleEntries.length + lendingEntries.length },
            { v: 'sale', label: '賣出', count: saleEntries.length },
            { v: 'lending', label: '借券', count: lendingEntries.length },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setFilter(opt.v as Filter)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === opt.v
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {opt.label} <span className="opacity-70">({opt.count})</span>
            </button>
          ))}
        </div>

        {/* Filtered total */}
        {filter !== 'all' && (
          <div className="text-right text-xs text-gray-400">
            篩選小計：
            <span className={`ml-1 font-semibold ${visibleTotal >= 0 ? 'text-red-400' : 'text-green-400'}`}>
              {visibleTotal >= 0 ? '+' : ''}{fmt(visibleTotal)}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl bg-gray-900 p-8 text-center text-gray-500">尚無記錄</div>
        ) : (
          visible.map((e) => {
            if (e.type === 'sale') {
              const r = e.raw as RealizedPnl;
              const effectiveBuy = r.buyPrice - r.dividendDeducted;
              const pct = effectiveBuy > 0 ? ((r.sellPrice - effectiveBuy) / effectiveBuy) * 100 : 0;
              return (
                <div key={e.id} className="rounded-xl bg-gray-900 p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        <span className="mr-1.5 inline-block rounded bg-blue-900/40 px-1.5 py-0.5 align-middle text-[10px] font-medium text-blue-300">
                          賣出
                        </span>
                        {r.stockName} <span className="text-xs text-gray-500">{r.stockId}</span>
                      </p>
                      <p className="text-xs text-gray-500">{r.sellDate} · {r.shares}張</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${e.pnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {e.pnl >= 0 ? '+' : ''}{fmt(e.pnl)}
                      </p>
                      <p className={`text-xs ${pct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>買入 {r.buyPrice}元{r.dividendDeducted > 0 ? ` (實際 ${effectiveBuy.toFixed(2)})` : ''}</span>
                    <span>賣出 {r.sellPrice}元</span>
                    {r.lendingInterest > 0 && <span>借券 +{fmt(r.lendingInterest)}</span>}
                  </div>
                  {r.notes && <p className="text-xs text-gray-500">{r.notes}</p>}
                </div>
              );
            }
            const l = e.raw as Lending;
            const gross = l.grossInterest ?? l.accruedInterest ?? 0;
            const fee = l.brokerFeeAmount ?? 0;
            const tax = l.withholdingTax ?? 0;
            return (
              <div key={e.id} className="rounded-xl bg-gray-900 p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">
                      <span className="mr-1.5 inline-block rounded bg-emerald-900/40 px-1.5 py-0.5 align-middle text-[10px] font-medium text-emerald-300">
                        借券
                      </span>
                      {l.stockName} <span className="text-xs text-gray-500">{l.stockId}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {l.startDate} ~ {l.endDate} · {fmt(l.sharesLent)} 股 · {l.annualRate}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${e.pnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {e.pnl >= 0 ? '+' : ''}{fmt(e.pnl)}
                    </p>
                    <p className="text-xs text-gray-500">淨收入</p>
                  </div>
                </div>
                {gross > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>毛利息 {fmt(gross)}</span>
                    {fee > 0 && <span>手續費 −{fmt(fee)}</span>}
                    {tax > 0 && <span>稅款 −{fmt(tax)}</span>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
