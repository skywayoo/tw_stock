import { Holding, ExDividend, Lending, NewsDigest, PublicInfo, DailyReport, RealizedPnl } from '@/types';

const DB = {
  HOLDINGS: process.env.NOTION_HOLDINGS_DB_ID!.trim(),
  EX_DIVIDEND: process.env.NOTION_EX_DIVIDEND_DB_ID!.trim(),
  LENDING: process.env.NOTION_LENDING_DB_ID!.trim(),
  NEWS: process.env.NOTION_NEWS_DB_ID!.trim(),
  PUBLIC_INFO: process.env.NOTION_PUBLIC_INFO_DB_ID!.trim(),
  DAILY_REPORT: process.env.NOTION_DAILY_REPORT_DB_ID!.trim(),
  REALIZED: process.env.NOTION_REALIZED_DB_ID!.trim(),
};

const HEADERS = () => ({
  'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});

async function queryDB(dbId: string, body: Record<string, unknown> = {}): Promise<{ results: Record<string, unknown>[] }> {
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST', headers: HEADERS(), body: JSON.stringify(body),
  });
  return res.json();
}

async function createPage(dbId: string, properties: Record<string, unknown>): Promise<string> {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST', headers: HEADERS(),
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
  const text = await res.text();
  const d = JSON.parse(text) as { id?: string; message?: string };
  if (!d.id) throw new Error(`Notion createPage failed: ${d.message ?? text.slice(0, 200)}`);
  return d.id;
}

async function updatePage(pageId: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH', headers: HEADERS(), body: JSON.stringify(body),
  });
}

// ============ Helpers ============
function getTitle(p: Record<string, unknown>): string {
  const props = p as { properties: Record<string, { type?: string; title?: { plain_text: string }[] }> };
  const titleProp = Object.values(props.properties).find((v) => v.type === 'title');
  return titleProp?.title?.[0]?.plain_text ?? '';
}
function getRich(p: Record<string, unknown>, key: string): string {
  const props = p as { properties: Record<string, { rich_text?: { plain_text: string }[] }> };
  return props.properties[key]?.rich_text?.[0]?.plain_text ?? '';
}
function getNum(p: Record<string, unknown>, key: string): number {
  const props = p as { properties: Record<string, { number?: number | null }> };
  return props.properties[key]?.number ?? 0;
}
function getBool(p: Record<string, unknown>, key: string): boolean {
  const props = p as { properties: Record<string, { checkbox?: boolean }> };
  return props.properties[key]?.checkbox ?? false;
}
function getDate(p: Record<string, unknown>, key: string): string {
  const props = p as { properties: Record<string, { date?: { start?: string } | null }> };
  return props.properties[key]?.date?.start ?? '';
}
function getSelect(p: Record<string, unknown>, key: string): string {
  const props = p as { properties: Record<string, { select?: { name: string } | null }> };
  return props.properties[key]?.select?.name ?? '';
}
function pid(p: Record<string, unknown>): string {
  return (p as { id: string }).id;
}

// ============ Holdings ============
export async function getHoldings(): Promise<Holding[]> {
  const r = await queryDB(DB.HOLDINGS, { sorts: [{ property: 'StockId', direction: 'ascending' }] });
  return r.results.map((p) => ({
    id: pid(p), stockId: getRich(p, 'StockId'), stockName: getTitle(p),
    shares: getNum(p, 'Shares'), avgCost: getNum(p, 'AvgCost'),
    buyDate: getDate(p, 'BuyDate'), notes: getRich(p, 'Notes') || undefined,
  }));
}

export async function createHolding(h: Omit<Holding, 'id' | 'currentPrice'>): Promise<string> {
  return createPage(DB.HOLDINGS, {
    Name: { title: [{ text: { content: h.stockName } }] },
    StockId: { rich_text: [{ text: { content: h.stockId } }] },
    Shares: { number: h.shares },
    AvgCost: { number: h.avgCost },
    BuyDate: { date: { start: h.buyDate } },
    Notes: { rich_text: [{ text: { content: h.notes || '' } }] },
  });
}

export async function updateHolding(id: string, data: Partial<Holding>): Promise<void> {
  const props: Record<string, unknown> = {};
  if (data.stockName) props.Name = { title: [{ text: { content: data.stockName } }] };
  if (data.shares !== undefined) props.Shares = { number: data.shares };
  if (data.avgCost !== undefined) props.AvgCost = { number: data.avgCost };
  if (data.buyDate) props.BuyDate = { date: { start: data.buyDate } };
  if (data.notes !== undefined) props.Notes = { rich_text: [{ text: { content: data.notes ?? '' } }] };
  await updatePage(id, { properties: props });
}

export async function deleteHolding(id: string): Promise<void> {
  await updatePage(id, { archived: true });
}

