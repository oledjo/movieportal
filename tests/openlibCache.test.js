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

async function loadOpenLib(data, rawValue) {
  vi.resetModules()
  vi.stubGlobal('localStorage', storage)
  localStorage.clear()
  if (rawValue !== undefined) localStorage.setItem('openlib_books_cache', rawValue)
  else if (data !== undefined) localStorage.setItem('openlib_books_cache', JSON.stringify(data))
  vi.stubGlobal('fetch', vi.fn())
  return import('../src/services/openlib.js')
}

afterEach(() => {
  storage.clear()
  vi.unstubAllGlobals()
})

describe('book artwork cache', () => {
  it('maps valid cached results without fetching', async () => {
    const cached = { coverId: 42, title: 'Cached Book' }
    const openlib = await loadOpenLib({
      version: 2,
      expiry: future(),
      data: { 'Cached Book-Author': cached }
    })

    expect(openlib.hasOpenLibCache()).toBe(true)
    expect(openlib.getCachedBookResults([
      { id: 'b1', title: 'Cached Book', author: 'Author' }
    ])).toEqual(new Map([['b1', cached]]))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns null for an uncached book without fetching', async () => {
    const openlib = await loadOpenLib({ version: 2, expiry: future(), data: {} })
    expect(openlib.getCachedBookResults([{ id: 'b1', title: 'New Book' }]))
      .toEqual(new Map([['b1', null]]))
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed JSON', undefined, '{broken'],
    ['wrong version', { version: 99, expiry: future(), data: {} }, undefined],
    ['expired data', { version: 2, expiry: Date.now() - 1, data: {} }, undefined],
    ['missing expiry', { version: 2, data: {} }, undefined],
    ['missing data object', { version: 2, expiry: future() }, undefined],
    ['incomplete batch', { version: 2, expiry: future(), complete: false, data: {} }, undefined]
  ])('rejects %s', async (_name, data, rawValue) => {
    const openlib = await loadOpenLib(data, rawValue)
    expect(openlib.hasOpenLibCache()).toBe(false)
    expect(localStorage.getItem('openlib_books_cache')).toBeNull()
  })

  it('updates availability when saving and clearing', async () => {
    const openlib = await loadOpenLib()
    openlib.saveCacheToStorage({ complete: false })
    expect(openlib.hasOpenLibCache()).toBe(false)
    openlib.saveCacheToStorage()
    expect(openlib.hasOpenLibCache()).toBe(true)
    openlib.clearOpenLibCache()
    expect(openlib.hasOpenLibCache()).toBe(false)
  })
})
