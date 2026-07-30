# Manual Todoist Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Todoist Movies and Books locally so normal loads use cached resources and only the active tab's refresh button fetches updated Todoist data.

**Architecture:** Add a focused `todoistCache` service that owns versioned `localStorage` reads, writes, invalidation, and cache-first/forced-network decisions. Keep orchestration in `App.vue`: normal loads call the service cache-first, manual refresh forces a fetch for the active mode, and existing local mutations persist the affected array.

**Tech Stack:** Vue 3 Composition API, Vite 5, browser `localStorage`, Vitest, Vue Test Utils, jsdom

## Global Constraints

- Movies and Books use separate versioned caches with no automatic expiry.
- The active tab fetches automatically only when its cache is absent or invalid.
- Manual refresh fetches only the active Todoist project and refreshes that mode's artwork after Todoist succeeds.
- A failed manual refresh preserves the previous displayed and cached data.
- Changing the Todoist token clears both resource caches before the active mode performs its first fetch.
- Do not change unrelated UI, filtering, Todoist parsing, scheduling, or media metadata behavior.
- Do not introduce new Todoist write requests.

---

## File Map

- Create `src/services/todoistCache.js`: cache keys, validation, persistence, invalidation, and cache-first/forced-network resource loading.
- Create `tests/todoistCache.test.js`: unit tests for valid, missing, malformed, empty, failed, and forced-refresh cache behavior.
- Create `tests/App.todoist-refresh.test.js`: component-level tests for mount, mode switching, token changes, active-tab refresh, failure fallback, and local mutation persistence.
- Modify `src/App.vue`: consume the cache service, replace artwork-only refresh with active-mode full refresh, and persist local mutations.
- Modify `package.json` and `package-lock.json`: add the test command and test-only dependencies.

### Task 1: Versioned Todoist Resource Cache

**Files:**
- Create: `src/services/todoistCache.js`
- Create: `tests/todoistCache.test.js`
- Modify: `package.json:6-19`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `readTodoistCache(mode, storage?) -> { found: boolean, items: Array }`
- Produces: `writeTodoistCache(mode, items, storage?) -> boolean`
- Produces: `clearTodoistCaches(storage?) -> void`
- Produces: `loadTodoistResources(mode, fetcher, { forceRefresh?, storage? }?) -> Promise<{ items: Array, source: 'cache' | 'network' }>`
- Consumes: a fetcher callback returning a Todoist resource array.

- [ ] **Step 1: Install the existing-stack test tooling and add the test script**

Run:

```bash
npm install --save-dev vitest@^2.1.9 @vue/test-utils@^2.4.6 jsdom@^25.0.1
```

Add to `package.json` scripts:

```json
"test": "vitest run"
```

Expected: `package.json` and `package-lock.json` contain only the three test dependencies plus the new script.

- [ ] **Step 2: Write failing cache-service tests**

Create `tests/todoistCache.test.js` with an in-memory Storage double and these cases:

```js
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
```

- [ ] **Step 3: Run the cache tests and verify they fail**

Run:

```bash
npm test -- tests/todoistCache.test.js
```

Expected: FAIL because `src/services/todoistCache.js` does not exist.

- [ ] **Step 4: Implement the minimal cache service**

Create `src/services/todoistCache.js` with this behavior:

```js
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
```

- [ ] **Step 5: Run the focused tests**

Run:

```bash
npm test -- tests/todoistCache.test.js
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json src/services/todoistCache.js tests/todoistCache.test.js
git commit -m "Add persistent Todoist resource cache"
```

### Task 2: Cache-First Application Loading and Token Invalidation

**Files:**
- Modify: `src/App.vue:1-22,365-424,739-749`
- Create: `tests/App.todoist-refresh.test.js`

**Interfaces:**
- Consumes: `loadTodoistResources(mode, fetcher, options)` and `clearTodoistCaches()` from Task 1.
- Produces: `loadContent({ forceRefresh?: boolean }?) -> Promise<boolean>`.
- Produces: `loadMovies({ forceRefresh?: boolean }?) -> Promise<boolean>` and `loadBooks({ forceRefresh?: boolean }?) -> Promise<boolean>`; `true` means the resource and artwork load completed, `false` means it failed or requires settings.

