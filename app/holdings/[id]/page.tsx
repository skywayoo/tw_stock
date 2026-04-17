'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useHoldings } from '@/lib/hooks';

export default function HoldingDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { holdings, mutate } = useHoldings();
  const holding = holdings.find((h) => h.id === id);

  const [form, setForm] = useState({ stockName: '', shares: '', avgCost: '', buyDate: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (holding) {
      setForm({
        stockName: holding.stockName,
        shares: String(holding.shares),
        avgCost: String(holding.avgCost),
        buyDate: holding.buyDate,
        notes: holding.notes ?? '',
      });
    }
  }, [holding]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/notion/holdings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id, stockName: form.stockName,
        shares: Number(form.shares),
        avgCost: Number(form.avgCost),
        buyDate: form.buyDate,
        notes: form.notes || undefined,
      }),
    });
    await mutate();
    router.push('/holdings');
  }

  async function onDelete() {
    if (!confirm(`確認刪除 ${holding?.stockName}？`)) return;
    setDeleting(true);
    await fetch('/api/notion/holdings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await mutate();
    router.push('/holdings');
  }

  if (!holding) return (
    <div>
      <Header title="編輯持股" />
      <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>
    </div>
  );

  const inputCls = 'w-full rounded-lg bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div>
      <Header title={`編輯 ${holding.stockName}`} />
      <form onSubmit={onSave} className="min-h-[calc(100dvh-4rem)] space-y-3 p-4">
        <div className="rounded-xl bg-gray-900 p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-400">股票代碼</label>
            <p className="mt-1 rounded-lg bg-gray-800 px-3 py-2.5 text-sm text-gray-400">{holding.stockId}</p>
          </div>
          <div>
            <label className="text-xs text-gray-400">股票名稱</label>
            <input value={form.stockName} onChange={(e) => setForm({ ...form, stockName: e.target.value })}
              required className={`mt-1 ${inputCls}`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">張數</label>
              <input type="number" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })}
                required min="0.001" step="0.001" className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className="text-xs text-gray-400">買入均價（元/股）</label>
              <input type="number" value={form.avgCost} onChange={(e) => setForm({ ...form, avgCost: e.target.value })}
                required min="0" step="0.01" className={`mt-1 ${inputCls}`} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400">買入日期</label>
            <input type="date" value={form.buyDate} onChange={(e) => setForm({ ...form, buyDate: e.target.value })}
              required className={`mt-1 ${inputCls}`} />
          </div>
          <div>
            <label className="text-xs text-gray-400">備註（選填）</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="..." className={`mt-1 ${inputCls}`} />
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? '儲存中...' : '儲存修改'}
        </button>

        <button type="button" onClick={onDelete} disabled={deleting}
          className="w-full rounded-xl bg-red-900 py-3 text-sm font-semibold text-red-300 disabled:opacity-50">
          {deleting ? '刪除中...' : '刪除此持股'}
        </button>
      </form>
    </div>
  );
}
