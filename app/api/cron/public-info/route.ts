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

// Fetch monthly revenue from MOPS nas static file
// Column order: 公司代號, 公司名稱, 當月營收, 上月營收, 去年當月, 上月增減%, 去年同月增減%, 累計, 去年累計, 累計增減%
async function fetchMonthlyRevenue(stockId: string): Promise<{
  revenue: number; yoyChange: number; period: string; _debug?: string;
} | null> {
  try {
    const now = new Date();
    const targetDate = now.getDate() >= 10
      ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
      : new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const rocYear = targetDate.getFullYear() - 1911;
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const period = `${targetDate.getFullYear()}-${month}`;

    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://mops.twse.com.tw/mops/web/t05st10_q',
    };
    const debugInfo: string[] = [];
    for (const market of ['sii', 'otc']) {
      const url = `https://mops.twse.com.tw/nas/t21/${market}/${rocYear}_${month}_0.html`;
      const res = await fetch(url, { headers: reqHeaders, cache: 'no-store' });
      if (!res.ok) { debugInfo.push(`${market}:${res.status}`); continue; }
      const buffer = await res.arrayBuffer();
      const html = new TextDecoder('big5').decode(buffer);
      if (html.includes('PAGE CANNOT BE ACCESSED') || html.includes('頁面無法執行')) {
        debugInfo.push(`${market}:blocked`); continue;
      }
      for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
        const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
          .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim());
        if (cells[0] === stockId) {
          const revenue = parseInt(cells[2]?.replace(/,/g, '') || '0');
          const yoyChange = parseFloat(cells[6] || '0');
          return { revenue, yoyChange, period };
        }
      }
      debugInfo.push(`${market}:not_found(len=${html.length})`);
    }
    return { revenue: 0, yoyChange: 0, period, _debug: debugInfo.join(',') };
  } catch (e) {
    return { revenue: 0, yoyChange: 0, period: 'err', _debug: String(e) };
  }
}

// Fetch latest quarterly EPS from MOPS (tries both sii and otc market types)
async function fetchLatestEPS(stockId: string): Promise<{
  eps: number; period: string; _debug?: string;
} | null> {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Q4/Annual published by Mar 31 → available Apr+
    // Q1 published by May 15 → available May+
    // Q2 published by Aug 14 → available Aug+
    // Q3 published by Nov 14 → available Nov+
    let quarter: number;
    let reportYear: number;
    if (month >= 5 && month <= 7) { quarter = 1; reportYear = year; }
    else if (month >= 8 && month <= 10) { quarter = 2; reportYear = year; }
    else if (month >= 11) { quarter = 3; reportYear = year; }
    else if (month >= 4) { quarter = 4; reportYear = year - 1; }
    else { quarter = 3; reportYear = year - 1; }

    const rocYear = reportYear - 1911;
    const period = `${reportYear}Q${quarter}`;
    const debugInfo: string[] = [];

    for (const typek of ['sii', 'otc']) {
      const res = await fetch('https://mops.twse.com.tw/mops/web/ajax_t163sb04', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://mops.twse.com.tw/mops/web/t163sb04',
        },
        body: `encodeURIComponent=1&step=1&TYPEK=${typek}&code=${stockId}&year=${rocYear}&season=${quarter}`,
        cache: 'no-store',
      });
      if (!res.ok) { debugInfo.push(`${typek}:http_${res.status}`); continue; }
      const buffer = await res.arrayBuffer();
      const html = new TextDecoder('big5').decode(buffer);
      if (html.includes('PAGE CANNOT BE ACCESSED') || html.includes('頁面無法執行')) {
        debugInfo.push(`${typek}:blocked`); continue;
      }
      const epsMatch = html.match(/基本每股盈餘[^<]*<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/);
      if (epsMatch) {
        const raw = epsMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim();
        const eps = parseFloat(raw);
        if (!isNaN(eps)) return { eps, period };
      }
      debugInfo.push(`${typek}:no_match(len=${html.length})`);
    }
    return { eps: 0, period, _debug: debugInfo.join(',') };
  } catch (e) {
    return { eps: 0, period: 'err', _debug: String(e) };
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
  const existingDividends = await getExDividends();
  const existingDates = new Set(existingDividends.map((e) => `${e.stockId}_${e.exDate}`));

  // Load existing revenue/EPS records for dedup
  const existingRevenue = await getPublicInfosByType('revenue', 50);
  const existingEps = await getPublicInfosByType('eps', 50);
  const seenRevenue = new Set(existingRevenue.map((r) => `${r.stockId}_${r.title}`));
  const seenEps = new Set(existingEps.map((r) => `${r.stockId}_${r.title}`));

  const alerts: string[] = [];
  const debug: Record<string, unknown> = {};

  for (const holding of holdings) {
    // ── 1. MOPS Announcements ──────────────────────────────────────────────
    const announcements = await fetchMopsAnnouncements(holding.stockId);
    for (const ann of announcements) {
      const prompt = `以下是台灣上市公司 ${holding.stockName}(${holding.stockId}) 的重大訊息：
標題：${ann.title}
內容：${ann.content}

請判斷：
1. 類型：除息/除權/增資/一般公告/其他
2. 是否重要（影響股價）：是/否
3. 用15字以內摘要

格式：
類型：[類型]
重要：[是/否]
摘要：[摘要]`;

      try {
        const reply = await callGemini(apiKey, prompt);
        const typeMatch = reply.match(/類型：(.+)/);
        const importantMatch = reply.match(/重要：(.+)/);
        const summaryMatch = reply.match(/摘要：(.+)/);

        const typeRaw = typeMatch?.[1]?.trim() ?? '其他';
        const isImportant = importantMatch?.[1]?.includes('是') ?? false;
        const summary = summaryMatch?.[1]?.trim() ?? ann.title;

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
          alerts.push(`📢 <b>${holding.stockName}</b>：${summary}`);
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
    const rev = await fetchMonthlyRevenue(holding.stockId);
    debug[`rev_${holding.stockId}`] = rev;
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
    const epsData = await fetchLatestEPS(holding.stockId);
    debug[`eps_${holding.stockId}`] = epsData;
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

  return NextResponse.json({ processed: holdings.length, alerts: alerts.length, debug });
}