- [ ] **Step 1: Write failing component tests for cache-first loading**

Create `tests/App.todoist-refresh.test.js`. Mock Todoist, artwork services, and child components before importing `App.vue`; seed `localStorage` per test. Use this concrete setup and these assertions:

```js
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { writeTodoistCache } from '../src/services/todoistCache.js'
import App from '../src/App.vue'

const serviceMocks = vi.hoisted(() => ({
  fetchMovies: vi.fn(),
  fetchBooks: vi.fn(),
  completeTask: vi.fn(),
  createTask: vi.fn(),
  updateTaskDueDate: vi.fn(),
  completeBookTask: vi.fn(),
  createBookReviewTask: vi.fn(),
  batchSearchMovies: vi.fn(),
  batchSearchBooks: vi.fn(),
  clearTmdbCache: vi.fn(),
  clearOpenLibCache: vi.fn()
}))

vi.mock('../src/services/todoist.js', () => ({
  fetchMovies: serviceMocks.fetchMovies,
  completeTask: serviceMocks.completeTask,
  createTask: serviceMocks.createTask,
  updateTaskDueDate: serviceMocks.updateTaskDueDate,
  setCorsProxy: vi.fn(),
  SECTIONS: {},
  SECTION_NAMES: {}
}))

vi.mock('../src/services/books.js', () => ({
  fetchBooks: serviceMocks.fetchBooks,
  completeBookTask: serviceMocks.completeBookTask,
  createBookReviewTask: serviceMocks.createBookReviewTask,
  clearBooksCache: vi.fn(),
  setCorsProxy: vi.fn()
}))

vi.mock('../src/services/tmdb.js', () => ({
  batchSearchMovies: serviceMocks.batchSearchMovies,
  getPosterUrl: vi.fn(),
  clearTmdbCache: serviceMocks.clearTmdbCache,
  saveCacheToStorage: vi.fn()
}))

vi.mock('../src/services/openlib.js', () => ({
  batchSearchBooks: serviceMocks.batchSearchBooks,
  getBookCoverUrl: vi.fn(),
  clearOpenLibCache: serviceMocks.clearOpenLibCache
}))

const MovieCardStub = {
  name: 'MovieCard',
  props: ['movie'],
  emits: ['watched', 'schedule'],
  template: '<div class="movie-card-stub">{{ movie.title }}</div>'
}
const BookCardStub = {
  name: 'BookCard',
  props: ['book'],
  emits: ['read'],
  template: '<div class="book-card-stub">{{ book.title }}</div>'
}
const SettingsModalStub = {
  name: 'SettingsModal',
  props: ['todoistToken', 'tmdbApiKey', 'corsProxy'],
  emits: ['save', 'close'],
  template: '<div class="settings-modal-stub"></div>'
}

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        MovieCard: MovieCardStub,
        BookCard: BookCardStub,
        MovieModal: true,
        BookModal: true,
        FilterBar: true,
        SettingsModal: SettingsModalStub,
        ToastNotification: {
          name: 'ToastNotification',
          props: ['show', 'message', 'actionText'],
          emits: ['action'],
          template: `<div v-if="show" class="toast-stub">
            {{ message }}
            <button v-if="actionText" class="toast-action-stub" @click="$emit('action')">
              {{ actionText }}
            </button>
          </div>`
        }
      }
    }
  })
}

describe('Todoist cached loading', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('todoist_token', 'token')
    vi.resetAllMocks()
    serviceMocks.batchSearchMovies.mockResolvedValue(new Map())
    serviceMocks.batchSearchBooks.mockResolvedValue(new Map())
  })

  it('renders cached movies on mount without fetching Todoist', async () => {
    writeTodoistCache('movies', [{ id: 'm1', title: 'Cached Movie', sectionId: 'movies' }])
    const wrapper = mountApp()
    await flushPromises()
    expect(serviceMocks.fetchMovies).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Cached Movie')
  })

  it('fetches movies once when their cache is absent', async () => {
    serviceMocks.fetchMovies.mockResolvedValue([{ id: 'm1', title: 'Fetched Movie', sectionId: 'movies' }])
    mountApp()
    await flushPromises()
    expect(serviceMocks.fetchMovies).toHaveBeenCalledOnce()
  })

  it('uses the books cache when switching modes', async () => {
    writeTodoistCache('movies', [])
    writeTodoistCache('books', [{ id: 'b1', title: 'Cached Book', sectionId: 'books' }])
    const wrapper = mountApp()
    await flushPromises()
    await wrapper.get('[aria-label="Показать книги"]').trigger('click')
    await flushPromises()
    expect(serviceMocks.fetchBooks).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Cached Book')
  })
})
```

