export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.VERCEL_ENV) {
    const { sendTelegram } = await import('@/lib/telegram');
    const url = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
    await sendTelegram(`🟢 台股助手已上線\n環境：${process.env.VERCEL_ENV}\n${url}`).catch(() => {});
  }
}
