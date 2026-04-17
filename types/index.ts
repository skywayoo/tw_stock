// ============ Holdings ============
export interface Holding {
  id: string;
  stockId: string;       // e.g. "2330"
  stockName: string;     // e.g. "台積電"
  shares: number;        // 張數 (1張=1000股)
  avgCost: number;       // 平均成本(元/股)
  buyDate: string;       // ISO date
  notes?: string;
  currentPrice?: number; // populated at runtime, not stored
}

// ============ Ex-Dividend ============
export interface ExDividend {
  id: string;
  stockId: string;
  stockName: string;
  exDate: string;        // 除息/除權日
  cashDividend: number;  // 現金股利(元/股)
  stockDividend: number; // 股票股利(元/股)
  deductFromCost: boolean; // 是否從成本扣除
  source: string;        // 資料來源說明
}

// ============ Lending ============
export interface Lending {
  id: string;
  stockId: string;
  stockName: string;
  sharesLent: number;    // 借出張數
  startDate: string;
  endDate?: string;      // 還券日
  annualRate: number;    // 年利率 %
  accruedInterest: number; // 累積利息(元)
  isActive: boolean;
}

// ============ News ============
export type Sentiment = 'bullish' | 'bearish' | 'neutral';

export interface NewsDigest {
  id: string;
  stockId: string;
  stockName: string;
  date: string;          // ISO datetime
  title: string;
  summary: string;       // AI 摘要（短）
  sentiment: Sentiment;
  source: string;
  originalUrl?: string;
}

// ============ Public Info ============
export type PublicInfoType = 'ex-dividend' | 'rights-offering' | 'capital-increase' | 'announcement' | 'other';

export interface PublicInfo {
  id: string;
  stockId: string;
  stockName: string;
  date: string;
  title: string;
  summary: string;
  type: PublicInfoType;
  isImportant: boolean;
}

// ============ Daily Report ============
export interface DailyReport {
  id: string;
  date: string;
  totalValue: number;    // 今日總市值
  totalCost: number;     // 總成本
  dayChange: number;     // 今日損益
  dayChangePct: number;  // 今日漲跌%
  content: string;       // AI 生成的文字報告
  holdingSnapshots: HoldingSnapshot[];
}

export interface HoldingSnapshot {
  stockId: string;
  stockName: string;
  shares: number;
  closePrice: number;
  prevClosePrice: number;
  value: number;
  change: number;
  changePct: number;
}

// ============ Realized P&L ============
export interface RealizedPnl {
  id: string;
  stockId: string;
  stockName: string;
  shares: number;        // 張數
  buyPrice: number;      // 買入均價(元/股)
  sellPrice: number;     // 賣出均價(元/股)
  sellDate: string;      // ISO date
  dividendDeducted: number; // 已扣除股利(元/股)
  lendingInterest: number;  // 借券利息收入(元，總額)
  notes?: string;
}
