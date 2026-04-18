import { NextRequest, NextResponse } from 'next/server';
import { getLendings, createLending, returnLending, updateLendingInterest } from '@/lib/notion';

export async function GET() {
  return NextResponse.json(await getLendings());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = await createLending(body);
  return NextResponse.json({ id }, { status: 201 });
}

// Return lending
export async function PATCH(req: NextRequest) {
  const { id, action, endDate, totalInterest, accruedInterest, grossInterest, brokerFeeAmount, withholdingTax, netInterest } = await req.json();
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  if (action === 'return') {
    await returnLending(id, endDate, totalInterest, grossInterest, brokerFeeAmount, withholdingTax, netInterest);
  } else if (action === 'update_interest') {
    await updateLendingInterest(id, accruedInterest);
  }
  return NextResponse.json({ success: true });
}
