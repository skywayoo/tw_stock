import { NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const env = process.env.VERCEL_ENV ?? 'development';
  const url = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'localhost:3000';
  await sendTelegram(`🟢 台股助手已上線\n環境：${env}\n網址：${url}`);
  return NextResponse.json({ ok: true });
}
