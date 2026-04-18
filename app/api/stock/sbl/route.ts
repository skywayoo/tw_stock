import { NextRequest, NextResponse } from 'next/server';
import { memGet, memSet } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

// Two cache keys: current result (1h) and prev snapshot (2h) for delta
const KEY_CURRENT = 'sbl:current';
const KEY_PREV = 'sbl:prev';
const TTL_CURRENT = 60 * 60 * 1000;      // 1 hour
const TTL_PREV    = 2 * 60 * 60 * 1000;  // 2 hours (outlives current, used as delta reference)

interface SBLEntry { stkno: string; brkid: string; avishr: string }
export interface SBLData { value: number | null; delta: number | null }

async function fetchAllSBL(): Promise<Record<string, number>> {
  const res = await fetch(
    `https://mis.twse.com.tw/stock/api/getStockSblsBrk.jsp?_=${Date.now()}&lang=zh_tw`,
    { cache: 'no-store', headers: { Referer: 'https://mis.twse.com.tw/' } }
  );
  if (!res.ok) throw new Error(`SBL fetch ${res.status}`);
  const data = await res.json() as { msgArray?: SBLEntry[][] };
  const rows: SBLEntry[] = data.msgArray?.[0] ?? [];
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.brkid === '9B00') {
      const v = parseInt(String(r.avishr).replace(/,/g, ''), 10);
      if (!isNaN(v)) map[r.stkno] = v;
    }
  }
  return map;
}

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
  if (ids.length === 0) return NextResponse.json({});

  let current = memGet<Record<string, number>>(KEY_CURRENT);

  if (!current) {
    // prev snapshot saved 1h ago still alive (TTL_PREV = 2h)
    const prev = memGet<Record<string, number>>(KEY_PREV);
    try {
      current = await fetchAllSBL();
    } catch {
      return NextResponse.json(Object.fromEntries(ids.map((id) => [id, { value: null, delta: null } as SBLData])));
    }
    // Save current as prev for next refresh, then store current
    if (prev) memSet(KEY_PREV, prev, TTL_PREV); // keep existing prev
    else       memSet(KEY_PREV, current, TTL_PREV); // first run: prev = current
    memSet(KEY_CURRENT, current, TTL_CURRENT);
  }

  const prev = memGet<Record<string, number>>(KEY_PREV) ?? {};
  const result: Record<string, SBLData> = {};
  for (const id of ids) {
    const value = current[id] ?? null;
    const prevVal = id in prev ? prev[id] : null;
    const delta = value !== null && prevVal !== null && value !== prevVal ? value - prevVal : null;
    result[id] = { value, delta };
  }
  return NextResponse.json(result);
}
