import { Client } from '@notionhq/client';
import { Holding, ExDividend, Lending, NewsDigest, PublicInfo, DailyReport } from '@/types';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DB = {
  HOLDINGS: process.env.NOTION_HOLDINGS_DB_ID!,
  EX_DIVIDEND: process.env.NOTION_EX_DIVIDEND_DB_ID!,
  LENDING: process.env.NOTION_LENDING_DB_ID!,
  NEWS: process.env.NOTION_NEWS_DB_ID!,
  PUBLIC_INFO: process.env.NOTION_PUBLIC_INFO_DB_ID!,
  DAILY_REPORT: process.env.NOTION_DAILY_REPORT_DB_ID!,
};

// ============ Helpers ============
function getTitle(p: Record<string, unknown>): string {
  const props = p as { properties: Record<string, { title?: { plain_text: string }[] }> };
  const titleProp = Object.values(props.properties).find((v) => (v as { type?: string }).type === 'title');
  return (titleProp as { title?: { plain_text: string }[] })?.title?.[0]?.plain_text ?? '';
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
function id(p: Record<string, unknown>): string {
  return (p as { id: string }).id;
}

// ============ Holdings ============
export async function getHoldings(): Promise<Holding[]> {
  const r = await notion.dataSources.query({ data_source_id: DB.HOLDINGS, sorts: [{ property: 'StockId', direction: 'ascending' }] });
  return r.results.map((p) => {
    const pg = p as Record<string, unknown>;
    return {
      id: id(pg), stockId: getRich(pg, 'StockId'), stockName: getTitle(pg),
      shares: getNum(pg, 'Shares'), avgCost: getNum(pg, 'AvgCost'),
      buyDate: getDate(pg, 'BuyDate'), notes: getRich(pg, 'Notes') || undefined,
    };
  });
}

export async function createHolding(h: Omit<Holding, 'id' | 'currentPrice'>): Promise<string> {
  const r = await notion.pages.create({
    parent: { data_source_id: DB.HOLDINGS },
    properties: {
      Name: { title: [{ text: { content: h.stockName } }] },
      StockId: { rich_text: [{ text: { content: h.stockId } }] },
      Shares: { number: h.shares },
      AvgCost: { number: h.avgCost },
      BuyDate: { date: { start: h.buyDate } },
      Notes: { rich_text: [{ text: { content: h.notes || '' } }] },
    },
  } as Parameters<typeof notion.pages.create>[0]);
  return r.id;
}

export async function updateHolding(id: string, data: Partial<Holding>): Promise<void> {
  const props: Record<string, unknown> = {};
  if (data.stockName) props.Name = { title: [{ text: { content: data.stockName } }] };
  if (data.shares !== undefined) props.Shares = { number: data.shares };
  if (data.avgCost !== undefined) props.AvgCost = { number: data.avgCost };
  await notion.pages.update({ page_id: id, properties: props } as Parameters<typeof notion.pages.update>[0]);
}

export async function deleteHolding(id: string): Promise<void> {
  await notion.pages.update({ page_id: id, archived: true } as Parameters<typeof notion.pages.update>[0]);
}

// ============ Ex-Dividend ============
export async function getExDividends(): Promise<ExDividend[]> {
  const r = await notion.dataSources.query({ data_source_id: DB.EX_DIVIDEND, sorts: [{ property: 'ExDate', direction: 'descending' }] });
  return r.results.map((p) => {
    const pg = p as Record<string, unknown>;
    return {
      id: id(pg), stockId: getRich(pg, 'StockId'), stockName: getTitle(pg),
      exDate: getDate(pg, 'ExDate'), cashDividend: getNum(pg, 'CashDividend'),
      stockDividend: getNum(pg, 'StockDividend'), deductFromCost: getBool(pg, 'DeductFromCost'),
      source: getRich(pg, 'Source'),
    };
  });
}

export async function createExDividend(e: Omit<ExDividend, 'id'>): Promise<string> {
  const r = await notion.pages.create({
    parent: { data_source_id: DB.EX_DIVIDEND },
    properties: {
      Name: { title: [{ text: { content: e.stockName } }] },
      StockId: { rich_text: [{ text: { content: e.stockId } }] },
      ExDate: { date: { start: e.exDate } },
      CashDividend: { number: e.cashDividend },
      StockDividend: { number: e.stockDividend },
      DeductFromCost: { checkbox: e.deductFromCost },
      Source: { rich_text: [{ text: { content: e.source } }] },
    },
  } as Parameters<typeof notion.pages.create>[0]);
  return r.id;
}

export async function toggleDeductFromCost(id: string, value: boolean): Promise<void> {
  await notion.pages.update({ page_id: id, properties: { DeductFromCost: { checkbox: value } } } as Parameters<typeof notion.pages.update>[0]);
}

// ============ Lending ============
export async function getLendings(): Promise<Lending[]> {
  const r = await notion.dataSources.query({ data_source_id: DB.LENDING });
  return r.results.map((p) => {
    const pg = p as Record<string, unknown>;
    return {
      id: id(pg), stockId: getRich(pg, 'StockId'), stockName: getTitle(pg),
      sharesLent: getNum(pg, 'SharesLent'), startDate: getDate(pg, 'StartDate'),
      endDate: getDate(pg, 'EndDate') || undefined, annualRate: getNum(pg, 'AnnualRate'),
      accruedInterest: getNum(pg, 'AccruedInterest'), isActive: getBool(pg, 'IsActive'),
    };
  });
}

export async function createLending(l: Omit<Lending, 'id'>): Promise<string> {
  const r = await notion.pages.create({
    parent: { data_source_id: DB.LENDING },
    properties: {
      Name: { title: [{ text: { content: l.stockName } }] },
      StockId: { rich_text: [{ text: { content: l.stockId } }] },
      SharesLent: { number: l.sharesLent },
      StartDate: { date: { start: l.startDate } },
      AnnualRate: { number: l.annualRate },
      AccruedInterest: { number: 0 },
      IsActive: { checkbox: true },
    },
  } as Parameters<typeof notion.pages.create>[0]);
  return r.id;
}

export async function returnLending(id: string, endDate: string, totalInterest: number): Promise<void> {
  await notion.pages.update({
    page_id: id,
    properties: {
      EndDate: { date: { start: endDate } },
      AccruedInterest: { number: totalInterest },
      IsActive: { checkbox: false },
    },
  } as Parameters<typeof notion.pages.update>[0]);
}

export async function updateLendingInterest(id: string, interest: number): Promise<void> {
  await notion.pages.update({ page_id: id, properties: { AccruedInterest: { number: interest } } } as Parameters<typeof notion.pages.update>[0]);
}

// ============ News ============
export async function getNews(stockId?: string, limit = 50): Promise<NewsDigest[]> {
  const filter = stockId ? { property: 'StockId', rich_text: { equals: stockId } } : undefined;
  const r = await notion.dataSources.query({
    data_source_id: DB.NEWS,
    filter,
    sorts: [{ property: 'Date', direction: 'descending' }],
    page_size: limit,
  } as Parameters<typeof notion.dataSources.query>[0]);
  return r.results.map((p) => {
    const pg = p as Record<string, unknown>;
    return {
      id: id(pg), stockId: getRich(pg, 'StockId'), stockName: getTitle(pg),
      date: getDate(pg, 'Date'), title: getRich(pg, 'Title'),
      summary: getRich(pg, 'Summary'), sentiment: getSelect(pg, 'Sentiment') as 'bullish' | 'bearish' | 'neutral',
      source: getRich(pg, 'Source'), originalUrl: getRich(pg, 'OriginalUrl') || undefined,
    };
  });
}

export async function createNews(n: Omit<NewsDigest, 'id'>): Promise<string> {
  const r = await notion.pages.create({
    parent: { data_source_id: DB.NEWS },
    properties: {
      Name: { title: [{ text: { content: n.stockName } }] },
      StockId: { rich_text: [{ text: { content: n.stockId } }] },
      Date: { date: { start: n.date } },
      Title: { rich_text: [{ text: { content: n.title } }] },
      Summary: { rich_text: [{ text: { content: n.summary } }] },
      Sentiment: { select: { name: n.sentiment } },
      Source: { rich_text: [{ text: { content: n.source } }] },
      OriginalUrl: { rich_text: [{ text: { content: n.originalUrl || '' } }] },
    },
  } as Parameters<typeof notion.pages.create>[0]);
  return r.id;
}

// ============ Public Info ============
export async function getPublicInfos(limit = 30): Promise<PublicInfo[]> {
  const r = await notion.dataSources.query({
    data_source_id: DB.PUBLIC_INFO,
    sorts: [{ property: 'Date', direction: 'descending' }],
    page_size: limit,
  });
  return r.results.map((p) => {
    const pg = p as Record<string, unknown>;
    return {
      id: id(pg), stockId: getRich(pg, 'StockId'), stockName: getTitle(pg),
      date: getDate(pg, 'Date'), title: getRich(pg, 'Title'),
      summary: getRich(pg, 'Summary'), type: getSelect(pg, 'Type') as PublicInfo['type'],
      isImportant: getBool(pg, 'IsImportant'),
    };
  });
}

export async function createPublicInfo(info: Omit<PublicInfo, 'id'>): Promise<string> {
  const r = await notion.pages.create({
    parent: { data_source_id: DB.PUBLIC_INFO },
    properties: {
      Name: { title: [{ text: { content: info.stockName } }] },
      StockId: { rich_text: [{ text: { content: info.stockId } }] },
      Date: { date: { start: info.date } },
      Title: { rich_text: [{ text: { content: info.title } }] },
      Summary: { rich_text: [{ text: { content: info.summary } }] },
      Type: { select: { name: info.type } },
      IsImportant: { checkbox: info.isImportant },
    },
  } as Parameters<typeof notion.pages.create>[0]);
  return r.id;
}

// ============ Daily Report ============
export async function getDailyReports(limit = 30): Promise<DailyReport[]> {
  const r = await notion.dataSources.query({
    data_source_id: DB.DAILY_REPORT,
    sorts: [{ property: 'Date', direction: 'descending' }],
    page_size: limit,
  });
  return r.results.map((p) => {
    const pg = p as Record<string, unknown>;
    let snapshots = [];
    try { snapshots = JSON.parse(getRich(pg, 'Snapshots') || '[]'); } catch { snapshots = []; }
    return {
      id: id(pg), date: getDate(pg, 'Date'), totalValue: getNum(pg, 'TotalValue'),
      totalCost: getNum(pg, 'TotalCost'), dayChange: getNum(pg, 'DayChange'),
      dayChangePct: getNum(pg, 'DayChangePct'), content: getRich(pg, 'Content'),
      holdingSnapshots: snapshots,
    };
  });
}

export async function createDailyReport(report: Omit<DailyReport, 'id'>): Promise<string> {
  const r = await notion.pages.create({
    parent: { data_source_id: DB.DAILY_REPORT },
    properties: {
      Name: { title: [{ text: { content: `${report.date} 日報` } }] },
      Date: { date: { start: report.date } },
      TotalValue: { number: report.totalValue },
      TotalCost: { number: report.totalCost },
      DayChange: { number: report.dayChange },
      DayChangePct: { number: report.dayChangePct },
      Content: { rich_text: [{ text: { content: report.content.slice(0, 2000) } }] },
      Snapshots: { rich_text: [{ text: { content: JSON.stringify(report.holdingSnapshots).slice(0, 2000) } }] },
    },
  } as Parameters<typeof notion.pages.create>[0]);
  return r.id;
}
