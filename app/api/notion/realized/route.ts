import { NextRequest, NextResponse } from 'next/server';
import { getRealizedPnls, createRealizedPnl } from '@/lib/notion';

export async function GET() {
  const data = await getRealizedPnls();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = await createRealizedPnl(body);
  return NextResponse.json({ id });
}
