import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CRON_TASKS = new Set(['news', 'public-info', 'daily-report', 'night-analysis']);

export async function POST(req: Request) {
  const { task, secret } = await req.json().catch(() => ({}));
  if (!task || !CRON_TASKS.has(task)) {
    return NextResponse.json({ error: 'invalid task' }, { status: 400 });
  }
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const cronUrl = `${url.origin}/api/cron/${task}`;
  try {
    const res = await fetch(cronUrl, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ status: res.status, data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
