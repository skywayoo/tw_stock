import { NextResponse } from 'next/server';
import { getHoldings, createPublicInfo, createExDividend, getExDividends, getPublicInfosByType } from '@/lib/notion';
import { callGemini } from '@/lib/gemini';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

// Fetch major announcements from MOPS (公開資訊觀測站)
async function fetchMopsAnnouncements(stockId: string): Promise<{ title: string; date: string; content: string }[]> {
  try {
    const res = await fetch(
      `https://mops.twse.com.tw/mops/web/ajax_t05st01?encodeURIComponent=1&step=1&TYPEK=sii&code=${stockId}&firstin=1`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        cache: 'no-store',
      }
    );
    const html = await res.text();
    const rows: { title: string; date: string; content: string }[] = [];
    const rowMatches = html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g);
    for (const row of rowMatches) {
      const cells = [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
        (m) => m[1].replace(/<[^>]+>/g, '').trim()
      );
      if (cells.length >= 3 && cells[0].match(/\d{3}\/\d{2}\/\d{2}/)) {
        rows.push({ date: cells[0], title: cells[2] || cells[1], content: cells[3] || '' });
        if (rows.length >= 5) break;
      }
    }
    return rows;
  } catch {
    return [];
  }
}

// Fetch ex-dividend info from TWSE
async function fetchExDividendInfo(stockId: string): Promise<{ exDate: string; cash: number; stock: number }[]> {
  try {
    const year = new Date().getFullYear();
    const res = await fetch(
      `https://www.twse.com.tw/exchangeReport/TWT48U?response=json&strDate=${year}0101&endDate=${year}1231`,
      { cache: 'no-store', headers: { 'Referer': 'https://www.twse.com.tw' } }
    );
    const data = await res.json() as { data?: string[][] };
    if (!data.data?.length) return [];

    return data.data
      .filter((row) => row[1]?.trim() === stockId)
      .map((row) => {
        const m = row[0].match(/(\d+)年(\d+)月(\d+)日/);
        if (!m) return null;
        const exDate = `${parseInt(m[1]) + 1911}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        const cash = parseFloat(row[7]?.replace(/<[^>]+>/g, '').trim() ?? '0') || 0;
        const stock = parseFloat(row[4] ?? '0') || 0;
        return { exDate, cash, stock };
      })
      .filter((d): d is { exDate: string; cash: number; stock: number } =>
        d !== null && (d.cash > 0 || d.stock > 0)
      );
  } catch {
    return [];
  }
}

// Parse revenue for a stock from pre-fetched TWSE t187ap05_L dataset
function parseRevenue(
  stockId: string, dataset: Record<string, string>[]
): { revenue: number; yoyChange: number; period: string; _debug?: string } {
  const row = dataset.find((d) => d['公司代號'] === stockId);
  if (!row) return { revenue: 0, yoyChange: 0, period: '', _debug: 'not_in_listed_dataset' };
  const ym = row['資料年月'] ?? '';
  const rocYear = parseInt(ym.slice(0, -2));
  const month = ym.slice(-2);
  const period = `${rocYear + 1911}-${month}`;
  const revenue = parseInt((row['營業收入-當月營收'] ?? '0').replace(/,/g, '')) || 0;
  const yoyChange = parseFloat(row['營業收入-去年同月增減(%)'] ?? '0') || 0;
  return { revenue, yoyChange, period };
}

// Parse EPS for a stock from pre-fetched TWSE t187ap06_L_ci dataset
function parseEPS(
  stockId: string, dataset: Record<string, string>[]
): { eps: number; period: string; _debug?: string } {
  const row = dataset.find((d) => d['公司代號'] === stockId);
  if (!row) return { eps: 0, period: '', _debug: 'not_in_listed_dataset' };
  const rocYear = parseInt(row['年度'] ?? '0');
  const quarter = parseInt(row['季別'] ?? '0');
  const period = `${rocYear + 1911}Q${quarter}`;
  const eps = parseFloat(row['基本每股盈餘（元）'] ?? 'NaN');
  if (isNaN(eps)) return { eps: 0, period, _debug: 'eps_field_empty' };
  return { eps, period };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const holdings = await getHoldings();
  const existingDividends = await getExDividends();
  const existingDates = new Set(existingDividends.map((e) => `${e.stockId}_${e.exDate}`));

  // Load existing revenue/EPS records for dedup
  const existingRevenue = await getPublicInfosByType('revenue', 50);
  const existingEps = await getPublicInfosByType('eps', 50);
  const seenRevenue = new Set(existingRevenue.map((r) => r.title));
  const seenEps = new Set(existingEps.map((r) => r.title));

  // Load existing announcements for dedup (last 100, keyed by stockId+title)
  const existingAnnouncements = await getPublicInfosByType('announcement', 100);
  const existingDividendAnnos = await getPublicInfosByType('ex-dividend', 50);
  const existingCapital = await getPublicInfosByType('capital-increase', 50);
  const seenAnnouncements = new Set(
    [...existingAnnouncements, ...existingDividendAnnos, ...existingCapital]
      .map((a) => `${a.stockId}_${a.title}`)
  );

  const stripMarkdown = (s: string) => s.replace(/\*+/g, '').replace(/^#+\s*/gm, '').replace(/`+/g, '').trim();

  // Fetch TWSE OpenAPI datasets once (covers listed stocks, not OTC)
  const twseHeaders = { 'Referer': 'https://www.twse.com.tw' };
  let revenueDataset: Record<string, string>[] = [];
  let epsDataset: Record<string, string>[] = [];
  try {
    const [revRes, epsRes] = await Promise.all([
      fetch('https://openapi.twse.com.tw/v1/opendata/t187ap05_L', { cache: 'no-store', headers: twseHeaders }),
      fetch('https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci', { cache: 'no-store', headers: twseHeaders }),
    ]);
    if (revRes.ok) revenueDataset = await revRes.json() as Record<string, string>[];
    if (epsRes.ok) epsDataset = await epsRes.json() as Record<string, string>[];
  } catch { /* datasets stay empty, stocks will show _debug: not_in_listed_dataset */ }

  const alerts: string[] = [];

  for (const holding of holdings) {
    // ── 1. MOPS Announcements ──────────────────────────────────────────────
    const announcements = await fetchMopsAnnouncements(holding.stockId);
    for (const ann of announcements) {
      const annKey = `${holding.stockId}_${ann.title}`;
      if (seenAnnouncements.has(annKey)) continue;
      seenAnnouncements.add(annKey);

      const prompt = `以下是台灣上市公司 ${holding.stockName}(${holding.stockId}) 的重大訊息：
標題：${ann.title}
內容：${ann.content}

請判斷：
1. 類型：除息/除權/增資/一般公告/其他
2. 是否重要（影響股價或對投資人決策有意義）：是/否
3. 用 30-50 字繁體中文完整摘要（不要只寫關鍵字，要寫成句子）

純文字格式（不要 markdown 符號）：
類型：[類型]
重要：[是/否]
摘要：[30-50 字句子]`;

      try {
        const reply = await callGemini(apiKey, prompt);
        const typeMatch = reply.match(/類型：(.+)/);
        const importantMatch = reply.match(/重要：(.+)/);
        const summaryMatch = reply.match(/摘要：(.+)/);

        const typeRaw = typeMatch?.[1]?.trim() ?? '其他';
        const isImportant = importantMatch?.[1]?.includes('是') ?? false;
        let summary = stripMarkdown(summaryMatch?.[1]?.trim() ?? '');
        if (summary.length < 8) summary = ann.title;

        const type = typeRaw.includes('除息') ? 'ex-dividend'
          : typeRaw.includes('除權') ? 'ex-dividend'
          : typeRaw.includes('增資') ? 'capital-increase'
          : 'announcement';

        await createPublicInfo({
          stockId: holding.stockId,
          stockName: holding.stockName,
          date: new Date().toISOString().split('T')[0],
          title: ann.title,
          summary,
          type,
          isImportant,
        });

        if (isImportant) {
          alerts.push(
            `📢 <b>${holding.stockName}(${holding.stockId})</b>\n` +
            `${ann.title}\n` +
            `💭 ${summary}`
          );
        }
      } catch { /* skip */ }
    }

    // ── 2. Ex-Dividend ────────────────────────────────────────────────────
    const exDivs = await fetchExDividendInfo(holding.stockId);
    for (const exDiv of exDivs) {
      const key = `${holding.stockId}_${exDiv.exDate}`;
      if (!existingDates.has(key)) {
        existingDates.add(key);
        await createExDividend({
          stockId: holding.stockId,
          stockName: holding.stockName,
          exDate: exDiv.exDate,
          cashDividend: exDiv.cash,
          stockDividend: exDiv.stock,
          deductFromCost: false,
          source: 'TWSE',
        });
        alerts.push(
          `💰 <b>${holding.stockName}(${holding.stockId})</b> 除息\n` +
          `除息日：${exDiv.exDate}｜現金股利：${exDiv.cash}元`
        );
      }
    }

    // ── 3. Monthly Revenue ────────────────────────────────────────────────
    const rev = parseRevenue(holding.stockId, revenueDataset);
    if (rev && !('_debug' in rev)) {
      const revKey = `${holding.stockId}_${rev.period}月營收`;
      if (!seenRevenue.has(revKey)) {
        seenRevenue.add(revKey);
        const revenueM = (rev.revenue / 1000).toFixed(0); // convert 千元 → 百萬
        const yoySign = rev.yoyChange >= 0 ? '+' : '';
        const summary = `${rev.period} 月營收 ${revenueM}百萬，YoY ${yoySign}${rev.yoyChange.toFixed(1)}%`;
        await createPublicInfo({
          stockId: holding.stockId,
          stockName: holding.stockName,
          date: new Date().toISOString().split('T')[0],
          title: `${holding.stockId}_${rev.period}月營收`,
          summary,
          type: 'revenue',
          isImportant: Math.abs(rev.yoyChange) >= 10,
        });
        const icon = rev.yoyChange >= 10 ? '🚀' : rev.yoyChange <= -10 ? '📉' : '📊';
        alerts.push(`${icon} <b>${holding.stockName}</b> ${summary}`);
      }
    }

    // ── 4. Quarterly EPS ──────────────────────────────────────────────────
    const epsData = parseEPS(holding.stockId, epsDataset);
    if (epsData && !('_debug' in epsData)) {
      const epsKey = `${holding.stockId}_${epsData.period}EPS`;
      if (!seenEps.has(epsKey)) {
        seenEps.add(epsKey);
        const summary = `${epsData.period} EPS ${epsData.eps.toFixed(2)} 元`;
        await createPublicInfo({
          stockId: holding.stockId,
          stockName: holding.stockName,
          date: new Date().toISOString().split('T')[0],
          title: `${holding.stockId}_${epsData.period}EPS`,
          summary,
          type: 'eps',
          isImportant: epsData.eps > 0,
        });
        alerts.push(`📑 <b>${holding.stockName}</b> ${summary}`);
      }
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  if (alerts.length > 0) {
    await sendTelegram(`📋 <b>重大公告通知</b>\n\n${alerts.join('\n\n')}`);
  }

  return NextResponse.json({ processed: holdings.length, alerts: alerts.length });
}
