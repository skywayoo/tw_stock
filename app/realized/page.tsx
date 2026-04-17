'use client';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import { useRealizedPnls } from '@/lib/hooks';
import { Plus } from 'lucide-react';
import { RealizedPnl } from '@/types';

function fmt(n: number) { return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }

function calcPnl(r: RealizedPnl): number {
  const effectiveBuy = r.buyPrice - r.dividendDeducted;
  const gross = (r.sellPrice - effectiveBuy) * r.shares * 1000;
  return gross + r.lendingInterest;
}

export default function RealizedPage() {
  const { realizedPnls, isLoading } = useRealizedPnls();

  const totalPnl = realizedPnls.reduce((sum, r) => sum + calcPnl(r), 0);

  return (
    <div>
      <Header title="已實現損益" right={
        <Link href="/realized/new" className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">
          <Plus className="h-3 w-3" /> 新增
        </Link>
      } />
      <div className="min-h-[calc(100dvh-4rem)] space-y-3 p-4">
        {/* Summary */}
        <div className="rounded-xl bg-gray-900 p-4">
          <p className="text-xs text-gray-400 mb-1">累計已實現損益</p>
          <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)} 元
          </p>
          <p className="text-xs text-gray-500 mt-1">{realizedPnls.length} 筆交易</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
        ) : realizedPnls.length === 0 ? (
          <div className="rounded-xl bg-gray-900 p-8 text-center text-gray-500">尚無已實現損益記錄</div>
        ) : (
          realizedPnls.map((r) => {
            const pnl = calcPnl(r);
            const effectiveBuy = r.buyPrice - r.dividendDeducted;
            const pct = effectiveBuy > 0 ? ((r.sellPrice - effectiveBuy) / effectiveBuy) * 100 : 0;
            return (
              <div key={r.id} className="rounded-xl bg-gray-900 p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">{r.stockName} <span className="text-xs text-gray-500">{r.stockId}</span></p>
                    <p className="text-xs text-gray-500">{r.sellDate} · {r.shares}張</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                    </p>
                    <p className={`text-xs ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
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
