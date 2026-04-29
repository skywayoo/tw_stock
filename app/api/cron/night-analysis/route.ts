import { NextResponse } from 'next/server';
import { getHoldings, getNews } from '@/lib/notion';
import { callGemini } from '@/lib/gemini';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

// Fetch 30-day price history from Yahoo Finance
async function getPriceHistory(stockId: string): Promise<{ date: string; close: number }[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${stockId}.TW?interval=1d&range=30d`,
      { cache: 'no-store' }
    );
    const data = await res.json() as {
      chart?: {
        result?: {
          timestamp?: number[];
          indicators?: { quote?: { close?: number[] }[] };
        }[];
      };
    };
    const result = data.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    return timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: Math.round((closes[i] ?? 0) * 100) / 100,
    })).filter((d) => d.close > 0);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const holdings = await getHoldings();
  if (holdings.length === 0) return NextResponse.json({ message: 'No holdings' });

  const analyses: string[] = [];

  for (const holding of holdings) {
    const history = await getPriceHistory(holding.stockId);
    if (history.length < 5) continue;

    const recentNews = await getNews(holding.stockId, 5);
    const newsText = recentNews.length > 0
      ? recentNews.map((n) => `- [${n.sentiment === 'bullish' ? '利多' : n.sentiment === 'bearish' ? '利空' : '中性'}] ${n.summary}`).join('\n')
      : '近期無重要新聞';

    const priceText = history.slice(-10).map((d) => `${d.date}: ${d.close}`).join('\n');
    const latest = history[history.length - 1].close;
    const oldest = history[0].close;
    const monthChange = Math.round((latest - oldest) / oldest * 10000) / 100;

    const prompt = `你是台灣股票分析師，請分析 ${holding.stockName}(${holding.stockId}) 的近期走勢：

近10日收盤價：
${priceText}

月漲跌：${monthChange >= 0 ? '+' : ''}${monthChange}%
我的持有張數：${holding.shares}張，平均成本：${holding.avgCost}元

近期新聞：
${newsText}

請給出：
1. 短期走勢判斷（3–5個交易日）：看漲/看跌/震盪
2. 主要理由（1–2句）
3. 操作建議（1句）：續持/減碼/加碼/觀望

格式：
走勢：[看漲/看跌/震盪]
理由：[1-2句]
建議：[1句]`;

    try {
      const reply = await callGemini(apiKey, prompt);
      const trendMatch = reply.match(/走勢：(.+)/);
      const reasonMatch = reply.match(/理由：(.+)/);
      const suggestionMatch = reply.match(/建議：(.+)/);

      const trend = trendMatch?.[1]?.trim() ?? '';
      const reason = reasonMatch?.[1]?.trim() ?? '';
      const suggestion = suggestionMatch?.[1]?.trim() ?? '';

      // Gemma 4 sometimes spends the whole token budget on internal thinking and emits no
      // answer text. Skip pushing an empty card rather than sending a stock name with blanks.
      if (!trend && !reason && !suggestion) continue;

      const emoji = trend.includes('看漲') ? '🟢' : trend.includes('看跌') ? '🔴' : '🟡';
      analyses.push(
        `${emoji} <b>${holding.stockName}(${holding.stockId})</b> — ${trend || '—'}\n` +
        `${reason}${suggestion ? `\n<i>建議：${suggestion}</i>` : ''}`
      );
    } catch { /* skip */ }

    await new Promise((r) => setTimeout(r, 600));
  }

  if (analyses.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    await sendTelegram(`🌙 <b>夜間走勢分析 ${today}</b>\n\n${analyses.join('\n\n')}`);
  }

  return NextResponse.json({ analyzed: analyses.length });
}
