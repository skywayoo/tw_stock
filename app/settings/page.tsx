'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import { useHoldings } from '@/lib/hooks';

const SECRET_KEY = 'tw_stock_cron_secret';

export default function SettingsPage() {
  const { holdings } = useHoldings();
  const [testing, setTesting] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    setSecret(localStorage.getItem(SECRET_KEY) ?? '');
  }, []);

  function saveSecret(v: string) {
    setSecret(v);
    localStorage.setItem(SECRET_KEY, v);
  }

  async function triggerCron(task: string) {
    if (!secret) {
      alert('請先在下方填入 CRON_SECRET');
      return;
    }
    setTesting(task);
    setLastResult(null);
    try {
      const res = await fetch('/api/admin/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, secret }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setLastResult('❌ 401 Unauthorized — secret 錯了');
      } else if (!res.ok) {
        setLastResult(`❌ HTTP ${res.status} ${JSON.stringify(data)}`);
      } else {
        setLastResult(`✅ ${task}: ${JSON.stringify(data.data ?? data)}`);
      }
    } catch (e) {
      setLastResult(`❌ 網路錯誤：${e}`);
    } finally {
      setTesting(null);
    }
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
            <button
              key={key}
              onClick={() => triggerCron(key)}
              disabled={!!testing}
              className="w-full rounded-lg bg-gray-800 px-4 py-2.5 text-left text-sm text-white hover:bg-gray-700 disabled:opacity-50 flex justify-between items-center"
            >
              <span>{label}</span>
              {testing === key && <span className="text-xs text-gray-400">執行中...</span>}
            </button>
          ))}
          {lastResult && (
            <p className="mt-2 break-all text-xs text-gray-400 whitespace-pre-wrap">{lastResult}</p>
          )}
        </div>

        <div className="rounded-xl bg-gray-900 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">CRON Secret</p>
          <p className="text-xs text-gray-500">貼入後存在這台手機 localStorage，不會傳到第三方。</p>
          <input
            type="password"
            value={secret}
            onChange={(e) => saveSecret(e.target.value)}
            placeholder="貼上 CRON_SECRET"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          />
          <p className="text-xs text-gray-600">{secret ? `已設定（${secret.length} 字元）` : '尚未設定'}</p>
        </div>

        <div className="rounded-xl bg-gray-900 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">其他</p>
          <Link
            href="/reports"
            className="block w-full rounded-lg bg-gray-800 px-4 py-2.5 text-left text-sm text-white hover:bg-gray-700"
          >
            每日報告
          </Link>
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