Add a settings-save test that opens Settings, emits `save` from `SettingsModalStub` with `{ todoistToken: 'new-token', tmdbApiKey: '', corsProxy: '' }`, asserts both cache keys are removed, and asserts `serviceMocks.fetchMovies` runs once while `serviceMocks.fetchBooks` does not run.

- [ ] **Step 2: Run the component tests and verify they fail**

Run:

```bash
npm test -- tests/App.todoist-refresh.test.js
```

Expected: FAIL because `App.vue` still calls Todoist on mount/mode switch and does not invalidate caches on token changes.

- [ ] **Step 3: Integrate cache-first loading in `App.vue`**

Import the Task 1 service:

```js
import {
  clearTodoistCaches,
  loadTodoistResources,
  writeTodoistCache
} from './services/todoistCache.js'
```

Update the loading functions to accept options and assign only after a successful result:

```js
async function loadMovies({ forceRefresh = false } = {}) {
  if (!todoistToken.value) {
    loading.value = false
    showSettings.value = true
    return false
  }

  loading.value = true
  error.value = null
  try {
    const { items } = await loadTodoistResources(
      'movies',
      () => fetchMovies(todoistToken.value),
      { forceRefresh }
    )
    movies.value = items
    localStorage.setItem('todoist_token', todoistToken.value)
    if (tmdbApiKey.value) await loadPosters()
    return true
  } catch (e) {
    error.value = e.message
    console.error('Error loading movies:', e)
    return false
  } finally {
    loading.value = false
  }
}
```

Apply the same structure to `loadBooks`, using mode `books`, `fetchBooks`, and `loadBookCovers`. Update `loadContent(options = {})` to pass the options to the active loader.

In `saveSettings`, compare the old and new Todoist tokens before assignment:

```js
const tokenChanged = todoistToken.value !== settings.todoistToken
todoistToken.value = settings.todoistToken
if (tokenChanged) clearTodoistCaches()
```

Keep the existing CORS and TMDB settings behavior unchanged, close the modal, and call `loadContent()`.

- [ ] **Step 4: Run the loading tests**

Run:

```bash
npm test -- tests/App.todoist-refresh.test.js
```

Expected: PASS for mount, missing cache, mode switch, and token-change cases.

- [ ] **Step 5: Run the full test suite and production build**

Run:

```bash
npm test
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/App.vue tests/App.todoist-refresh.test.js
git commit -m "Use cached Todoist resources on normal loads"
```

### Task 3: Active-Tab Manual Refresh and Mutation Persistence

**Files:**
- Modify: `src/App.vue:540-749,904-919`
- Modify: `tests/App.todoist-refresh.test.js`

**Interfaces:**
- Consumes: `loadTodoistResources`, `writeTodoistCache`, and the cache-first loaders from Tasks 1–2.
- Produces: `refreshContent() -> Promise<void>`, bound to the existing header refresh button.

- [ ] **Step 1: Add failing tests for active refresh, failure fallback, and persistence**

Extend `tests/App.todoist-refresh.test.js` with these assertions:

