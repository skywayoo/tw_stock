import { NextRequest, NextResponse } from 'next/server';
import { getHoldings, createHolding, updateHolding, deleteHolding } from '@/lib/notion';
import { memGet, memSet, memDel } from '@/lib/server-cache';

const KEY = 'holdings_all';
const TTL = 60_000;

export async function GET() {
  const cached = memGet(KEY);
  if (cached) return NextResponse.json(cached);
  const data = await getHoldings();
  memSet(KEY, data, TTL);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = await createHolding(body);
  memDel(KEY);
  return NextResponse.json({ id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await updateHolding(id, data);
  memDel(KEY);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await deleteHolding(id);
  memDel(KEY);
  return NextResponse.json({ success: true });
}
