import { NextResponse } from 'next/server';
import { getHoldings, createPublicInfo, createExDividend, getExDividends } from '@/lib/notion';
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
    // Parse table rows
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
// Fetch announced ex-dividends for the current year from TWSE TWT48U
async function fetchExDividendInfo(stockId: string): Promise<{ exDate: string; cash: number; stock: number }[]> {
  try {
    const year = new Date().getFullYear();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const res = await fetch(
      `https://www.twse.com.tw/exchangeReport/TWT48U?response=json&strDate=${year}0101&endDate=${year}1231`,
      { cache: 'no-store', headers: { 'Referer': 'https://www.twse.com.tw' } }
    );
    const data = await res.json() as { data?: string[][] };
    if (!data.data?.length) return [];

    return data.data
      .filter((row) => row[1]?.trim() === stockId) // filter by stock ID
      .map((row) => {
        // row[0]: "115年04月20日" → convert to YYYY-MM-DD
        const m = row[0].match(/(\d+)年(\d+)月(\d+)日/);
        if (!m) return null;
        const exDate = `${parseInt(m[1]) + 1911}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        const cashRaw = row[7] ?? '';
        const cash = parseFloat(cashRaw.replace(/<[^>]+>/g, '').trim()) || 0;
        const stock = parseFloat(row[4] ?? '0') || 0;
        return { exDate, cash, stock };
      })
      .filter((d): d is { exDate: string; cash: number; stock: number } =>
        d !== null && (d.cash > 0 || d.stock > 0) // all this year
      );
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
  const existingDividends = await getExDividends();
  const existingDates = new Set(existingDividends.map((e) => `${e.stockId}_${e.exDate}`));
  const alerts: string[] = [];

  for (const holding of holdings) {
    // Check MOPS announcements
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
          : typeRaw.includes('增資') ? 'rights-offering'
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

    // Check ex-dividend (upcoming announced this year)
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

    await new Promise((r) => setTimeout(r, 800));
  }

  if (alerts.length > 0) {
    await sendTelegram(`📋 <b>重大公告通知</b>\n\n${alerts.join('\n\n')}`);
  }

  return NextResponse.json({ processed: holdings.length, alerts: alerts.length });
}
