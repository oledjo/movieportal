# Manual Artwork Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hydrate movie and book artwork from valid browser caches on ordinary loads, automatically use artwork APIs only when no valid cache exists, and reserve subsequent updates for the existing Refresh button.

**Architecture:** Keep TMDB and Open Library as the only artwork cache owners. Each service tracks whether its persisted cache loaded successfully and exposes a cache-only task-ID resolver; `App.vue` selects cache-only hydration or the existing network batch without introducing a duplicate cache.

**Tech Stack:** Vue 3, JavaScript ES modules, localStorage, Vitest 2, Vue Test Utils, Vite 5.

## Global Constraints

- Keep the existing 30-day artwork cache expiry, cache keys, versions, matching rules, batch sizes, and real-network rate-limit delays.
- Cache-only reads must never call TMDB, Open Library, or Google Books, must not wait between batches, and must not save or extend cache expiry.
- A valid cache is authoritative even when a current Todoist item has no entry; return `null` artwork until Refresh.
- Debounced partial saves during a first/full batch must remain unavailable for cache-only page loads; only the final completed batch marks the cache ready. Existing persisted caches without the new readiness field remain valid for backward compatibility.
- Normal artwork work must remain non-blocking for the Todoist list.
- Manual Refresh must still refresh Todoist first, then clear and await the active full artwork batch.
- Do not add a second task-ID localStorage cache or change filters, scheduling, Todoist mutations, or card presentation.

---

### Task 1: Add TMDB cache availability and cache-only resolution

**Files:**
- Create: `tests/tmdbCache.test.js`
- Modify: `src/services/tmdb.js:29-140,619-699`

**Interfaces:**
- Consumes: existing TMDB cache key `${cleanTitle(title)}-${year}-${isTV}` and cached search-result objects.
- Produces: `hasTmdbCache(): boolean` and `getCachedMovieResults(movies: Array): Map`.

- [ ] **Step 1: Write failing tests for valid, missing, expired, and cleared TMDB caches**

Create `tests/tmdbCache.test.js` with a jsdom environment, reset the module registry before every dynamic import, and seed localStorage before importing the service:

```js
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const future = () => Date.now() + 60_000

async function loadTmdb(data, rawValue) {
  vi.resetModules()
  localStorage.clear()
  if (rawValue !== undefined) localStorage.setItem('tmdb_posters_cache', rawValue)
  else if (data !== undefined) localStorage.setItem('tmdb_posters_cache', JSON.stringify(data))
  vi.stubGlobal('fetch', vi.fn())
  return import('../src/services/tmdb.js')
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
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
})
```

- [ ] **Step 2: Run the TMDB tests and verify RED**

Run: `npm test -- tests/tmdbCache.test.js`

Expected: FAIL because `hasTmdbCache` and `getCachedMovieResults` are not exported.

- [ ] **Step 3: Track persisted-cache availability in `tmdb.js`**

Add state beside the existing cache and update every persistence boundary:

```js
const cache = new Map()
let cacheAvailable = false

export function hasTmdbCache() {
  return cacheAvailable
}
```

Use this validation inside `loadCacheFromStorage()` after parsing:

```js
const validData = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
const validExpiry = Number.isFinite(parsed.expiry) && parsed.expiry >= Date.now()
const complete = parsed.complete === undefined || parsed.complete === true
if (parsed.version !== CACHE_VERSION || !validExpiry || !validData || !complete) {
  localStorage.removeItem(CACHE_STORAGE_KEY)
  return
}

Object.entries(parsed.data).forEach(([key, value]) => cache.set(key, value))
cacheAvailable = true
```

Change the declaration to `export function saveCacheToStorage({ complete = true } = {})`. Add `complete,` between the existing `expiry` and `data` properties in `toStore`. Immediately after the existing successful `localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(toStore))` line, add `cacheAvailable = complete`. Leaving the option unspecified preserves completed-save behavior for the final batch and existing callers.

```js
export function clearTmdbCache() {
  cache.clear()
  cacheAvailable = false
  localStorage.removeItem(CACHE_STORAGE_KEY)
  console.log('TMDB cache cleared (memory + storage)')
}
```

Set `cacheAvailable = false` as well when the quota-error path removes localStorage. Parsing errors already remove storage and retain the initial false value. Change `debouncedSaveCache()` to call `saveCacheToStorage({ complete: false })`; keep the final `saveCacheToStorage()` at the end of `batchSearchMovies()` so only successful batch completion marks the cache available.

- [ ] **Step 4: Implement cache-only movie resolution**

Add a small key helper and resolver that never invokes `searchMovie()`:

```js
function getMovieCacheKey(title, year = null, isTV = false) {
  return `${cleanTitle(title)}-${year}-${isTV}`
}

export function getCachedMovieResults(movies) {
  const results = new Map()

  movies.forEach(movie => {
    const movieResult = cache.get(getMovieCacheKey(movie.title, movie.year, false)) || null
    const result = !movieResult && movie.isSeries
      ? cache.get(getMovieCacheKey(movie.title, movie.year, true)) || null
      : movieResult
    results.set(movie.id, result)
  })

  return results
}
```

