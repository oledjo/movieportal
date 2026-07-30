# Background Artwork Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the active Todoist resource list before its posters or book covers finish loading.

**Architecture:** Keep Todoist list loading in `loadMovies()` and `loadBooks()`, but separate its completion from artwork enrichment. Each loader ends the full-page `loading` state after the list succeeds, then starts the existing artwork loader as a handled background promise; manual refresh continues passing `loadArtwork: false` and awaiting its own ordered artwork refresh.

**Tech Stack:** Vue 3 Composition API, Vite 5, Vitest 2, Vue Test Utils, jsdom

## Global Constraints

- The full-page `loading` state covers only the active Todoist resource list.
- TMDB poster and Open Library/Google Books cover loading continue using `loadingPosters` and the existing progress indicator.
- Manual refresh keeps its current ordered behavior: Todoist first, then an awaited artwork refresh.
- Artwork failures must not hide an already-rendered Todoist list or create an unhandled rejection.
- Do not change Todoist caching, artwork cache expiry, batch sizes, artificial artwork delays, filters, scheduling, or Todoist write behavior.

---

## File Map

- Modify `src/App.vue`: end the full-page loading lifecycle before starting normal artwork enrichment.
- Modify `tests/App.todoist-refresh.test.js`: prove Movies and Books render while their artwork promises remain unresolved.

### Task 1: Decouple Resource Rendering from Artwork Completion

**Files:**
- Modify: `src/App.vue:401-465`
- Modify: `tests/App.todoist-refresh.test.js`

**Interfaces:**
- Consumes: existing `loadTodoistResources`, `loadPosters`, and `loadBookCovers` functions.
- Preserves: `loadMovies({ forceRefresh?, loadArtwork? }?) -> Promise<boolean>`.
- Preserves: `loadBooks({ forceRefresh?, loadArtwork? }?) -> Promise<boolean>`.
- Produces: successful normal loaders resolve after starting, but not awaiting, artwork enrichment.

- [ ] **Step 1: Add a controllable artwork-promise helper**

Add this test helper near `mountApp()` in `tests/App.todoist-refresh.test.js`:

```js
function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
```

- [ ] **Step 2: Write the failing Movies background-artwork test**

Add this test inside the existing `Todoist cached loading` suite:

```js
it('shows cached movies before poster loading finishes', async () => {
  const artwork = createDeferred()
  writeTodoistCache('movies', [{ id: 'm1', title: 'Fast Movie', sectionId: 'movies' }])
  serviceMocks.batchSearchMovies.mockReturnValueOnce(artwork.promise)

  const wrapper = mountApp()
  await flushPromises()

  expect(wrapper.text()).toContain('Fast Movie')
  expect(wrapper.text()).not.toContain('Загрузка фильмов...')
  expect(serviceMocks.batchSearchMovies).toHaveBeenCalledOnce()

  artwork.resolve(new Map())
  await flushPromises()
})
```

- [ ] **Step 3: Run the Movies test and verify RED**

Run:

```bash
npm test -- tests/App.todoist-refresh.test.js -t 'shows cached movies before poster loading finishes'
```

Expected: FAIL because `loadMovies()` still awaits `loadPosters()`, leaving the full-page loading message visible while the deferred artwork promise is unresolved.

- [ ] **Step 4: Write the failing Books background-artwork test**

Add this test inside the same suite:

```js
it('shows cached books before cover loading finishes', async () => {
  const artwork = createDeferred()
  localStorage.setItem('content_mode', 'books')
  writeTodoistCache('books', [{ id: 'b1', title: 'Fast Book', sectionId: 'books' }])
  serviceMocks.batchSearchBooks.mockReturnValueOnce(artwork.promise)

  const wrapper = mountApp()
  await flushPromises()

  expect(wrapper.text()).toContain('Fast Book')
  expect(wrapper.text()).not.toContain('Загрузка книг...')
  expect(serviceMocks.batchSearchBooks).toHaveBeenCalledOnce()

  artwork.resolve(new Map())
  await flushPromises()
})
```

- [ ] **Step 5: Run the Books test and verify RED**

Run:

```bash
npm test -- tests/App.todoist-refresh.test.js -t 'shows cached books before cover loading finishes'
```

Expected: FAIL because `loadBooks()` still awaits `loadBookCovers()`.

- [ ] **Step 6: Implement the minimal non-blocking loader flow**

Restructure `loadMovies()` so its Todoist result and error determine the boolean return, `loading` always ends first, and normal artwork starts afterward:

```js
async function loadMovies({ forceRefresh = false, loadArtwork = true } = {}) {
  if (!todoistToken.value) {
    loading.value = false
    showSettings.value = true
    return false
  }

  loading.value = true
  error.value = null
  let succeeded = false

  try {
    const { items } = await loadTodoistResources(
      'movies',
      () => fetchMovies(todoistToken.value),
      { forceRefresh }
    )
    movies.value = items
    localStorage.setItem('todoist_token', todoistToken.value)
    succeeded = true
  } catch (e) {
    error.value = e.message
    console.error('Error loading movies:', e)
  } finally {
    loading.value = false
  }

  if (succeeded && loadArtwork && tmdbApiKey.value) {
    void loadPosters().catch(e => {
      console.error('Unexpected background poster loading error:', e)
    })
  }
  return succeeded
}
```

Apply the same structure to `loadBooks()`, using the Books fetcher/list and:

```js
if (succeeded && loadArtwork) {
  void loadBookCovers().catch(e => {
    console.error('Unexpected background cover loading error:', e)
  })
}
return succeeded
```

Do not alter `refreshContent()`: it already passes `loadArtwork: false`, then clears and awaits the active artwork loader after a successful Todoist refresh.

- [ ] **Step 7: Run the focused component tests**

Run:

```bash
npm test -- tests/App.todoist-refresh.test.js
```

Expected: PASS, including both new deferred-artwork tests and all existing refresh ordering/race tests.

- [ ] **Step 8: Run full verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, the production build exits 0, and no whitespace errors are reported.

- [ ] **Step 9: Commit**

```bash
git add src/App.vue tests/App.todoist-refresh.test.js
git commit -m "Load artwork without blocking cached content"
```
