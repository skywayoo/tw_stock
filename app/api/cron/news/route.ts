import { NextResponse } from 'next/server';
import { getHoldings, getNews, createNews } from '@/lib/notion';
import { callGemini } from '@/lib/gemini';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

// Publishers explicitly blacklisted per user request 2026-05-21:
// MoneyDJ 理財網 + CMoney 股市爆料同學會 are noisy/low-quality for trading signal.
const BLOCKED_PUBLISHERS = ['MoneyDJ', 'moneydj', '理財網', 'CMoney', 'cmoney', '股市爆料同學會', '爆料同學會'];

function isBlockedPublisher(title: string, url: string): boolean {
  const haystack = `${title} ${url}`.toLowerCase();
  return BLOCKED_PUBLISHERS.some((p) => haystack.includes(p.toLowerCase()));
}

function isSameDayTaiwan(pubDateStr: string): boolean {
  // Today in Taipei (UTC+8). Article qualifies if its pubDate is the same calendar day.
  const pubTs = Date.parse(pubDateStr);
  if (isNaN(pubTs)) return false;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(new Date());
  const pubDay = fmt.format(new Date(pubTs));
  return pubDay === today;
}

async function fetchGoogleNewsByQuery(query: string, limit = 5): Promise<{ title: string; url: string }[]> {
  // when=1d limits to past 24h; we additionally enforce "today only" (Taipei TZ) below,
  // and drop blocked publishers (MoneyDJ / CMoney) per user rule.
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}+when:1d&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
  });
  if (!res.ok) return [];
  const text = await res.text();
  const items: { title: string; url: string }[] = [];
  const matches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of matches) {
    const block = m[1];
    const titleM = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkM = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubM = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titleM || !linkM) continue;
    const title = titleM[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
    const link = linkM[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
    if (!pubM || !isSameDayTaiwan(pubM[1].trim())) continue;
    if (isBlockedPublisher(title, link)) continue;
    if (title && link) items.push({ title, url: link });
    if (items.length >= limit) break;
  }
  return items;
}

async function fetchGoogleNewsRss(stockId: string, stockName: string): Promise<{ title: string; url: string }[]> {
  return fetchGoogleNewsByQuery(`${stockName} ${stockId}`);
}

// Extra keyword combos to watch per stock — hits via these are auto-flagged 重要 regardless of Gemini judgement.
// Lets us catch "hidden catalyst" stories that the generic stockName+stockId query may miss
// (e.g. 強茂 + FOPLP cross-mentions usually feature 群創 as the headline subject).
const KEYWORD_WATCHES: Record<string, string[]> = {
  '2481': ['FOPLP', '群創 FOPLP', '亞智 FOPLP', '功率元件 漲價', '安世 轉單', '揚傑 制裁'],
  '3257': ['Switch 2', 'RTX 50', 'AI 伺服器 PMIC', 'PMIC 漲價', '虹冠 5月營收'],
};

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
    const baseArticles = await fetchGoogleNewsRss(holding.stockId, holding.stockName);

    // Extra keyword-watch queries — these articles get auto-flagged 重要 if fresh.
    const watchKeywords = KEYWORD_WATCHES[holding.stockId] ?? [];
    const watchTitles = new Set<string>();
    const watchArticles: { title: string; url: string }[] = [];
    for (const kw of watchKeywords) {
      const arts = await fetchGoogleNewsByQuery(`${holding.stockName} ${kw}`, 3);
      for (const a of arts) {
        if (!watchTitles.has(a.title) && !baseArticles.some((b) => b.title === a.title)) {
          watchTitles.add(a.title);
          watchArticles.push(a);
        }
      }
    }
    const articles = [...baseArticles, ...watchArticles];

    if (articles.length === 0) {
      debug.push(`${holding.stockId}: 0 articles`);
      continue;
    }

    // Dedup against Notion (last 50 entries per stock)
    const existing = await getNews(holding.stockId, 50);
    const seenTitles = new Set(existing.map((e) => e.title));
    const fresh = articles.filter((a) => !seenTitles.has(a.title));
    skipped += articles.length - fresh.length;
    debug.push(`${holding.stockId}: ${articles.length} (${baseArticles.length}+${watchArticles.length} kw) articles, ${fresh.length} fresh`);
    if (fresh.length === 0) continue;

    const headlines = fresh.map((a) => `- ${a.title}`).join('\n');
    const prompt = `你是台灣股票分析師。以下是 ${holding.stockName}(${holding.stockId}) 最新且尚未通知過的新聞標題：

${headlines}

請做：
1. 用 30-50 字繁體中文，明確總結這批新聞重點（要寫完整句子，不要只寫一兩個詞）
2. 整體判斷：利多／利空／中性
3. 是否屬於需要立即通知的重大事件（除息除權、財報、重大訂單、訴訟、收購、火警、停產、關鍵高層異動、漲跌停 ⋯⋯）
4. 內文時效：判斷此批新聞是否在報導「最近 24 小時內發生」的事件。若標題暗示是過去事件回顧（例：「3 月時公司...」「去年宣布的...」「歷年回顧」），標記為「舊聞」。

純文字格式（每欄都必填，不要加 markdown 符號）：
摘要：[30-50 字完整句子]
判斷：[利多/利空/中性]
重要：[是/否]
時效：[新/舊聞]`;

    try {
      const reply = await callGemini(apiKey, prompt);
      const summaryMatch = reply.match(/摘要：(.+)/);
      const sentimentMatch = reply.match(/判斷：(.+)/);
      const importantMatch = reply.match(/重要：(.+)/);
      const recencyMatch = reply.match(/時效：(.+)/);

      let summary = stripMarkdown(summaryMatch?.[1]?.trim() ?? '');
      const sentimentRaw = sentimentMatch?.[1]?.trim() ?? '中性';
      const isImportant = importantMatch?.[1]?.includes('是') ?? false;
      const isOldRecap = recencyMatch?.[1]?.includes('舊聞') ?? false;

      if (isOldRecap) {
        debug.push(`${holding.stockId}: skipped — Gemini classified as 舊聞`);
        continue;
      }

      // Fallback: too short / empty → use top headline as summary
      if (summary.length < 8) summary = fresh[0].title;

      const sentiment = sentimentRaw.includes('利多') ? 'bullish'
        : sentimentRaw.includes('利空') ? 'bearish' : 'neutral';

      // Auto-flag as important if any fresh article hit a watched keyword combo.
      const matchedKw = watchKeywords.find((kw) =>
        fresh.some((a) => a.title.includes(kw) || watchTitles.has(a.title))
      );
      const finalImportant = isImportant || !!matchedKw;

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

      if (finalImportant) {
        const emoji = sentiment === 'bullish' ? '🟢' : sentiment === 'bearish' ? '🔴' : '⚪';
        const kwTag = matchedKw ? `\n🔖 關鍵字觸發：${matchedKw}` : '';
        importantNews.push(
          `${emoji} <b>${holding.stockName}(${holding.stockId})</b>\n` +
          `📰 ${fresh[0].title}\n` +
          `💭 ${summary}${kwTag}\n` +
          `🔗 ${fresh[0].url}`
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