Use `getMovieCacheKey()` inside `searchMovie()` too, so online and cache-only paths cannot drift.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- tests/tmdbCache.test.js`

Expected: all focused tests PASS and `fetch` remains unused in cache-only cases.

Run: `npm test`

Expected: all existing and new tests PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/services/tmdb.js tests/tmdbCache.test.js
git commit -m "Add cache-only TMDB artwork lookup"
```

---

### Task 2: Add Open Library cache availability and cache-only resolution

**Files:**
- Create: `tests/openlibCache.test.js`
- Modify: `src/services/openlib.js:6-105,216-292`

**Interfaces:**
- Consumes: existing translated book cache key `${translatedCleanTitle}-${author || ''}` and cached Open Library/Google Books result objects.
- Produces: `hasOpenLibCache(): boolean` and `getCachedBookResults(books: Array): Map`.

- [ ] **Step 1: Write failing tests for valid, missing, malformed, and cleared book caches**

Create `tests/openlibCache.test.js` using the same dynamic-import isolation:

```js
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const future = () => Date.now() + 60_000

async function loadOpenLib(data, rawValue) {
  vi.resetModules()
  localStorage.clear()
  if (rawValue !== undefined) localStorage.setItem('openlib_books_cache', rawValue)
  else if (data !== undefined) localStorage.setItem('openlib_books_cache', JSON.stringify(data))
  vi.stubGlobal('fetch', vi.fn())
  return import('../src/services/openlib.js')
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
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
```

- [ ] **Step 2: Run the Open Library tests and verify RED**

Run: `npm test -- tests/openlibCache.test.js`

Expected: FAIL because `hasOpenLibCache` and `getCachedBookResults` are not exported.

- [ ] **Step 3: Track persisted-cache availability in `openlib.js`**

Add the state and public availability function:

```js
const cache = new Map()
let cacheAvailable = false

export function hasOpenLibCache() {
  return cacheAvailable
}
```

Validate and load persisted data without changing the version or 30-day timestamp:

```js
const validData = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
const validExpiry = Number.isFinite(parsed.expiry) && parsed.expiry >= Date.now()
const complete = parsed.complete === undefined || parsed.complete === true
if (parsed.version !== CACHE_VERSION || !validExpiry || !validData || !complete) {
  localStorage.removeItem(CACHE_STORAGE_KEY)
  return
}

Object.entries(parsed.data).forEach(([key, value]) => cache.set(key, value))
cacheAvailable = true
```

Change the save signature to `saveCacheToStorage({ complete = true } = {})`, persist the `complete` field beside `version`, `expiry`, and `data`, and set `cacheAvailable = complete` after successful `localStorage.setItem`. Existing stored objects without `complete` remain readable; newly written partial objects explicitly contain `false`. Set availability false in the quota-error removal path and in the existing clear function:

```js
export function clearOpenLibCache() {
  cache.clear()
  cacheAvailable = false
  localStorage.removeItem(CACHE_STORAGE_KEY)
  console.log('OpenLib cache cleared')
}
```

Change `debouncedSaveCache()` to call `saveCacheToStorage({ complete: false })`; keep the final parameterless `saveCacheToStorage()` at the end of `batchSearchBooks()` so only full batch completion marks the cache available.

- [ ] **Step 4: Implement cache-only book resolution**

Centralize the existing translated title/author key and use it in both paths:

```js
function getBookCacheKey(title, author = null) {
  const cleanedTitle = cleanTitle(title)
  const searchTitle = TITLE_TRANSLATIONS[cleanedTitle] || cleanedTitle
  return `${searchTitle}-${author || ''}`
}

export function getCachedBookResults(books) {
  return new Map(books.map(book => [
    book.id,
    cache.get(getBookCacheKey(book.title, book.author)) || null
  ]))
}
```

Update `searchBook()` to use `getBookCacheKey()` while preserving its existing `searchTitle` variable for API queries and logging.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- tests/openlibCache.test.js`

Expected: all focused tests PASS and `fetch` remains unused in cache-only cases.

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/services/openlib.js tests/openlibCache.test.js
git commit -m "Add cache-only book artwork lookup"
```

---

### Task 3: Select cache-only or network artwork loading in the app

**Files:**
- Modify: `src/App.vue:9-11,401-470,474-558,728-755`
- Modify: `tests/App.todoist-refresh.test.js:5-175,239-295`

**Interfaces:**
- Consumes: `hasTmdbCache()`, `getCachedMovieResults(movies)`, `hasOpenLibCache()`, and `getCachedBookResults(books)` from Tasks 1 and 2.
- Produces: ordinary loads that hydrate artwork from cache without calling `batchSearchMovies`/`batchSearchBooks`, while cache misses and Refresh retain full batch behavior.

- [ ] **Step 1: Extend service mocks and write failing cache-only component tests**

Add mock functions and exports:

```js
hasTmdbCache: vi.fn(),
getCachedMovieResults: vi.fn(),
hasOpenLibCache: vi.fn(),
getCachedBookResults: vi.fn()
```

