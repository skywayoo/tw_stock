// Taiwan Stock Exchange (TWSE) free API wrapper

export interface StockPrice {
  stockId: string;
  stockName: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  timestamp: string;
  isTrading: boolean;
}

// TWSE real-time API
export async function getStockPrice(stockId: string): Promise<StockPrice | null> {
  try {
    // Try listed stocks (上市) first
    const res = await fetch(
      `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${stockId}.tw&json=1&delay=0`,
      { cache: 'no-store' }
    );
    const data = await res.json() as { msgArray?: Record<string, string>[] };
    const item = data.msgArray?.[0];
    if (item && item.z && item.z !== '-') {
      return parseStockInfo(stockId, item);
    }

    // Try OTC (上櫃)
    const res2 = await fetch(
      `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_${stockId}.tw&json=1&delay=0`,
      { cache: 'no-store' }
    );
    const data2 = await res2.json() as { msgArray?: Record<string, string>[] };
    const item2 = data2.msgArray?.[0];
    if (item2 && item2.z && item2.z !== '-') {
      return parseStockInfo(stockId, item2);
    }

    return null;
  } catch {
    return null;
  }
}

function parseStockInfo(stockId: string, item: Record<string, string>): StockPrice {
  const price = parseFloat(item.z) || parseFloat(item.y) || 0;
  const prevClose = parseFloat(item.y) || 0;
  const change = price - prevClose;
  return {
    stockId,
    stockName: item.n || stockId,
    price,
    change: Math.round(change * 100) / 100,
    changePct: prevClose > 0 ? Math.round((change / prevClose) * 10000) / 100 : 0,
    high: parseFloat(item.h) || 0,
    low: parseFloat(item.l) || 0,
    open: parseFloat(item.o) || 0,
    volume: parseInt(item.v) || 0,
    timestamp: item.t || new Date().toTimeString().slice(0, 5),
    isTrading: !!item.z && item.z !== '-',
  };
}

export async function getMultipleStockPrices(stockIds: string[]): Promise<Record<string, StockPrice>> {
  const results = await Promise.all(stockIds.map((id) => getStockPrice(id)));
  const map: Record<string, StockPrice> = {};
  results.forEach((r, i) => {
    if (r) map[stockIds[i]] = r;
  });
  return map;
}

export function isTradingHours(): boolean {
  const now = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const day = taipei.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = taipei.getHours();
  const m = taipei.getMinutes();
  const minutes = h * 60 + m;
  return minutes >= 9 * 60 && minutes <= 13 * 60 + 30;
}

// Get stock name from TWSE
export async function searchStock(query: string): Promise<{ id: string; name: string }[]> {
  try {
    const res = await fetch(
      `https://suggest.twse.com.tw/search?key=${encodeURIComponent(query)}&type=all`,
      { cache: 'no-store' }
    );
    const data = await res.json() as { data?: { no: string; name: string }[] };
    return (data.data || []).slice(0, 10).map((d) => ({ id: d.no, name: d.name }));
  } catch {
    return [];
  }
}
