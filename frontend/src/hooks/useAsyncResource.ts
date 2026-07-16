import { useCallback, useEffect, useState } from 'react'

export interface AsyncResource<T> {
  data: T | null
  error: string | null
  isLoading: boolean
  reload: () => Promise<void>
}

/** Loads repository data without retaining stale values after a data-provider failure. */
export function useAsyncResource<T>(load: () => Promise<T>): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try { setData(await load()) } catch (reason) { setData(null); setError(reason instanceof Error ? reason.message : 'Unable to load data.') } finally { setIsLoading(false) }
  }, [load])
  useEffect(() => {
    let active = true
    void load()
      .then((result) => { if (active) { setData(result); setError(null) } })
      .catch((reason: unknown) => { if (active) { setData(null); setError(reason instanceof Error ? reason.message : 'Unable to load data.') } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [load])
  return { data, error, isLoading, reload }
}
