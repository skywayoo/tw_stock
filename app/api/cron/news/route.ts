import { NextResponse } from 'next/server';
import { getHoldings, getNews, createNews } from '@/lib/notion';
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

function stripMarkdown(s: string): string {
  return s.replace(/\*+/g, '').replace(/^#+\s*/gm, '').replace(/`+/g, '').trim();
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

  const importantNews: string[] = [];
  let processed = 0;
  let skipped = 0;
  const debug: string[] = [];

  for (const holding of holdings) {
    const articles = await fetchGoogleNewsRss(holding.stockId, holding.stockName);
    if (articles.length === 0) {
      debug.push(`${holding.stockId}: 0 articles`);
      continue;
    }

    // Dedup against Notion (last 50 entries per stock)
    const existing = await getNews(holding.stockId, 50);
    const seenTitles = new Set(existing.map((e) => e.title));
    const fresh = articles.filter((a) => !seenTitles.has(a.title));
    skipped += articles.length - fresh.length;
    debug.push(`${holding.stockId}: ${articles.length} articles, ${fresh.length} fresh`);
    if (fresh.length === 0) continue;

    const headlines = fresh.map((a) => `- ${a.title}`).join('\n');
    const prompt = `你是台灣股票分析師。以下是 ${holding.stockName}(${holding.stockId}) 最新且尚未通知過的新聞標題：

${headlines}

請做：
1. 用 30-50 字繁體中文，明確總結這批新聞重點（要寫完整句子，不要只寫一兩個詞）
2. 整體判斷：利多／利空／中性
3. 是否屬於需要立即通知的重大事件（除息除權、財報、重大訂單、訴訟、收購、火警、停產、關鍵高層異動、漲跌停 ⋯⋯）

純文字格式（每欄都必填，不要加 markdown 符號）：
摘要：[30-50 字完整句子]
判斷：[利多/利空/中性]
重要：[是/否]`;

    try {
      const reply = await callGemini(apiKey, prompt);
      const summaryMatch = reply.match(/摘要：(.+)/);
      const sentimentMatch = reply.match(/判斷：(.+)/);
      const importantMatch = reply.match(/重要：(.+)/);

      let summary = stripMarkdown(summaryMatch?.[1]?.trim() ?? '');
      const sentimentRaw = sentimentMatch?.[1]?.trim() ?? '中性';
      const isImportant = importantMatch?.[1]?.includes('是') ?? false;

      // Fallback: too short / empty → use top headline as summary
      if (summary.length < 8) summary = fresh[0].title;

      const sentiment = sentimentRaw.includes('利多') ? 'bullish'
        : sentimentRaw.includes('利空') ? 'bearish' : 'neutral';

      await createNews({
        stockId: holding.stockId,
        stockName: holding.stockName,
        date: new Date().toISOString(),
        title: fresh[0].title,
        summary,
        sentiment,
        source: 'Google News',
        originalUrl: fresh[0].url,
      });

      if (isImportant) {
        const emoji = sentiment === 'bullish' ? '🟢' : sentiment === 'bearish' ? '🔴' : '⚪';
        importantNews.push(
          `${emoji} <b>${holding.stockName}(${holding.stockId})</b>\n` +
          `📰 ${fresh[0].title}\n` +
          `💭 ${summary}`
        );
      }

      processed++;
    } catch (e) { debug.push(`${holding.stockId} error: ${String(e).slice(0, 100)}`); }

    await new Promise((r) => setTimeout(r, 500));
  }

  if (importantNews.length > 0) {
    await sendTelegram(`🚨 <b>重要新聞通知</b>\n\n${importantNews.join('\n\n')}`);
  }

  return NextResponse.json({ processed, skipped, important: importantNews.length, total: holdings.length, debug });
}
