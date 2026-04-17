import { NextRequest, NextResponse } from 'next/server';
import { getMultipleStockPrices } from '@/lib/twse';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
  if (ids.length === 0) return NextResponse.json({});
  try {
    const prices = await getMultipleStockPrices(ids);
    return NextResponse.json(prices);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
