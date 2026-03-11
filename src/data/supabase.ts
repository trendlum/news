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

function getSupabaseHeaders(): Record<string, string> | null {
  const supabaseKey = getSupabaseKey();
  if (!supabaseKey) return null;

  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`
  };
}

export async function deleteSupabaseRows(path: string): Promise<void> {
  const supabaseUrl = getSupabaseUrl();
  const headers = getSupabaseHeaders();
  if (!supabaseUrl || !headers) return;

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: 'DELETE',
    headers
  });

  if (!response.ok) {
    throw new Error(`Supabase delete failed with HTTP ${response.status} for ${path}`);
  }
}

export async function patchSupabaseRows<T>(path: string, payload: T): Promise<void> {
  const supabaseUrl = getSupabaseUrl();
  const headers = getSupabaseHeaders();
  if (!supabaseUrl || !headers) return;

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Supabase patch failed with HTTP ${response.status} for ${path}${body ? ` :: ${body}` : ''}`);
  }
}

export async function upsertSupabaseRows<T>(table: string, rows: T[], onConflict: string): Promise<void> {
  await upsertSupabaseRowsReturning(table, rows, onConflict);
}

export async function upsertSupabaseRowsReturning<TInput, TOutput = TInput>(
  table: string,
  rows: TInput[],
  onConflict: string
): Promise<TOutput[]> {
  if (rows.length === 0) return [];

  const supabaseUrl = getSupabaseUrl();
  const headers = getSupabaseHeaders();
  if (!supabaseUrl || !headers) return [];

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    throw new Error(`Supabase upsert failed with HTTP ${response.status} for ${table}`);
  }

  const payload = (await response.json()) as TOutput[];
  return Array.isArray(payload) ? payload : [];
}