// ============ Ex-Dividend ============
export async function getExDividends(): Promise<ExDividend[]> {
  const r = await queryDB(DB.EX_DIVIDEND, { sorts: [{ property: 'ExDate', direction: 'descending' }] });
  return r.results.map((p) => ({
    id: pid(p), stockId: getRich(p, 'StockId'), stockName: getTitle(p),
    exDate: getDate(p, 'ExDate'), cashDividend: getNum(p, 'CashDividend'),
    stockDividend: getNum(p, 'StockDividend'), deductFromCost: getBool(p, 'DeductFromCost'),
    source: getRich(p, 'Source'),
  }));
}

export async function createExDividend(e: Omit<ExDividend, 'id'>): Promise<string> {
  return createPage(DB.EX_DIVIDEND, {
    Name: { title: [{ text: { content: e.stockName } }] },
    StockId: { rich_text: [{ text: { content: e.stockId } }] },
    ExDate: { date: { start: e.exDate } },
    CashDividend: { number: e.cashDividend },
    StockDividend: { number: e.stockDividend },
    DeductFromCost: { checkbox: e.deductFromCost },
    Source: { rich_text: [{ text: { content: e.source } }] },
  });
}

export async function toggleDeductFromCost(id: string, value: boolean): Promise<void> {
  await updatePage(id, { properties: { DeductFromCost: { checkbox: value } } });
}

// ============ Lending ============
export async function getLendings(): Promise<Lending[]> {
  const r = await queryDB(DB.LENDING);
  return r.results.map((p) => ({
    id: pid(p), stockId: getRich(p, 'StockId'), stockName: getTitle(p),
    sharesLent: getNum(p, 'SharesLent'), startDate: getDate(p, 'StartDate'),
    endDate: getDate(p, 'EndDate') || undefined, annualRate: getNum(p, 'AnnualRate'),
    brokerFee: getNum(p, 'BrokerFee'),
    accruedInterest: getNum(p, 'AccruedInterest'), isActive: getBool(p, 'IsActive'),
  }));
}

export async function createLending(l: Omit<Lending, 'id'>): Promise<string> {
  return createPage(DB.LENDING, {
    Name: { title: [{ text: { content: l.stockName } }] },
    StockId: { rich_text: [{ text: { content: l.stockId } }] },
    SharesLent: { number: l.sharesLent },
    StartDate: { date: { start: l.startDate } },
    AnnualRate: { number: l.annualRate },
    BrokerFee: { number: l.brokerFee },
    AccruedInterest: { number: 0 },
    IsActive: { checkbox: true },
  });
}

export async function returnLending(
  id: string, endDate: string, totalInterest: number,
  grossInterest?: number, brokerFeeAmount?: number, withholdingTax?: number, netInterest?: number
): Promise<void> {
  await updatePage(id, { properties: {
    EndDate: { date: { start: endDate } },
    AccruedInterest: { number: totalInterest },
    ...(grossInterest != null && { GrossInterest: { number: grossInterest } }),
    ...(brokerFeeAmount != null && { BrokerFeeAmount: { number: brokerFeeAmount } }),
    ...(withholdingTax != null && { WithholdingTax: { number: withholdingTax } }),
    ...(netInterest != null && { NetInterest: { number: netInterest } }),
    IsActive: { checkbox: false },
  }});
}

export async function updateLendingInterest(id: string, interest: number): Promise<void> {
  await updatePage(id, { properties: { AccruedInterest: { number: interest } } });
}

// ============ News ============
export async function getNews(stockId?: string, limit = 50): Promise<NewsDigest[]> {
  const filter = stockId ? { property: 'StockId', rich_text: { equals: stockId } } : undefined;
  const r = await queryDB(DB.NEWS, {
    filter, sorts: [{ property: 'Date', direction: 'descending' }], page_size: limit,
  });
  return r.results.map((p) => ({
    id: pid(p), stockId: getRich(p, 'StockId'), stockName: getTitle(p),
    date: getDate(p, 'Date'), title: getRich(p, 'Title'),
    summary: getRich(p, 'Summary'), sentiment: getSelect(p, 'Sentiment') as 'bullish' | 'bearish' | 'neutral',
    source: getRich(p, 'Source'), originalUrl: getRich(p, 'OriginalUrl') || undefined,
  }));
}

export async function createNews(n: Omit<NewsDigest, 'id'>): Promise<string> {
  return createPage(DB.NEWS, {
    Name: { title: [{ text: { content: n.stockName } }] },
    StockId: { rich_text: [{ text: { content: n.stockId } }] },
    Date: { date: { start: n.date } },
    Title: { rich_text: [{ text: { content: n.title } }] },
    Summary: { rich_text: [{ text: { content: n.summary } }] },
    Sentiment: { select: { name: n.sentiment } },
    Source: { rich_text: [{ text: { content: n.source } }] },
    OriginalUrl: { rich_text: [{ text: { content: n.originalUrl || '' } }] },
  });
}

