export interface HttpConfig {
  primaryProxy: string;
  fallbackProxy: string;
}

export const HTTP_CONFIG: HttpConfig = {
  primaryProxy: 'https://situation-monitor-proxy.seanthielen-e.workers.dev/?url=',
  fallbackProxy: 'https://corsproxy.io/?url='
};

export const DEFAULT_TIMEOUT_MS = 15000;

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache'
};

function withTimeout(signalTimeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), signalTimeoutMs);
  return controller;
}

async function fetchDirect(rawUrl: string, signal: AbortSignal): Promise<Response> {
  return fetch(rawUrl, {
    signal,
    redirect: 'follow',
    headers: DEFAULT_HEADERS
  });
}

export async function fetchWithProxy(
  rawUrl: string,
  options?: { useProxy?: boolean; timeoutMs?: number }
): Promise<Response> {
  const useProxy = options?.useProxy ?? true;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = withTimeout(timeoutMs);
  const encoded = encodeURIComponent(rawUrl);

  try {
    const direct = await fetchDirect(rawUrl, controller.signal);
    if (direct.ok || !useProxy) return direct;
  } catch {
    if (!useProxy) throw new Error(`Direct fetch failed for ${rawUrl}`);
  }

  try {
    const primary = await fetch(HTTP_CONFIG.primaryProxy + encoded, {
      signal: controller.signal,
      headers: DEFAULT_HEADERS
    });
    if (primary.ok) return primary;
  } catch {
    // Continue to fallback
  }

  return fetch(HTTP_CONFIG.fallbackProxy + encoded, {
    signal: controller.signal,
    headers: DEFAULT_HEADERS
  });
}

export async function fetchTextWithProxy(
  rawUrl: string,
  options?: { useProxy?: boolean; timeoutMs?: number }
): Promise<string> {
  const response = await fetchWithProxy(rawUrl, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}
