// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const future = () => Date.now() + 60_000
const storage = createLocalStorage()

function createLocalStorage() {
  const values = new Map()
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear()
  }
}

async function loadTmdb(data, rawValue) {
  vi.resetModules()
  vi.stubGlobal('localStorage', storage)
  localStorage.clear()
  if (rawValue !== undefined) localStorage.setItem('tmdb_posters_cache', rawValue)
  else if (data !== undefined) localStorage.setItem('tmdb_posters_cache', JSON.stringify(data))
  vi.stubGlobal('fetch', vi.fn())
  return import('../src/services/tmdb.js')
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  storage.clear()
  vi.unstubAllGlobals()
})

describe('TMDB artwork cache', () => {
  it('maps valid cached movie and series results without fetching', async () => {
    const movieResult = { id: 10, posterPath: '/movie.jpg' }
    const seriesResult = { id: 20, posterPath: '/series.jpg', isTV: true }
    const tmdb = await loadTmdb({
      version: 1,
      expiry: future(),
      data: {
        'Movie-2024-false': movieResult,
        'Series-null-false': null,
        'Series-null-true': seriesResult
      }
    })

    const result = tmdb.getCachedMovieResults([
      { id: 'm1', title: 'Movie', year: 2024, isSeries: false },
      { id: 'm2', title: 'Series', year: null, isSeries: true }
    ])

    expect(tmdb.hasTmdbCache()).toBe(true)
    expect(result).toEqual(new Map([['m1', movieResult], ['m2', seriesResult]]))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns null for a missing item without fetching', async () => {
    const tmdb = await loadTmdb({ version: 1, expiry: future(), data: {} })
    expect(tmdb.getCachedMovieResults([{ id: 'm1', title: 'New', year: null }]))
      .toEqual(new Map([['m1', null]]))
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed JSON', undefined, '{broken'],
    ['wrong version', { version: 99, expiry: future(), data: {} }, undefined],
    ['expired data', { version: 1, expiry: Date.now() - 1, data: {} }, undefined],
    ['missing expiry', { version: 1, data: {} }, undefined],
    ['missing data object', { version: 1, expiry: future() }, undefined],
    ['incomplete batch', { version: 1, expiry: future(), complete: false, data: {} }, undefined]
  ])('rejects %s', async (_name, data, rawValue) => {
    const tmdb = await loadTmdb(data, rawValue)
    expect(tmdb.hasTmdbCache()).toBe(false)
    expect(localStorage.getItem('tmdb_posters_cache')).toBeNull()
  })

  it('updates availability when saving and clearing', async () => {
    const tmdb = await loadTmdb()
    expect(tmdb.hasTmdbCache()).toBe(false)
    tmdb.saveCacheToStorage({ complete: false })
    expect(tmdb.hasTmdbCache()).toBe(false)
    tmdb.saveCacheToStorage()
    expect(tmdb.hasTmdbCache()).toBe(true)
    tmdb.clearTmdbCache()
    expect(tmdb.hasTmdbCache()).toBe(false)
  })

  it('persists debounced search progress as incomplete until the final batch save', async () => {
    vi.useFakeTimers()
    const tmdb = await loadTmdb()
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    })

    await tmdb.searchMovie('Missing Movie', 'key')

    expect(localStorage.getItem('tmdb_posters_cache')).toBeNull()
    expect(tmdb.hasTmdbCache()).toBe(false)

    await vi.advanceTimersByTimeAsync(1000)

    const partial = JSON.parse(localStorage.getItem('tmdb_posters_cache'))
    expect(partial.complete).toBe(false)
    expect(partial.data['Missing Movie-null-false']).toBeNull()
    expect(tmdb.hasTmdbCache()).toBe(false)

    await tmdb.batchSearchMovies([], 'key')

    const complete = JSON.parse(localStorage.getItem('tmdb_posters_cache'))
    expect(complete.complete).toBe(true)
    expect(tmdb.hasTmdbCache()).toBe(true)
  })

  it('removes persisted cache and readiness after a quota failure', async () => {
    const tmdb = await loadTmdb()
    await tmdb.batchSearchMovies([], '')
    expect(JSON.parse(localStorage.getItem('tmdb_posters_cache')).complete).toBe(true)
    expect(tmdb.hasTmdbCache()).toBe(true)

    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    tmdb.saveCacheToStorage()

    expect(localStorage.getItem('tmdb_posters_cache')).toBeNull()
    expect(tmdb.hasTmdbCache()).toBe(false)
  })
})
