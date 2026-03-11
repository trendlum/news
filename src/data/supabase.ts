const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function getEnv(name: string): string {
  const env = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return (env?.[name] || '').trim();
}

export function getSupabaseUrl(): string {
  return getEnv('SUPABASE_URL').replace(/\/+$/, '');
}

export function getSupabaseKey(): string {
  return getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_ANON_KEY') || getEnv('SUPABASE_KEY');
}

export async function fetchSupabaseRows<T>(cacheKey: string, path: string): Promise<T[]> {
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T[];

  const pending = inFlight.get(cacheKey);
  if (pending) return pending as Promise<T[]>;

  const task = (async () => {
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseKey();
    if (!supabaseUrl || !supabaseKey) return [];

    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase fetch failed with HTTP ${response.status} for ${path}`);
    }

    const rows = (await response.json()) as T[];
    const value = Array.isArray(rows) ? rows : [];
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  })().finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, task);
  return task;
}
