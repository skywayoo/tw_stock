import { NextRequest, NextResponse } from 'next/server';
import { memGet, memSet } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

const KEY_CURRENT = 'sbl:current';
const KEY_PREV    = 'sbl:prev';
const TTL_CURRENT = 60 * 60 * 1000;
const TTL_PREV    = 2 * 60 * 60 * 1000;

interface SBLEntry { stkno: string; brkid: string; avishr: string }

interface StockSBL {
  shares9B00: number; // 台新 9B00 可出借股數
  total: number;      // 所有券商合計可出借股數
}

export interface SBLData {
  value: number | null;      // 9B00 shares
  delta: number | null;      // change from prev fetch
  ratio: number | null;      // 9B00 / total (0–100)
  ratioDelta: number | null; // ratio change from prev fetch
}

async function fetchAllSBL(): Promise<Record<string, StockSBL>> {
  const res = await fetch(
    `https://mis.twse.com.tw/stock/api/getStockSblsBrk.jsp?_=${Date.now()}&lang=zh_tw`,
    { cache: 'no-store', headers: { Referer: 'https://mis.twse.com.tw/' } }
  );
  if (!res.ok) throw new Error(`SBL fetch ${res.status}`);
  const data = await res.json() as { msgArray?: SBLEntry[][] };
  const rows: SBLEntry[] = data.msgArray?.[0] ?? [];

  const map: Record<string, StockSBL> = {};
  for (const r of rows) {
    const v = parseInt(String(r.avishr).replace(/,/g, ''), 10);
    if (isNaN(v) || v < 0) continue;
    if (!map[r.stkno]) map[r.stkno] = { shares9B00: 0, total: 0 };
    map[r.stkno].total += v;
    if (r.brkid === '9B00') map[r.stkno].shares9B00 = v;
  }
  return map;
}

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
  if (ids.length === 0) return NextResponse.json({});

  let current = memGet<Record<string, StockSBL>>(KEY_CURRENT);

  if (!current) {
    const prev = memGet<Record<string, StockSBL>>(KEY_PREV);
    try {
      current = await fetchAllSBL();
    } catch {
      return NextResponse.json(Object.fromEntries(ids.map((id) => [id, { value: null, delta: null, ratio: null, ratioDelta: null } as SBLData])));
    }
    if (prev) memSet(KEY_PREV, prev, TTL_PREV);
    else      memSet(KEY_PREV, current, TTL_PREV);
    memSet(KEY_CURRENT, current, TTL_CURRENT);
  }

  const prev = memGet<Record<string, StockSBL>>(KEY_PREV) ?? {};
  const result: Record<string, SBLData> = {};

  for (const id of ids) {
    const cur = current[id] ?? null;
    const prv = prev[id] ?? null;

    const value = cur ? cur.shares9B00 : null;
    const prevValue = prv ? prv.shares9B00 : null;
    const delta = value !== null && prevValue !== null && value !== prevValue ? value - prevValue : null;

    const ratio = cur && cur.total > 0 ? Math.round((cur.shares9B00 / cur.total) * 1000) / 10 : null;
    const prevRatio = prv && prv.total > 0 ? Math.round((prv.shares9B00 / prv.total) * 1000) / 10 : null;
    const ratioDelta = ratio !== null && prevRatio !== null && ratio !== prevRatio
      ? Math.round((ratio - prevRatio) * 10) / 10
      : null;

    result[id] = { value, delta, ratio, ratioDelta };
  }
  return NextResponse.json(result);
}
