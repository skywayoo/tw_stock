'use client';
import Link from 'next/link';
import { useState } from 'react';
import Header from '@/components/layout/Header';
import { useRealizedPnls } from '@/lib/hooks';
import { Plus } from 'lucide-react';
import { RealizedPnl } from '@/types';

function fmt(n: number) { return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }

function calcSalePnl(r: RealizedPnl): number {
  const effectiveBuy = r.buyPrice - r.dividendDeducted;
  const gross = (r.sellPrice - effectiveBuy) * r.shares * 1000;
  return gross + (r.lendingInterest || 0);
}

function entryPnl(r: RealizedPnl): number {
  if (r.type === 'lending_return' || r.type === 'fee_rebate' || r.type === 'dividend') return r.netInterest ?? 0;
  return calcSalePnl(r);
}

function entryDate(r: RealizedPnl): string { return r.sellDate; }

type TypeFilter = 'all' | 'sale' | 'lending_return' | 'fee_rebate' | 'day_trade' | 'dividend';

export default function RealizedPage() {
  const { realizedPnls, isLoading } = useRealizedPnls();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const all = realizedPnls;

  const matchesDate = (r: RealizedPnl) => {
    const d = entryDate(r);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  };

  const matchesType = (r: RealizedPnl) =>
    typeFilter === 'all' || r.type === typeFilter;

  const visible = all
    .filter(matchesDate)
    .filter(matchesType)
    .sort((a, b) => entryDate(b).localeCompare(entryDate(a)));

  // Totals respect date filter only (so type filter shows the same numerator/denominator)
  const dateScoped = all.filter(matchesDate);
  const sales = dateScoped.filter((r) => r.type === 'sale');
  const dayTrades = dateScoped.filter((r) => r.type === 'day_trade');
  const returns = dateScoped.filter((r) => r.type === 'lending_return');
  const rebates = dateScoped.filter((r) => r.type === 'fee_rebate');
  const dividends = dateScoped.filter((r) => r.type === 'dividend');

  const totalSale = sales.reduce((s, r) => s + calcSalePnl(r), 0);
  const totalDayTrade = dayTrades.reduce((s, r) => s + calcSalePnl(r), 0);
  const totalReturnNet = returns.reduce((s, r) => s + (r.netInterest ?? 0), 0);
  const totalReturnGross = returns.reduce((s, r) => s + (r.grossInterest ?? 0), 0);
  const totalReturnFee = returns.reduce((s, r) => s + (r.brokerFeeAmount ?? 0), 0);
  const totalReturnTax = returns.reduce((s, r) => s + (r.withholdingTax ?? 0), 0);
  const totalRebate = rebates.reduce((s, r) => s + (r.netInterest ?? 0), 0);
  const totalDividend = dividends.reduce((s, r) => s + (r.netInterest ?? 0), 0);
  const totalAll = totalSale + totalDayTrade + totalReturnNet + totalRebate + totalDividend;

  const visibleTotal = visible.reduce((s, r) => s + entryPnl(r), 0);

  return (
    <div>
      <Header title="已實現損益" right={
        <Link href="/realized/new" className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
          <Plus className="h-3 w-3" /> 新增
        </Link>
      } />
      <div className="min-h-[calc(100dvh-4rem)] space-y-3 p-4">
        {/* Top summary */}
        <div className="rounded-xl bg-gray-900 p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">
              累計已實現損益
              {(startDate || endDate) && (
                <span className="ml-1 text-gray-500">
                  ({startDate || '…'} ~ {endDate || '…'})
                </span>
              )}
            </p>
            <p className={`text-2xl font-bold ${totalAll >= 0 ? 'text-red-400' : 'text-green-400'}`}>
              {totalAll >= 0 ? '+' : ''}{fmt(totalAll)} 元
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-gray-800 p-3">
              <p className="text-gray-400 mb-0.5">賣出損益</p>
              <p className={`text-lg font-semibold ${totalSale >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totalSale >= 0 ? '+' : ''}{fmt(totalSale)}
              </p>
              <p className="text-gray-500 mt-0.5">{sales.length} 筆</p>
            </div>
            <div className="rounded-lg bg-gray-800 p-3">
              <p className="text-gray-400 mb-0.5">當沖損益</p>
              <p className={`text-lg font-semibold ${totalDayTrade >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totalDayTrade >= 0 ? '+' : ''}{fmt(totalDayTrade)}
              </p>
              <p className="text-gray-500 mt-0.5">{dayTrades.length} 筆</p>
            </div>
            <div className="rounded-lg bg-gray-800 p-3">
              <p className="text-gray-400 mb-0.5">股息</p>
              <p className={`text-lg font-semibold ${totalDividend >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totalDividend >= 0 ? '+' : ''}{fmt(totalDividend)}
              </p>
              <p className="text-gray-500 mt-0.5">{dividends.length} 筆</p>
            </div>
            <div className="rounded-lg bg-gray-800 p-3">
              <p className="text-gray-400 mb-0.5">還券收入</p>
              <p className={`text-lg font-semibold ${totalReturnNet >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totalReturnNet >= 0 ? '+' : ''}{fmt(totalReturnNet)}
              </p>
              <p className="text-gray-500 mt-0.5">{returns.length} 筆</p>
            </div>
            <div className="rounded-lg bg-gray-800 p-3">
              <p className="text-gray-400 mb-0.5">手續費折讓</p>
              <p className={`text-lg font-semibold ${totalRebate >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totalRebate >= 0 ? '+' : ''}{fmt(totalRebate)}
              </p>
              <p className="text-gray-500 mt-0.5">{rebates.length} 筆</p>
            </div>
          </div>

          {/* When focused on lending_return, show breakdown */}
          {typeFilter === 'lending_return' && returns.length > 0 && (
            <div className="rounded-lg bg-emerald-900/20 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-400">毛利息</span>
                <span className="font-medium text-white">+{fmt(totalReturnGross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">借貸手續費</span>
                <span className="font-medium text-orange-300">−{fmt(totalReturnFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">代扣稅款</span>
                <span className="font-medium text-orange-300">−{fmt(totalReturnTax)}</span>
              </div>
              <div className="flex justify-between border-t border-emerald-900/40 pt-1.5">
                <span className="text-emerald-300 font-semibold">淨收入</span>
                <span className="font-bold text-emerald-300">+{fmt(totalReturnNet)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Type chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { v: 'all', label: '全部', count: dateScoped.length },
            { v: 'sale', label: '賣出', count: sales.length },
            { v: 'day_trade', label: '當沖', count: dayTrades.length },
            { v: 'dividend', label: '股息', count: dividends.length },
            { v: 'lending_return', label: '還券', count: returns.length },
            { v: 'fee_rebate', label: '折讓', count: rebates.length },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setTypeFilter(opt.v as TypeFilter)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === opt.v
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {opt.label} <span className="opacity-70">({opt.count})</span>
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
          />
          <span className="text-gray-500 text-xs">~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="shrink-0 rounded-lg bg-gray-800 px-2 py-2 text-xs text-gray-400 hover:bg-gray-700"
            >
              清除
            </button>
          )}
        </div>

        {/* Filtered total when narrowed */}
        {(typeFilter !== 'all' || startDate || endDate) && (
          <div className="text-right text-xs text-gray-400">
            篩選小計（{visible.length} 筆）：
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
          visible.map((r) => {
            if (r.type === 'fee_rebate') {
              const net = r.netInterest ?? 0;
              return (
                <div key={r.id} className="rounded-xl bg-gray-900 p-4 space-y-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        <span className="mr-1.5 inline-block rounded bg-yellow-900/40 px-1.5 py-0.5 align-middle text-[10px] font-medium text-yellow-300">
                          折讓
                        </span>
                        {r.stockName}
                      </p>
                      <p className="text-xs text-gray-500">{r.sellDate}</p>
                    </div>
                    <p className="font-bold text-red-400">+{fmt(net)}</p>
                  </div>
                  {r.notes && <p className="text-xs text-gray-500">{r.notes}</p>}
                </div>
              );
            }
            if (r.type === 'dividend') {
              const net = r.netInterest ?? 0;
              return (
                <div key={r.id} className="rounded-xl bg-gray-900 p-4 space-y-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        <span className="mr-1.5 inline-block rounded bg-purple-900/40 px-1.5 py-0.5 align-middle text-[10px] font-medium text-purple-300">
                          股息
                        </span>
                        {r.stockName} <span className="text-xs text-gray-500">{r.stockId}</span>
                      </p>
                      <p className="text-xs text-gray-500">{r.sellDate}</p>
                    </div>
                    <p className="font-bold text-red-400">+{fmt(net)}</p>
                  </div>
                  {r.notes && <p className="text-xs text-gray-500">{r.notes}</p>}
                </div>
              );
            }
            if (r.type === 'lending_return') {
              const gross = r.grossInterest ?? 0;
              const fee = r.brokerFeeAmount ?? 0;
              const tax = r.withholdingTax ?? 0;
              const net = r.netInterest ?? 0;
              return (
                <div key={r.id} className="rounded-xl bg-gray-900 p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white">
                        <span className="mr-1.5 inline-block rounded bg-emerald-900/40 px-1.5 py-0.5 align-middle text-[10px] font-medium text-emerald-300">
                          還券
                        </span>
                        {r.stockName} <span className="text-xs text-gray-500">{r.stockId}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.startDate} ~ {r.sellDate} · {fmt(r.shares)} 股 · {r.annualRate ?? 0}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${net >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {net >= 0 ? '+' : ''}{fmt(net)}
                      </p>
                      <p className="text-xs text-gray-500">淨收入</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>毛利 {fmt(gross)}</span>
                    {fee > 0 && <span>手續費 −{fmt(fee)}</span>}
                    {tax > 0 && <span>稅 −{fmt(tax)}</span>}
                  </div>
                  {r.notes && <p className="text-xs text-gray-500">{r.notes}</p>}
                </div>
              );
            }
            const pnl = calcSalePnl(r);
            const effectiveBuy = r.buyPrice - r.dividendDeducted;
            const pct = effectiveBuy > 0 ? ((r.sellPrice - effectiveBuy) / effectiveBuy) * 100 : 0;
            const isDayTrade = r.type === 'day_trade';
            return (
              <div key={r.id} className="rounded-xl bg-gray-900 p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">
                      <span className={`mr-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-medium ${
                        isDayTrade ? 'bg-orange-900/40 text-orange-300' : 'bg-blue-900/40 text-blue-300'
                      }`}>
                        {isDayTrade ? '當沖' : '賣出'}
                      </span>
                      {r.stockName} <span className="text-xs text-gray-500">{r.stockId}</span>
                    </p>
                    <p className="text-xs text-gray-500">{r.sellDate} · {r.shares}張</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${pnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {pnl >= 0 ? '+' : ''}{fmt(pnl)}
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
          })
        )}
      </div>
    </div>
  );
}
