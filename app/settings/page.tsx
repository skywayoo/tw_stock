'use client';
import { useState } from 'react';
import Header from '@/components/layout/Header';
import { useHoldings } from '@/lib/hooks';

export default function SettingsPage() {
  const { holdings } = useHoldings();
  const [testing, setTesting] = useState<string | null>(null);

  async function triggerCron(task: string) {
    setTesting(task);
    try {
      const res = await fetch(`/api/cron/${task}`, {
        headers: { 'x-cron-secret': process.env.NEXT_PUBLIC_CRON_SECRET ?? '' },
      });
      const data = await res.json();
      alert(`完成：${JSON.stringify(data)}`);
    } catch (e) { alert(`失敗：${e}`); } finally { setTesting(null); }
  }

  return (
    <div>
      <Header title="設定" />
      <div className="min-h-[calc(100dvh-4rem)] space-y-4 p-4">
        <div className="rounded-xl bg-gray-900 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">手動觸發</p>
          {[
            { key: 'news', label: '新聞監控' },
            { key: 'public-info', label: '公開資訊' },
            { key: 'daily-report', label: '每日報告' },
            { key: 'night-analysis', label: '夜間分析' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => triggerCron(key)} disabled={!!testing}
              className="w-full rounded-lg bg-gray-800 px-4 py-2.5 text-left text-sm text-white hover:bg-gray-700 disabled:opacity-50 flex justify-between items-center">
              <span>{label}</span>
              {testing === key && <span className="text-xs text-gray-400">執行中...</span>}
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-gray-900 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">持股概覽</p>
          <p className="text-sm text-gray-300">{holdings.length} 檔持股</p>
          {holdings.map((h) => (
            <p key={h.id} className="text-xs text-gray-500">{h.stockId} {h.stockName} · {h.shares}張</p>
          ))}
        </div>
      </div>
    </div>
  );
}
