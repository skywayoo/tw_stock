const store = new Map<string, { data: unknown; expires: number }>();

export function memGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { store.delete(key); return null; }
  return entry.data as T;
}

export function memSet<T>(key: string, data: T, ttlMs = 60_000): void {
  store.set(key, { data, expires: Date.now() + ttlMs });
}

export function memDel(key: string): void { store.delete(key); }
