'use client';
import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useHoldings, useExDividends } from '@/lib/hooks';

export default function NewExDividendPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { holdings } = useHoldings();
  const { mutate } = useExDividends();
  const holding = holdings.find((h) => h.id === id);

  const [exDate, setExDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashDividend, setCashDividend] = useState('');
  const [stockDividend, setStockDividend] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!holding) return;
    const cash = parseFloat(cashDividend) || 0;
    const stock = parseFloat(stockDividend) || 0;
    if (!exDate) return alert('請填寫除息日');
    if (cash === 0 && stock === 0) return alert('請填寫現金或股票股利');
    setSaving(true);
    try {
      await fetch('/api/notion/ex-dividend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: holding.stockId,
          stockName: holding.stockName,
          exDate,
          cashDividend: cash,
          stockDividend: stock,
          deductFromCost: false,
          source: '手動',
        }),
      });
      mutate();
      router.push('/holdings');
    } catch { alert('新增失敗'); } finally { setSaving(false); }
  }

  return (
    <div>
      <Header title={`新增除息 · ${holding?.stockName ?? ''}`} />
      <div className="space-y-4 p-4">
        <div className="rounded-xl bg-gray-900 p-4 space-y-3">
          {holding && (
            <p className="text-sm text-gray-400">{holding.stockName} ({holding.stockId})</p>
          )}

          <div>
            <label className="text-xs text-gray-400">除息日 *</label>
            <input type="date" value={exDate} onChange={(e) => setExDate(e.target.value)}
              className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">現金股利 (元/股)</label>
              <input type="number" value={cashDividend} step="0.01" placeholder="0"
                onChange={(e) => setCashDividend(e.target.value)}
                className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400">股票股利 (元/股)</label>
              <input type="number" value={stockDividend} step="0.01" placeholder="0"
                onChange={(e) => setStockDividend(e.target.value)}
                className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving || !holding}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? '新增中...' : '新增除息記錄'}
        </button>
      </div>
    </div>
  );
}