```js
it('refreshes only movies while the movies tab is active', async () => {
  writeTodoistCache('movies', [{ id: 'old', title: 'Old Movie', sectionId: 'movies' }])
  writeTodoistCache('books', [{ id: 'book', title: 'Cached Book', sectionId: 'books' }])
  serviceMocks.fetchMovies.mockResolvedValue([{ id: 'new', title: 'New Movie', sectionId: 'movies' }])
  const wrapper = mountApp()
  await flushPromises()

  await wrapper.get('[aria-label="Обновить фильмы из Todoist"]').trigger('click')
  await flushPromises()

  expect(serviceMocks.fetchMovies).toHaveBeenCalledOnce()
  expect(serviceMocks.fetchBooks).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('New Movie')
})

it('keeps cached movies visible when manual refresh fails', async () => {
  writeTodoistCache('movies', [{ id: 'old', title: 'Old Movie', sectionId: 'movies' }])
  serviceMocks.fetchMovies.mockRejectedValue(new Error('offline'))
  const wrapper = mountApp()
  await flushPromises()

  await wrapper.get('[aria-label="Обновить фильмы из Todoist"]').trigger('click')
  await flushPromises()

  expect(wrapper.text()).toContain('Old Movie')
  expect(JSON.parse(localStorage.getItem('todoist_movies_cache')).items[0].id).toBe('old')
  expect(wrapper.text()).toContain('offline')
})
```

Add fake-timer tests for watched/read optimistic removal, Undo restoration, failed delayed writes, and a direct schedule-date update. Use the component stubs to emit the existing events and assert the corresponding cache after each change:

```js
it('persists watched removal and Undo restoration', async () => {
  const movie = { id: 'm1', title: 'Movie', sectionId: 'movies' }
  writeTodoistCache('movies', [movie])
  vi.stubGlobal('confirm', vi.fn(() => true))
  const wrapper = mountApp()
  await flushPromises()

  wrapper.findComponent(MovieCardStub).vm.$emit('watched', movie)
  await flushPromises()
  expect(JSON.parse(localStorage.getItem('todoist_movies_cache')).items).toEqual([])

  await wrapper.get('.toast-action-stub').trigger('click')
  expect(JSON.parse(localStorage.getItem('todoist_movies_cache')).items).toEqual([movie])
})

it('restores the movie cache when the delayed Todoist write fails', async () => {
  vi.useFakeTimers()
  const movie = { id: 'm1', title: 'Movie', sectionId: 'movies' }
  writeTodoistCache('movies', [movie])
  vi.stubGlobal('confirm', vi.fn(() => true))
  serviceMocks.completeTask.mockRejectedValue(new Error('write failed'))
  const wrapper = mountApp()
  await flushPromises()

  wrapper.findComponent(MovieCardStub).vm.$emit('watched', movie)
  await vi.advanceTimersByTimeAsync(5000)
  await flushPromises()

  expect(JSON.parse(localStorage.getItem('todoist_movies_cache')).items).toEqual([movie])
  vi.useRealTimers()
})

it('persists a scheduled movie date', async () => {
  const movie = { id: 'm1', title: 'Movie', sectionId: 'movies', dueDate: null }
  writeTodoistCache('movies', [movie])
  serviceMocks.updateTaskDueDate.mockResolvedValue(undefined)
  const wrapper = mountApp()
  await flushPromises()

  wrapper.findComponent(MovieCardStub).vm.$emit('schedule', {
    movie,
    date: '2026-08-01'
  })
  await flushPromises()

  expect(JSON.parse(localStorage.getItem('todoist_movies_cache')).items[0].dueDate)
    .toBe('2026-08-01')
})

it('persists read-book removal and Undo restoration', async () => {
  const book = { id: 'b1', title: 'Book', sectionId: 'books' }
  writeTodoistCache('movies', [])
  writeTodoistCache('books', [book])
  vi.stubGlobal('confirm', vi.fn(() => true))
  const wrapper = mountApp()
  await flushPromises()
  await wrapper.get('[aria-label="Показать книги"]').trigger('click')
  await flushPromises()

  wrapper.findComponent(BookCardStub).vm.$emit('read', book)
  await flushPromises()
  expect(JSON.parse(localStorage.getItem('todoist_books_cache')).items).toEqual([])

  await wrapper.get('.toast-action-stub').trigger('click')
  expect(JSON.parse(localStorage.getItem('todoist_books_cache')).items).toEqual([book])
})
```