In `beforeEach`, default both availability mocks to `false` and both result mocks to empty `Map` objects so existing automatic-first-load tests retain their meaning.

Add one Movies and one Books test:

```js
it('hydrates movies from valid artwork cache without a network batch', async () => {
  const movie = { id: 'm1', title: 'Cached Movie', sectionId: 'movies' }
  writeTodoistCache('movies', [movie])
  serviceMocks.hasTmdbCache.mockReturnValue(true)
  const cached = new Map([['m1', { posterPath: '/cached.jpg' }]])
  serviceMocks.getCachedMovieResults.mockReturnValue(cached)

  const wrapper = mountApp()
  await flushPromises()

  expect(wrapper.text()).toContain('Cached Movie')
  expect(serviceMocks.getCachedMovieResults).toHaveBeenCalledWith([movie])
  expect(serviceMocks.batchSearchMovies).not.toHaveBeenCalled()
})

it('hydrates books from valid artwork cache without a network batch', async () => {
  const book = { id: 'b1', title: 'Cached Book', sectionId: 'books' }
  localStorage.setItem('content_mode', 'books')
  writeTodoistCache('books', [book])
  serviceMocks.hasOpenLibCache.mockReturnValue(true)
  serviceMocks.getCachedBookResults.mockReturnValue(new Map([['b1', { coverId: 42 }]]))

  const wrapper = mountApp()
  await flushPromises()

  expect(wrapper.text()).toContain('Cached Book')
  expect(serviceMocks.getCachedBookResults).toHaveBeenCalledWith([book])
  expect(serviceMocks.batchSearchBooks).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Add a failing Movies manual-refresh assertion**

Use a deferred full batch to prove Refresh waits for it:

```js
it('clears valid movie artwork cache and awaits a full batch on Refresh', async () => {
  const oldMovie = { id: 'old', title: 'Old Movie', sectionId: 'movies' }
  const newMovie = { id: 'new', title: 'New Movie', sectionId: 'movies' }
  const artwork = createDeferred()
  localStorage.setItem('tmdb_api_key', 'key')
  writeTodoistCache('movies', [oldMovie])
  serviceMocks.hasTmdbCache.mockReturnValue(true)
  serviceMocks.getCachedMovieResults.mockReturnValue(new Map([['old', { posterPath: '/old.jpg' }]]))
  serviceMocks.fetchMovies.mockResolvedValue([newMovie])

  const wrapper = mountApp()
  await flushPromises()
  expect(serviceMocks.getCachedMovieResults).toHaveBeenCalledOnce()
  expect(serviceMocks.batchSearchMovies).not.toHaveBeenCalled()

  serviceMocks.clearTmdbCache.mockClear()
  serviceMocks.batchSearchMovies.mockReturnValueOnce(artwork.promise)
  wrapper.get('[aria-label="Обновить фильмы из Todoist"]').trigger('click')
  await flushPromises()

  expect(serviceMocks.fetchMovies).toHaveBeenCalledOnce()
  expect(serviceMocks.clearTmdbCache).toHaveBeenCalledOnce()
  expect(serviceMocks.clearTmdbCache.mock.invocationCallOrder[0])
    .toBeGreaterThan(serviceMocks.fetchMovies.mock.invocationCallOrder[0])
  expect(serviceMocks.batchSearchMovies).toHaveBeenCalledOnce()
  expect(wrapper.text()).not.toContain('Фильмы обновлены')

  artwork.resolve(new Map([['new', { posterPath: '/new.jpg' }]]))
  await flushPromises()
  expect(wrapper.text()).toContain('Фильмы обновлены')
})
```

- [ ] **Step 3: Run component tests and verify RED**

Run: `npm test -- tests/App.todoist-refresh.test.js`

Expected: the new cache-only tests FAIL because `App.vue` still calls the network-capable batches on every successful ordinary load.

- [ ] **Step 4: Import the cache-only interfaces and branch normal loading**

Extend the service imports and replace only the normal post-Todoist artwork scheduling:

```js
if (succeeded && loadArtwork) {
  if (hasTmdbCache()) {
    posters.value = getCachedMovieResults(movies.value)
  } else if (tmdbApiKey.value) {
    void loadPosters().catch(e => {
      console.error('Unexpected background poster loading error:', e)
    })
  }
}
```

Use the corresponding Books branch:

```js
if (succeeded && loadArtwork) {
  if (hasOpenLibCache()) {
    bookCovers.value = getCachedBookResults(books.value)
  } else {
    void loadBookCovers().catch(e => {
      console.error('Unexpected background cover loading error:', e)
    })
  }
}
```

Do not add `loadingPosters` or progress state around cache-only assignments. Do not change `refreshContent()`: its `loadArtwork: false`, clear, and explicit awaited full loader already enforce the manual-refresh sequence.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/App.todoist-refresh.test.js`

Expected: all component tests PASS, including existing deferred first-load and Refresh-ordering coverage.

- [ ] **Step 6: Run complete verification**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run build`

Expected: Vite production build succeeds.

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/App.vue tests/App.todoist-refresh.test.js
git commit -m "Refresh cached artwork only on demand"
```
