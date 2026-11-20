// Client-side lightweight cache with in-memory & sessionStorage persistence
// and in-flight Promise deduplication.
// Dramatically reduces network requests across ServiceNow workspace navigation.

const memoryCache = new Map<string, { data: any; expires: number }>();
const inFlightRequests = new Map<string, Promise<any>>();

export async function cachedFetch<T = any>(
  url: string,
  options?: { ttlMs?: number; forceRefresh?: boolean }
): Promise<T | null> {
  const ttlMs = options?.ttlMs ?? 180000; // 3 minutes default
  const now = Date.now();

  // 1. Check in-memory cache
  if (!options?.forceRefresh) {
    const memHit = memoryCache.get(url);
    if (memHit && memHit.expires > now) {
      return memHit.data as T;
    }

    // 2. Check sessionStorage
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        const item = sessionStorage.getItem(`fc_cache_${url}`);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed && parsed.expires > now) {
            memoryCache.set(url, { data: parsed.data, expires: parsed.expires });
            return parsed.data as T;
          }
        }
      } catch {
        // ignore sessionStorage errors
      }
    }
  }

  // 3. Deduplicate in-flight requests
  if (inFlightRequests.has(url)) {
    return inFlightRequests.get(url);
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      if (json && json.success) {
        const expires = Date.now() + ttlMs;
        memoryCache.set(url, { data: json, expires });
        if (typeof window !== "undefined" && window.sessionStorage) {
          try {
            sessionStorage.setItem(`fc_cache_${url}`, JSON.stringify({ data: json, expires }));
          } catch {
            // ignore
          }
        }
      }
      return json as T;
    } catch {
      return null;
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, fetchPromise);
  return fetchPromise;
}

export function clearClientCache(pattern?: string) {
  if (!pattern) {
    memoryCache.clear();
    if (typeof window !== "undefined" && window.sessionStorage) {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith("fc_cache_")) sessionStorage.removeItem(key);
      });
    }
    return;
  }

  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) memoryCache.delete(key);
  }
  if (typeof window !== "undefined" && window.sessionStorage) {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith("fc_cache_") && key.includes(pattern)) {
        sessionStorage.removeItem(key);
      }
    });
  }
}
