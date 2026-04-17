import { NextResponse } from 'next/server';
import { getHoldings, getLendings, createDailyReport, getDailyReports } from '@/lib/notion';
import { getMultipleStockPrices } from '@/lib/twse';
import { callGemini } from '@/lib/gemini';
import { sendTelegram } from '@/lib/telegram';
import { HoldingSnapshot } from '@/types';

export const dynamic = 'force-dynamic';

// Fetch previous close from Yahoo Finance
async function getPrevClose(stockId: string): Promise<number> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${stockId}.TW?interval=1d&range=2d`,
      { cache: 'no-store' }
    );
    const data = await res.json() as { chart?: { result?: { indicators?: { quote?: { close?: number[] }[] } }[] } };
    const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return closes[closes.length - 2] ?? 0;
  } catch {
    return 0;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('x-cron-secret');
  if (authHeader !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const holdings = await getHoldings();
  if (holdings.length === 0) return NextResponse.json({ message: 'No holdings' });

  const today = new Date().toISOString().split('T')[0];
  const stockIds = holdings.map((h) => h.stockId);
  const prices = await getMultipleStockPrices(stockIds);

  const snapshots: HoldingSnapshot[] = [];
  let totalValue = 0;
  let totalCost = 0;

  for (const h of holdings) {
    const p = prices[h.stockId];
    if (!p) continue;
    const prevClose = await getPrevClose(h.stockId);
    const sharesCount = h.shares * 1000;
    const value = p.price * sharesCount;
    const cost = h.avgCost * sharesCount;
    const change = p.price - prevClose;

    snapshots.push({
      stockId: h.stockId, stockName: h.stockName, shares: h.shares,
      closePrice: p.price, prevClosePrice: prevClose, value,
      change: Math.round(change * 100) / 100,
      changePct: prevClose > 0 ? Math.round((change / prevClose) * 10000) / 100 : 0,
    });
    totalValue += value;
    totalCost += cost;
  }

  // Get yesterday's report for comparison
  const prevReports = await getDailyReports(1);
  const prevValue = prevReports[0]?.totalValue ?? totalValue;
  const dayChange = totalValue - prevValue;
  const dayChangePct = prevValue > 0 ? Math.round((dayChange / prevValue) * 10000) / 100 : 0;

  // Generate AI summary
  const snapshotText = snapshots.map(
    (s) => `${s.stockName}(${s.stockId})：${s.closePrice}元 ${s.changePct >= 0 ? '▲' : '▼'}${Math.abs(s.changePct)}%`
  ).join('\n');

  const lendings = await getLendings();
  const activeLendings = lendings.filter((l) => l.isActive);
  const lendingText = activeLendings.length > 0
    ? activeLendings.map((l) => `${l.stockName} 借券中，年利率 ${l.annualRate}%`).join('\n')
    : '無借券';

  const prompt = `台股今日收盤報告（${today}）

持股表現：
${snapshotText}

借券：${lendingText}

總市值：${Math.round(totalValue).toLocaleString()} 元
總成本：${Math.round(totalCost).toLocaleString()} 元
未實現損益：${Math.round(totalValue - totalCost).toLocaleString()} 元（${Math.round((totalValue - totalCost) / totalCost * 100)}%）
今日損益：${dayChange >= 0 ? '+' : ''}${Math.round(dayChange).toLocaleString()} 元（${dayChange >= 0 ? '+' : ''}${dayChangePct}%）

請用3–4句話簡短總結今日表現，並給出明日注意事項。繁體中文，簡潔有力。`;

  let content = '';
  try {
    content = await callGemini(apiKey, prompt);
  } catch {
    content = `今日總市值 ${Math.round(totalValue).toLocaleString()} 元，${dayChange >= 0 ? '上漲' : '下跌'} ${Math.abs(Math.round(dayChange)).toLocaleString()} 元。`;
  }

  await createDailyReport({ date: today, totalValue, totalCost, dayChange, dayChangePct, content, holdingSnapshots: snapshots });

  // Telegram report
  const changeEmoji = dayChange >= 0 ? '📈' : '📉';
  const lines = snapshots.map(
    (s) => `${s.changePct >= 0 ? '▲' : '▼'} <b>${s.stockName}</b> ${s.closePrice}元 (${s.changePct >= 0 ? '+' : ''}${s.changePct}%)`
  ).join('\n');
  const msg = `${changeEmoji} <b>每日收盤報告 ${today}</b>\n\n${lines}\n\n` +
    `總市值：${Math.round(totalValue / 10000)}萬\n` +
    `今日：${dayChange >= 0 ? '+' : ''}${Math.round(dayChange / 10000)}萬 (${dayChangePct >= 0 ? '+' : ''}${dayChangePct}%)\n\n` +
    `📝 ${content}`;

  await sendTelegram(msg);

  return NextResponse.json({ date: today, totalValue, dayChange, snapshots: snapshots.length });
}