// ============ Public Info ============
export async function getPublicInfos(limit = 30): Promise<PublicInfo[]> {
  const r = await queryDB(DB.PUBLIC_INFO, {
    sorts: [{ property: 'Date', direction: 'descending' }], page_size: limit,
  });
  return r.results.map((p) => ({
    id: pid(p), stockId: getRich(p, 'StockId'), stockName: getTitle(p),
    date: getDate(p, 'Date'), title: getRich(p, 'Title'),
    summary: getRich(p, 'Summary'), type: getSelect(p, 'Type') as PublicInfo['type'],
    isImportant: getBool(p, 'IsImportant'),
  }));
}

export async function getPublicInfosByType(type: PublicInfo['type'], limit = 50): Promise<PublicInfo[]> {
  const r = await queryDB(DB.PUBLIC_INFO, {
    filter: { property: 'Type', select: { equals: type } },
    sorts: [{ property: 'Date', direction: 'descending' }],
    page_size: limit,
  });
  return r.results.map((p) => ({
    id: pid(p), stockId: getRich(p, 'StockId'), stockName: getTitle(p),
    date: getDate(p, 'Date'), title: getRich(p, 'Title'),
    summary: getRich(p, 'Summary'), type: getSelect(p, 'Type') as PublicInfo['type'],
    isImportant: getBool(p, 'IsImportant'),
  }));
}

export async function createPublicInfo(info: Omit<PublicInfo, 'id'>): Promise<string> {
  return createPage(DB.PUBLIC_INFO, {
    Name: { title: [{ text: { content: info.stockName } }] },
    StockId: { rich_text: [{ text: { content: info.stockId } }] },
    Date: { date: { start: info.date } },
    Title: { rich_text: [{ text: { content: info.title } }] },
    Summary: { rich_text: [{ text: { content: info.summary } }] },
    Type: { select: { name: info.type } },
    IsImportant: { checkbox: info.isImportant },
  });
}

// ============ Daily Report ============
export async function getDailyReports(limit = 30): Promise<DailyReport[]> {
  const r = await queryDB(DB.DAILY_REPORT, {
    sorts: [{ property: 'Date', direction: 'descending' }], page_size: limit,
  });
  return r.results.map((p) => {
    let snapshots = [];
    try { snapshots = JSON.parse(getRich(p, 'Snapshots') || '[]'); } catch { snapshots = []; }
    return {
      id: pid(p), date: getDate(p, 'Date'), totalValue: getNum(p, 'TotalValue'),
      totalCost: getNum(p, 'TotalCost'), dayChange: getNum(p, 'DayChange'),
      dayChangePct: getNum(p, 'DayChangePct'), content: getRich(p, 'Content'),
      holdingSnapshots: snapshots,
    };
  });
}

export async function createDailyReport(report: Omit<DailyReport, 'id'>): Promise<string> {
  return createPage(DB.DAILY_REPORT, {
    Name: { title: [{ text: { content: `${report.date} 日報` } }] },
    Date: { date: { start: report.date } },
    TotalValue: { number: report.totalValue },
    TotalCost: { number: report.totalCost },
    DayChange: { number: report.dayChange },
    DayChangePct: { number: report.dayChangePct },
    Content: { rich_text: [{ text: { content: report.content.slice(0, 2000) } }] },
    Snapshots: { rich_text: [{ text: { content: JSON.stringify(report.holdingSnapshots).slice(0, 2000) } }] },
  });
}

// ============ Realized P&L ============
export async function getRealizedPnls(): Promise<RealizedPnl[]> {
  const r = await queryDB(DB.REALIZED, { sorts: [{ property: 'SellDate', direction: 'descending' }] });
  return r.results.map((p) => ({
    id: pid(p), stockId: getRich(p, 'StockId'), stockName: getTitle(p),
    shares: getNum(p, 'Shares'), buyPrice: getNum(p, 'BuyPrice'),
    sellPrice: getNum(p, 'SellPrice'), sellDate: getDate(p, 'SellDate'),
    dividendDeducted: getNum(p, 'DividendDeducted'), lendingInterest: getNum(p, 'LendingInterest'),
    notes: getRich(p, 'Notes') || undefined,
  }));
}

export async function createRealizedPnl(r: Omit<RealizedPnl, 'id'>): Promise<string> {
  return createPage(DB.REALIZED, {
    Name: { title: [{ text: { content: r.stockName } }] },
    StockId: { rich_text: [{ text: { content: r.stockId } }] },
    Shares: { number: r.shares },
    BuyPrice: { number: r.buyPrice },
    SellPrice: { number: r.sellPrice },
    SellDate: { date: { start: r.sellDate } },
    DividendDeducted: { number: r.dividendDeducted },
    LendingInterest: { number: r.lendingInterest },
    Notes: { rich_text: [{ text: { content: r.notes || '' } }] },
  });
}
