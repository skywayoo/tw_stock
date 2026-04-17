'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useHoldings } from '@/lib/hooks';
import { Search } from 'lucide-react';

export default function NewHoldingPage() {
  const router = useRouter();
  const { mutate } = useHoldings();
  const [stockId, setStockId] = useState('');
  const [stockName, setStockName] = useState('');
  const [shares, setShares] = useState(1);
  const [avgCost, setAvgCost] = useState(0);
  const [buyDate, setBuyDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<{ id: string; name: string }[]>([]);

  async function handleSearch() {
    if (!stockId.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/stock/search?q=${encodeURIComponent(stockId)}`);
      const data = await res.json();
      setSuggestions(data);
    } catch { /* ignore */ } finally { setSearching(false); }
  }

  async function handleSave() {
    if (!stockId || !stockName || !avgCost) return alert('請填寫股票代號、名稱和成本');
    setSaving(true);
    try {
      await fetch('/api/notion/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId, stockName, shares, avgCost, buyDate, notes }),
      });
      mutate();
      router.push('/');
    } catch { alert('新增失敗'); } finally { setSaving(false); }
  }

  return (
    <div>
      <Header title="新增持股" />
      <div className="space-y-4 p-4">
        <div className="rounded-xl bg-gray-900 p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-400">股票代號 *</label>
            <div className="mt-1 flex gap-2">
              <input
                value={stockId}
                onChange={(e) => setStockId(e.target.value)}
                placeholder="例：2330"
                className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button onClick={handleSearch} disabled={searching} className="rounded-lg bg-gray-700 px-3 py-2 text-gray-300 hover:bg-gray-600">
                <Search className="h-4 w-4" />
              </button>
            </div>
            {suggestions.length > 0 && (
              <div className="mt-1 rounded-lg bg-gray-800 divide-y divide-gray-700">
                {suggestions.map((s) => (
                  <button key={s.id} onClick={() => { setStockId(s.id); setStockName(s.name); setSuggestions([]); }}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700">
                    {s.id} {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400">股票名稱 *</label>
            <input value={stockName} onChange={(e) => setStockName(e.target.value)} placeholder="例：台積電"
              className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">張數 *</label>
              <input type="number" value={shares} min={1} onChange={(e) => setShares(parseInt(e.target.value) || 1)}
                className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400">平均成本(元/股) *</label>
              <input type="number" value={avgCost || ''} step="0.01" onChange={(e) => setAvgCost(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">買入日期</label>
            <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)}
              className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label className="text-xs text-gray-400">備註</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="選填"
              className="mt-1 w-full rounded-lg bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? '新增中...' : '新增持股'}
        </button>
      </div>
    </div>
  );
}
