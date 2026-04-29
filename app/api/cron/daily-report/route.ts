import { NextResponse } from 'next/server';
import { getHoldings, getLendings, createDailyReport } from '@/lib/notion';
import { getMultipleStockPrices } from '@/lib/twse';
import { callGemini } from '@/lib/gemini';
import { sendTelegram } from '@/lib/telegram';
import { HoldingSnapshot } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
    // Use TWSE realtime change (price - yesterday close) directly. Yahoo's range=2d
    // intermittently returns only today's bar, which made prevClose == today's close
    // and dayChange collapse to 0.
    const change = p.change;
    const prevClose = p.price - change;
    const sharesCount = h.shares * 1000;
    const value = p.price * sharesCount;
    const cost = h.avgCost * sharesCount;

    snapshots.push({
      stockId: h.stockId, stockName: h.stockName, shares: h.shares,
      closePrice: p.price, prevClosePrice: prevClose, value,
      change: Math.round(change * 100) / 100,
      changePct: p.changePct,
    });
    totalValue += value;
    totalCost += cost;
  }

  // Day change = Σ per-stock (close - prev close) × shares — never compare against the
  // previous DailyReport row, because a same-day rerun would treat itself as "yesterday".
  const dayChange = snapshots.reduce((s, sn) => s + sn.change * sn.shares * 1000, 0);
  const prevTotalValue = snapshots.reduce((s, sn) => s + sn.prevClosePrice * sn.shares * 1000, 0);
  const dayChangePct = prevTotalValue > 0 ? Math.round((dayChange / prevTotalValue) * 10000) / 100 : 0;

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

請用 3–5 句話總結今日表現，分析主要漲跌持股，並給出明日注意事項。
全程使用繁體中文，不要附英文版。
不要使用 markdown 粗體（**、*）或標題符號（#）。`;

  let content = '';
  try {
    content = await callGemini(apiKey, prompt);
  } catch {
    content = `今日總市值 ${Math.round(totalValue).toLocaleString()} 元，${dayChange >= 0 ? '上漲' : '下跌'} ${Math.abs(Math.round(dayChange)).toLocaleString()} 元。`;
  }
  // Light strip of bold/italic markers + heading markers (keep dashes/lists as-is so prose isn't gutted)
  content = content.replace(/\*+/g, '').replace(/^#+\s*/gm, '').replace(/`+/g, '').trim();

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
