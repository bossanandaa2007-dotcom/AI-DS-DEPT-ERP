/**
 * Short-lived, in-memory cache for the repository loaders behind `useAsyncResource`.
 *
 * Every page reloads its full dataset on mount, so revisiting a page seconds after leaving it
 * re-ran every query from scratch — and several pages (Timetable, Attendance, Subject Allocation,
 * Academic Setup, User Management) all call the same `academicRepository.loadAcademicData()`,
 * so switching between them re-fetched near-identical tables every time. A short TTL turns a
 * revisit within that window into an instant, cache-served render, while an explicit "Refresh"
 * action (or any post-mutation `reload()`) still always goes to the network.
 */

interface CacheRecord<T> {
  data?: T
  promise?: Promise<T>
  timestamp: number
}

const CACHE_TTL_MS = 20_000
const cache = new Map<string, CacheRecord<unknown>>()

function freshData<T>(record: CacheRecord<T> | undefined): T | undefined {
  if (record?.data === undefined) return undefined
  return Date.now() - record.timestamp < CACHE_TTL_MS ? record.data : undefined
}

/** Synchronous read for a still-fresh, already-resolved value — used to skip the loading state entirely. */
export function readFreshCache<T>(key: string): T | undefined {
  return freshData(cache.get(key) as CacheRecord<T> | undefined)
}

/** Resolves from cache when fresh, joins an in-flight request when one exists, otherwise runs `loader`. */
export function fetchWithCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const record = cache.get(key) as CacheRecord<T> | undefined
  const fresh = freshData(record)
  if (fresh !== undefined) return Promise.resolve(fresh)
  if (record?.promise) return record.promise
  const promise = (async () => {
    try {
      const data = await loader()
      cache.set(key, { data, timestamp: Date.now() })
      return data
    } catch (error) {
      cache.delete(key)
      throw error
    }
  })()
  cache.set(key, { promise, timestamp: Date.now() })
  return promise
}

export function invalidateCache(key: string) {
  cache.delete(key)
}

/** Called on login/logout so one session's data can never be served to the next in the same tab. */
export function clearAllCaches() {
  cache.clear()
}
