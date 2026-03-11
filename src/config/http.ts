export interface HttpConfig {
  primaryProxy: string;
  fallbackProxy: string;
}

export const HTTP_CONFIG: HttpConfig = {
  primaryProxy: 'https://situation-monitor-proxy.seanthielen-e.workers.dev/?url=',
  fallbackProxy: 'https://corsproxy.io/?url='
};

export const DEFAULT_TIMEOUT_MS = 15000;

function withTimeout(signalTimeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), signalTimeoutMs);
  return controller;
}

export async function fetchWithProxy(
  rawUrl: string,
  options?: { useProxy?: boolean; timeoutMs?: number }
): Promise<Response> {
  const useProxy = options?.useProxy ?? true;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = withTimeout(timeoutMs);
  const encoded = encodeURIComponent(rawUrl);

  if (!useProxy) {
    return fetch(rawUrl, { signal: controller.signal });
  }

  try {
    const primary = await fetch(HTTP_CONFIG.primaryProxy + encoded, { signal: controller.signal });
    if (primary.ok) return primary;
  } catch {
    // Continue to fallback
  }

  return fetch(HTTP_CONFIG.fallbackProxy + encoded, { signal: controller.signal });
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
