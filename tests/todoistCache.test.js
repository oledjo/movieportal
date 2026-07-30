import { describe, expect, it, vi } from 'vitest'
import {
  clearTodoistCaches,
  loadTodoistResources,
  readTodoistCache,
  writeTodoistCache
} from '../src/services/todoistCache.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: vi.fn(key => values.has(key) ? values.get(key) : null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    removeItem: vi.fn(key => values.delete(key))
  }
}

describe('Todoist resource cache', () => {
  it('restores a valid empty list without fetching', async () => {
    const storage = createStorage()
    writeTodoistCache('movies', [], storage)
    const fetcher = vi.fn()

    const result = await loadTodoistResources('movies', fetcher, { storage })

    expect(result).toEqual({ items: [], source: 'cache' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fetches and stores resources when cache is missing', async () => {
    const storage = createStorage()
    const fetcher = vi.fn().mockResolvedValue([{ id: 'movie-1' }])

    const result = await loadTodoistResources('movies', fetcher, { storage })

    expect(result).toEqual({ items: [{ id: 'movie-1' }], source: 'network' })
    expect(readTodoistCache('movies', storage)).toEqual({ found: true, items: [{ id: 'movie-1' }] })
  })

  it('removes malformed cache data and fetches once', async () => {
    const storage = createStorage({ todoist_movies_cache: '{broken' })
    const fetcher = vi.fn().mockResolvedValue([])

    await loadTodoistResources('movies', fetcher, { storage })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(storage.removeItem).toHaveBeenCalledWith('todoist_movies_cache')
  })

  it('force refreshes only the requested mode', async () => {
    const storage = createStorage()
    writeTodoistCache('movies', [{ id: 'old' }], storage)
    writeTodoistCache('books', [{ id: 'book-1' }], storage)

    await loadTodoistResources(
      'movies',
      vi.fn().mockResolvedValue([{ id: 'new' }]),
      { forceRefresh: true, storage }
    )

    expect(readTodoistCache('movies', storage).items).toEqual([{ id: 'new' }])
    expect(readTodoistCache('books', storage).items).toEqual([{ id: 'book-1' }])
  })

  it('preserves an existing cache when refresh fails', async () => {
    const storage = createStorage()
    writeTodoistCache('movies', [{ id: 'old' }], storage)

    await expect(loadTodoistResources(
      'movies',
      vi.fn().mockRejectedValue(new Error('offline')),
      { forceRefresh: true, storage }
    )).rejects.toThrow('offline')

    expect(readTodoistCache('movies', storage).items).toEqual([{ id: 'old' }])
  })

  it('clears both resource caches', () => {
    const storage = createStorage()
    clearTodoistCaches(storage)
    expect(storage.removeItem).toHaveBeenCalledWith('todoist_movies_cache')
    expect(storage.removeItem).toHaveBeenCalledWith('todoist_books_cache')
  })
})