Add `afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })` so one test cannot affect another.

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
npm test -- tests/App.todoist-refresh.test.js
```

Expected: FAIL because the button still refreshes artwork only and mutations do not write resource caches.

- [ ] **Step 3: Replace artwork-only reload with active-mode full refresh**

Replace `reloadPosters` with `refreshContent`. Fetch before clearing artwork and preserve data on failure:

```js
async function refreshContent() {
  const mode = contentMode.value
  const previousError = error.value
  const succeeded = mode === 'movies'
    ? await loadMovies({ forceRefresh: true, loadArtwork: false })
    : await loadBooks({ forceRefresh: true, loadArtwork: false })

  if (!succeeded) {
    const message = error.value || 'Не удалось обновить данные Todoist'
    error.value = previousError
    showToast('Ошибка обновления: ' + message, 'error')
    return
  }

  if (mode === 'movies') {
    clearTmdbCache()
    posters.value.clear()
    if (tmdbApiKey.value) await loadPosters()
    showToast('Фильмы обновлены', 'success')
  } else {
    clearOpenLibCache()
    bookCovers.value.clear()
    await loadBookCovers()
    showToast('Книги обновлены', 'success')
  }
}
```

Avoid duplicate artwork requests by adding a `loadArtwork = true` option to `loadMovies`/`loadBooks`; call them with `{ forceRefresh: true, loadArtwork: false }` from `refreshContent`, then clear and reload artwork once after Todoist succeeds.

Update the button:

```vue
<button
  v-if="!loading && todoistToken"
  class="reload-posters-btn"
  @click="refreshContent"
  :disabled="loading || loadingPosters"
  :class="{ loading: loading || loadingPosters }"
  :title="contentMode === 'movies' ? 'Обновить фильмы' : 'Обновить книги'"
  :aria-label="contentMode === 'movies' ? 'Обновить фильмы из Todoist' : 'Обновить книги из Todoist'"
>
```

Do not require a TMDB key to show the Movies refresh button; refreshing Todoist must work without artwork configuration.

- [ ] **Step 4: Persist every existing local resource mutation**

Immediately after each assignment that changes `movies.value`, add:

```js
writeTodoistCache('movies', movies.value)
```

Cover optimistic watched removal, Undo restoration, delayed Todoist failure restoration, and successful due-date updates. Because the due date is currently mutated in place, persist after the mutation.

Immediately after each assignment that changes `books.value`, add:

```js
writeTodoistCache('books', books.value)
```

Cover optimistic read removal, Undo restoration, and delayed Todoist failure restoration.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/App.todoist-refresh.test.js tests/todoistCache.test.js
```

Expected: PASS for cache-first loading, active-mode refresh, failure preservation, token invalidation, and local mutations.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, production build exits 0, and `git diff --check` reports no whitespace errors.

- [ ] **Step 7: Perform manual browser checks**

Run:

```bash
npm run dev
```

Verify:

1. First visit with a token and no cache fetches only the active tab.
2. Reloading the page does not request Todoist again.
3. Switching to a tab without cache fetches it once; later switches do not refetch.
4. The refresh button label matches the active tab and updates only that tab.
5. A simulated failed refresh leaves the prior cards visible and shows an error toast.
6. Watched/read/scheduled changes survive a page reload from the updated cache.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/App.vue tests/App.todoist-refresh.test.js
git commit -m "Refresh Todoist resources only on demand"
```

### Task 4: Final Scope and Regression Review

**Files:**
- Review only: `src/App.vue`
- Review only: `src/services/todoistCache.js`
- Review only: `tests/todoistCache.test.js`
- Review only: `tests/App.todoist-refresh.test.js`
- Review only: `package.json`
- Review only: `package-lock.json`

**Interfaces:**
- Consumes: all completed implementation behavior.
- Produces: verified, review-ready local commits with no push or deployment.

- [ ] **Step 1: Confirm spec coverage from the diff**

Run:

```bash
git diff origin/main...HEAD -- src/App.vue src/services/todoistCache.js tests package.json package-lock.json
```

Expected: every design requirement maps to code or tests, with no unrelated refactor.

- [ ] **Step 2: Run final automated verification from a clean dependency install**

Run:

```bash
npm ci
npm test
npm run build
```

Expected: install exits 0, all tests pass, and the production build exits 0.

- [ ] **Step 3: Confirm repository state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected: the working tree is clean and the new commits are local only. Do not push or deploy without explicit current-message confirmation.
