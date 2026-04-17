'use client';
import useSWR from 'swr';
import { Holding, ExDividend, Lending, NewsDigest, PublicInfo, DailyReport, RealizedPnl } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useHoldings() {
  const { data, error, isLoading, mutate } = useSWR<Holding[]>('/api/notion/holdings', fetcher);
  return { holdings: data ?? [], isLoading, error, mutate };
}

export function useExDividends() {
  const { data, error, isLoading, mutate } = useSWR<ExDividend[]>('/api/notion/ex-dividend', fetcher);
  return { exDividends: data ?? [], isLoading, error, mutate };
}

export function useLendings() {
  const { data, error, isLoading, mutate } = useSWR<Lending[]>('/api/notion/lending', fetcher);
  return { lendings: data ?? [], isLoading, error, mutate };
}

export function useNews(stockId?: string) {
  const url = stockId ? `/api/notion/news?stockId=${stockId}` : '/api/notion/news';
  const { data, error, isLoading, mutate } = useSWR<NewsDigest[]>(url, fetcher);
  return { news: data ?? [], isLoading, error, mutate };
}

export function usePublicInfos() {
  const { data, error, isLoading, mutate } = useSWR<PublicInfo[]>('/api/notion/public-info', fetcher);
  return { publicInfos: data ?? [], isLoading, error, mutate };
}

export function useDailyReports() {
  const { data, isLoading, mutate } = useSWR<DailyReport[]>('/api/notion/daily-report', fetcher);
  return { reports: data ?? [], isLoading, mutate };
}

export function useRealizedPnls() {
  const { data, error, isLoading, mutate } = useSWR<RealizedPnl[]>('/api/notion/realized', fetcher);
  return { realizedPnls: data ?? [], isLoading, error, mutate };
}

export function useStockPrices(stockIds: string[]) {
  const key = stockIds.length > 0 ? `/api/stock/price?ids=${stockIds.join(',')}` : null;
  const { data, mutate } = useSWR<Record<string, { price: number; change: number; changePct: number; isTrading: boolean }>>(
    key, fetcher, { refreshInterval: 60_000 } // poll every minute
  );
  return { prices: data ?? {}, mutate };
}
