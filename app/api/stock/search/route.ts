import { NextRequest, NextResponse } from 'next/server';
import { searchStock } from '@/lib/twse';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const results = await searchStock(q);
  return NextResponse.json(results);
}
