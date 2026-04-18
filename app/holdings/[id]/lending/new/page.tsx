'use client';
import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useHoldings, useLendings } from '@/lib/hooks';

export default function NewLendingPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { holdings } = useHoldings();
  const { mutate } = useLendings();
  const holding = holdings.find((h) => h.id === id);

  const [sharesLent, setSharesLent] = useState(1);
  const [annualRate, setAnnualRate] = useState(1.0);
  const [brokerFee, setBrokerFee] = useState(0.1);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!holding) return;
    if (sharesLent <= 0 || annualRate <= 0) return alert('請填寫借出張數和年利率');
    setSaving(true);
    try {
      await fetch('/api/notion/lending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: holding.stockId,
          stockName: holding.stockName,
          sharesLent,
          annualRate,
          brokerFee,
          startDate,
          accruedInterest: 0,
          isActive: true,
        }),
      });
      mutate();
      router.push('/holdings');
    } catch { alert('新增失敗'); } finally { setSaving(false); }
  }

  const netRate = annualRate - brokerFee;

  return (
    <div>
      <Header title={`設定借券 · ${holding?.stockName ?? ''}`} />
      <div className="space-y-4 p-4">
        <div className="rounded-xl bg-gray-900 p-4 space-y-3">
          {holding && (
            <p className="text-sm text-gray-400">{holding.stockName} ({holding.stockId}) · 持有 {holding.shares} 張</p>
          )}

          <div>
            <label className="text-xs text-gray-400">借出張數 *</label>
            <input type="number" value={sharesLent} min={1} max={holding?.shares ?? 999}
              onChange={(e) => setSharesLent(parseInt(e.target.value) || 1)}
              className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">年利率 (%) *</label>
              <input type="number" value={annualRate} step="0.1" min={0.1}
                onChange={(e) => setAnnualRate(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400">券商手續費 (%)</label>
              <input type="number" value={brokerFee} step="0.01" min={0}
                onChange={(e) => setBrokerFee(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">借出日期</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          {annualRate > 0 && sharesLent > 0 && (
            <div className="rounded-lg bg-gray-800 p-3 text-xs space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>年利率</span><span>{annualRate}%</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>券商手續費</span><span>-{brokerFee}%</span>
              </div>
              <div className="flex justify-between font-medium text-white border-t border-gray-700 pt-1">
                <span>實際年報酬</span><span className="text-red-400">{netRate.toFixed(2)}%</span>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={saving || !holding}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? '設定中...' : '確認借券'}
        </button>
      </div>
    </div>
  );
}
