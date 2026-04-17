import { NextRequest, NextResponse } from 'next/server';
import { getPublicInfos, createPublicInfo } from '@/lib/notion';

export async function GET() {
  return NextResponse.json(await getPublicInfos());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = await createPublicInfo(body);
  return NextResponse.json({ id }, { status: 201 });
}
