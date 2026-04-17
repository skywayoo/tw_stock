import { NextRequest, NextResponse } from 'next/server';
import { getDailyReports, createDailyReport } from '@/lib/notion';

export async function GET() {
  return NextResponse.json(await getDailyReports());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = await createDailyReport(body);
  return NextResponse.json({ id }, { status: 201 });
}
