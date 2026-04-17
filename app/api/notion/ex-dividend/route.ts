import { NextRequest, NextResponse } from 'next/server';
import { getExDividends, createExDividend, toggleDeductFromCost } from '@/lib/notion';

export async function GET() {
  return NextResponse.json(await getExDividends());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = await createExDividend(body);
  return NextResponse.json({ id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { id, deductFromCost } = await req.json();
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  await toggleDeductFromCost(id, deductFromCost);
  return NextResponse.json({ success: true });
}
