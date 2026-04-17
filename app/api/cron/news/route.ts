import { NextResponse } from 'next/server';
import { getHoldings, createNews } from '@/lib/notion';
import { callGemini } from '@/lib/gemini';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

async function fetchGoogleNewsRss(stockId: string, stockName: string): Promise<{ title: string; url: string }[]> {
  const query = encodeURIComponent(`${stockName} ${stockId}`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
  });
  if (!res.ok) return [];
  const text = await res.text();
  const items: { title: string; url: string }[] = [];
  const matches = text.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/g);
  for (const m of matches) {
    const title = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
    const link = m[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
    if (title && link) items.push({ title, url: link });
    if (items.length >= 5) break;
  }
  return items;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('x-cron-secret');
  if (authHeader?.trim() !== process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const holdings = await getHoldings();
  if (holdings.length === 0) return NextResponse.json({ message: 'No holdings' });

  const importantNews: string[] = [];
  let processed = 0;
  const debug: string[] = [];

  for (const holding of holdings) {
    const articles = await fetchGoogleNewsRss(holding.stockId, holding.stockName);
    debug.push(`${holding.stockId}: ${articles.length} articles`);
    if (articles.length === 0) continue;

    const headlines = articles.map((a) => `- ${a.title}`).join('\n');
    const prompt = `你是台灣股票分析師。以下是 ${holding.stockName}(${holding.stockId}) 的最新新聞標題：

${headlines}

請做：
1. 用一句話（20字內）總結重點
2. 判斷：利多、利空、或中性
3. 是否有重大事件需要立即通知（除息除權、重大利空等）

回覆格式（純文字）：
摘要：[一句話]
判斷：[利多/利空/中性]
重要：[是/否]`;

    try {
      const reply = await callGemini(apiKey, prompt);
      const summaryMatch = reply.match(/摘要：(.+)/);
      const sentimentMatch = reply.match(/判斷：(.+)/);
      const importantMatch = reply.match(/重要：(.+)/);

      const summary = summaryMatch?.[1]?.trim() ?? articles[0].title;
      const sentimentRaw = sentimentMatch?.[1]?.trim() ?? '中性';
      const isImportant = importantMatch?.[1]?.includes('是') ?? false;

      const sentiment = sentimentRaw.includes('利多') ? 'bullish'
        : sentimentRaw.includes('利空') ? 'bearish' : 'neutral';

      await createNews({
        stockId: holding.stockId,
        stockName: holding.stockName,
        date: new Date().toISOString(),
        title: articles[0].title,
        summary,
        sentiment,
        source: 'Google News',
        originalUrl: articles[0].url,
      });

      if (isImportant) {
        const emoji = sentiment === 'bullish' ? '🟢' : sentiment === 'bearish' ? '🔴' : '⚪';
        importantNews.push(`${emoji} <b>${holding.stockName}(${holding.stockId})</b>\n${summary}`);
      }

      processed++;
    } catch (e) { debug.push(`${holding.stockId} error: ${String(e).slice(0, 100)}`); }

    await new Promise((r) => setTimeout(r, 500)); // rate limit
  }

  // Send important news immediately
  if (importantNews.length > 0) {
    await sendTelegram(`🚨 <b>重要新聞通知</b>\n\n${importantNews.join('\n\n')}`);
  }

  return NextResponse.json({ processed, important: importantNews.length, total: holdings.length, debug });
}
