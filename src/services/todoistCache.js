const CACHE_VERSION = 1
const CACHE_KEYS = {
  movies: 'todoist_movies_cache',
  books: 'todoist_books_cache'
}

function getStorage(storage) {
  return storage || globalThis.localStorage
}

function getCacheKey(mode) {
  const key = CACHE_KEYS[mode]
  if (!key) throw new Error(`Unsupported Todoist resource mode: ${mode}`)
  return key
}

export function readTodoistCache(mode, storage) {
  const target = getStorage(storage)
  const key = getCacheKey(mode)
  try {
    const raw = target.getItem(key)
    if (raw === null) return { found: false, items: [] }
    const parsed = JSON.parse(raw)
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.items)) {
      target.removeItem(key)
      return { found: false, items: [] }
    }
    return { found: true, items: parsed.items }
  } catch (error) {
    console.warn(`Failed to read ${mode} Todoist cache:`, error)
    try { target.removeItem(key) } catch {}
    return { found: false, items: [] }
  }
}

export function writeTodoistCache(mode, items, storage) {
  if (!Array.isArray(items)) return false
  try {
    getStorage(storage).setItem(
      getCacheKey(mode),
      JSON.stringify({ version: CACHE_VERSION, items })
    )
    return true
  } catch (error) {
    console.warn(`Failed to write ${mode} Todoist cache:`, error)
    return false
  }
}

export function clearTodoistCaches(storage) {
  const target = getStorage(storage)
  for (const key of Object.values(CACHE_KEYS)) {
    try { target.removeItem(key) } catch (error) {
      console.warn('Failed to clear Todoist cache:', error)
    }
  }
}

export async function loadTodoistResources(
  mode,
  fetcher,
  { forceRefresh = false, storage } = {}
) {
  if (!forceRefresh) {
    const cached = readTodoistCache(mode, storage)
    if (cached.found) return { items: cached.items, source: 'cache' }
  }
  const items = await fetcher()
  writeTodoistCache(mode, items, storage)
  return { items, source: 'network' }
}
