import { useCallback, useEffect, useState } from 'react'

import { fetchWithCache, invalidateCache, readFreshCache } from '@/lib/data-cache'

export interface AsyncResource<T> {
  data: T | null
  error: string | null
  isLoading: boolean
  reload: () => Promise<void>
}

/**
 * Loads repository data without retaining stale values after a data-provider failure.
 *
 * Pass `cacheKey` to let a fresh-enough previous result (from this page or another one reading
 * the same data) render instantly instead of re-querying on every mount. `reload()` always goes
 * to the network — it is what the explicit "Refresh" buttons and post-mutation reloads call.
 */
export function useAsyncResource<T>(load: () => Promise<T>, cacheKey?: string): AsyncResource<T> {
  const initialCached = cacheKey ? readFreshCache<T>(cacheKey) : undefined
  const [data, setData] = useState<T | null>(initialCached ?? null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(initialCached === undefined)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    if (cacheKey) invalidateCache(cacheKey)
    try { setData(await (cacheKey ? fetchWithCache(cacheKey, load) : load())) } catch (reason) { setData(null); setError(reason instanceof Error ? reason.message : 'Unable to load data.') } finally { setIsLoading(false) }
  }, [load, cacheKey])

  useEffect(() => {
    if (cacheKey && readFreshCache<T>(cacheKey) !== undefined) return
    let active = true
    void (cacheKey ? fetchWithCache(cacheKey, load) : load())
      .then((result) => { if (active) { setData(result); setError(null) } })
      .catch((reason: unknown) => { if (active) { setData(null); setError(reason instanceof Error ? reason.message : 'Unable to load data.') } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [load, cacheKey])

  return { data, error, isLoading, reload }
}
