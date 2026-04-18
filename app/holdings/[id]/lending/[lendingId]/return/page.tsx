'use client';
import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useLendings } from '@/lib/hooks';

function fmt(n: number) { return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }

export default function ReturnLendingPage() {
  const router = useRouter();
  const { lendingId } = useParams<{ id: string; lendingId: string }>();
  const { lendings, mutate } = useLendings();
  const lending = lendings.find((l) => l.id === lendingId);

  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [grossInterest, setGrossInterest] = useState('');
  const [brokerFeeAmount, setBrokerFeeAmount] = useState('');
  const [withholdingTax, setWithholdingTax] = useState('');
  const [saving, setSaving] = useState(false);

  const gross = parseFloat(grossInterest) || 0;
  const fee = parseFloat(brokerFeeAmount) || 0;
  const tax = parseFloat(withholdingTax) || 0;
  const net = gross - fee - tax;

  async function handleReturn() {
    if (!lending) return;
    if (gross <= 0) return alert('請輸入總收益');
    setSaving(true);
    try {
      await fetch('/api/notion/lending', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lendingId,
          action: 'return',
          endDate: returnDate,
          totalInterest: net,
          grossInterest: gross,
          brokerFeeAmount: fee,
          withholdingTax: tax,
          netInterest: net,
        }),
      });
      mutate();
      router.push('/holdings');
    } catch { alert('操作失敗'); } finally { setSaving(false); }
  }

  return (
    <div>
      <Header title={`還券結算 · ${lending?.stockName ?? ''}`} />
      <div className="space-y-4 p-4">
        {lending && (
          <div className="rounded-xl bg-gray-900 p-4 text-sm text-gray-400 space-y-1">
            <p>{lending.stockName} · {lending.sharesLent}張</p>
            <p>借出日：{lending.startDate} · 年利率 {lending.annualRate}% · 手續費 {lending.brokerFee}%</p>
          </div>
        )}

        <div className="rounded-xl bg-gray-900 p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-400">還券日期</label>
            <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)}
              className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label className="text-xs text-gray-400">借券總收益（元）</label>
            <input type="number" value={grossInterest} step="1" placeholder="0"
              onChange={(e) => setGrossInterest(e.target.value)}
              className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">券商手續費（元）</label>
              <input type="number" value={brokerFeeAmount} step="1" placeholder="0"
                onChange={(e) => setBrokerFeeAmount(e.target.value)}
                className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400">預扣所得稅（元）</label>
              <input type="number" value={withholdingTax} step="1" placeholder="0"
                onChange={(e) => setWithholdingTax(e.target.value)}
                className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          {gross > 0 && (
            <div className="rounded-lg bg-gray-800 p-3 text-xs space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>借券總收益</span><span>{fmt(gross)} 元</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>券商手續費</span><span>-{fmt(fee)} 元</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>預扣所得稅</span><span>-{fmt(tax)} 元</span>
              </div>
              <div className="flex justify-between font-semibold text-white border-t border-gray-700 pt-1">
                <span>實際淨收益</span>
                <span className={net >= 0 ? 'text-red-400' : 'text-green-400'}>{fmt(net)} 元</span>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleReturn} disabled={saving || !lending}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? '結算中...' : '確認還券'}
        </button>
      </div>
    </div>
  );
}
