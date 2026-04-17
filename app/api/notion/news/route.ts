import { NextRequest, NextResponse } from 'next/server';
import { getNews, createNews } from '@/lib/notion';

export async function GET(req: NextRequest) {
  const stockId = req.nextUrl.searchParams.get('stockId') || undefined;
  return NextResponse.json(await getNews(stockId));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = await createNews(body);
  return NextResponse.json({ id }, { status: 201 });
}
