'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useHoldings, useExDividends, useLendings } from '@/lib/hooks';

export default function NewRealizedPage() {
  const router = useRouter();
  const { holdings } = useHoldings();
  const { exDividends } = useExDividends();
  const { lendings } = useLendings();

  const [form, setForm] = useState({
    stockId: '', stockName: '', shares: '', buyPrice: '', sellPrice: '',
    sellDate: new Date().toISOString().split('T')[0], notes: '',
  });
  const [saving, setSaving] = useState(false);

  function onHoldingSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const h = holdings.find((h) => h.id === e.target.value);
    if (!h) return;
    const exDivs = exDividends.filter((d) => d.stockId === h.stockId && d.deductFromCost);
    const deducted = exDivs.reduce((sum, d) => sum + d.cashDividend, 0);
    const activeLend = lendings.filter((l) => l.stockId === h.stockId);
    const totalInterest = activeLend.reduce((sum, l) => sum + l.accruedInterest, 0);
    setForm((f) => ({
      ...f, stockId: h.stockId, stockName: h.stockName,
      shares: String(h.shares), buyPrice: String((h.avgCost - deducted).toFixed(2)),
    }));
    void totalInterest; // will be auto-calculated below
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const exDivs = exDividends.filter((d) => d.stockId === form.stockId && d.deductFromCost);
    const dividendDeducted = exDivs.reduce((sum, d) => sum + d.cashDividend, 0);
    const activeLend = lendings.filter((l) => l.stockId === form.stockId);
    const lendingInterest = activeLend.reduce((sum, l) => sum + l.accruedInterest, 0);

    await fetch('/api/notion/realized', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stockId: form.stockId, stockName: form.stockName,
        shares: Number(form.shares), buyPrice: Number(form.buyPrice),
        sellPrice: Number(form.sellPrice), sellDate: form.sellDate,
        dividendDeducted, lendingInterest,
        notes: form.notes || undefined,
      }),
    });
    router.push('/realized');
  }

  const inputCls = 'w-full rounded-lg bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div>
      <Header title="新增已實現損益" />
      <form onSubmit={onSubmit} className="min-h-[calc(100dvh-4rem)] space-y-3 p-4">
        <div className="rounded-xl bg-gray-900 p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-400">從庫存選取（可選）</label>
            <select onChange={onHoldingSelect} defaultValue="" className={`mt-1 ${inputCls}`}>
              <option value="">-- 手動輸入 --</option>
              {holdings.map((h) => (
                <option key={h.id} value={h.id}>{h.stockId} {h.stockName}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">股票代碼</label>
              <input value={form.stockId} onChange={(e) => setForm({ ...form, stockId: e.target.value })}
                required placeholder="2330" className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className="text-xs text-gray-400">股票名稱</label>
              <input value={form.stockName} onChange={(e) => setForm({ ...form, stockName: e.target.value })}
                required placeholder="台積電" className={`mt-1 ${inputCls}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">張數</label>
              <input type="number" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })}
                required min="0.001" step="0.001" placeholder="1" className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className="text-xs text-gray-400">賣出日期</label>
              <input type="date" value={form.sellDate} onChange={(e) => setForm({ ...form, sellDate: e.target.value })}
                required className={`mt-1 ${inputCls}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">買入均價（元/股）</label>
              <input type="number" value={form.buyPrice} onChange={(e) => setForm({ ...form, buyPrice: e.target.value })}
                required min="0" step="0.01" placeholder="100" className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className="text-xs text-gray-400">賣出均價（元/股）</label>
              <input type="number" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
                required min="0" step="0.01" placeholder="120" className={`mt-1 ${inputCls}`} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400">備註（選填）</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="..." className={`mt-1 ${inputCls}`} />
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? '儲存中...' : '儲存'}
        </button>
      </form>
    </div>
  );
}
