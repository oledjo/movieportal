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
  clearOpenLibCache: vi.fn(),
  clearBooksCache: vi.fn()
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
  clearBooksCache: serviceMocks.clearBooksCache,
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

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createLocalStorage() {
  const values = new Map()
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear()
  }
}

describe('Todoist cached loading', () => {
  let storage

  beforeEach(() => {
    storage = createLocalStorage()
    vi.stubGlobal('localStorage', storage)
    storage.setItem('todoist_token', 'token')
    vi.resetAllMocks()
    serviceMocks.batchSearchMovies.mockResolvedValue(new Map())
    serviceMocks.batchSearchBooks.mockResolvedValue(new Map())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders cached movies on mount without fetching Todoist', async () => {
    writeTodoistCache('movies', [{ id: 'm1', title: 'Cached Movie', sectionId: 'movies' }])
    const wrapper = mountApp()
    await flushPromises()
    expect(serviceMocks.fetchMovies).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Cached Movie')
  })

  it('shows cached movies before poster loading finishes', async () => {
    const artwork = createDeferred()
    localStorage.setItem('tmdb_api_key', 'key')
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

  it('clears Todoist caches and reloads only the active mode when its token changes', async () => {
    writeTodoistCache('movies', [{ id: 'm1', title: 'Cached Movie', sectionId: 'movies' }])
    writeTodoistCache('books', [{ id: 'b1', title: 'Cached Book', sectionId: 'books' }])
    serviceMocks.fetchMovies.mockResolvedValue([{ id: 'm2', title: 'Fresh Movie', sectionId: 'movies' }])
    const wrapper = mountApp()
    await flushPromises()

    await wrapper.get('[aria-label="Открыть настройки приложения"]').trigger('click')
    wrapper.findComponent(SettingsModalStub).vm.$emit('save', {
      todoistToken: 'new-token',
      tmdbApiKey: '',
      corsProxy: ''
    })

    expect(storage.getItem('todoist_movies_cache')).toBeNull()
    expect(storage.getItem('todoist_books_cache')).toBeNull()
    await flushPromises()
    expect(serviceMocks.fetchMovies).toHaveBeenCalledOnce()
    expect(serviceMocks.fetchBooks).not.toHaveBeenCalled()
  })

  it('clears Books account metadata before reloading Books for a changed token', async () => {
    storage.setItem('content_mode', 'books')
    serviceMocks.fetchBooks
      .mockResolvedValueOnce([{ id: 'b1', title: 'Old Account Book', sectionId: 'books' }])
      .mockResolvedValueOnce([{ id: 'b2', title: 'New Account Book', sectionId: 'books' }])
    const wrapper = mountApp()
    await flushPromises()
    expect(serviceMocks.fetchBooks).toHaveBeenCalledWith('token')

    await wrapper.get('[aria-label="Открыть настройки приложения"]').trigger('click')
    wrapper.findComponent(SettingsModalStub).vm.$emit('save', {
      todoistToken: 'new-token',
      tmdbApiKey: '',
      corsProxy: ''
    })
    await flushPromises()

    expect(serviceMocks.clearBooksCache).toHaveBeenCalledOnce()
    expect(serviceMocks.clearBooksCache.mock.invocationCallOrder[0])
      .toBeLessThan(serviceMocks.fetchBooks.mock.invocationCallOrder[1])
    expect(serviceMocks.fetchBooks).toHaveBeenLastCalledWith('new-token')
  })

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

  it('refreshes Books and clears book artwork only after Todoist succeeds', async () => {
    const oldBook = { id: 'old', title: 'Old Book', sectionId: 'books' }
    const newBook = { id: 'new', title: 'New Book', sectionId: 'books' }
    writeTodoistCache('movies', [])
    writeTodoistCache('books', [oldBook])
    const wrapper = mountApp()
    await flushPromises()
    await wrapper.get('[aria-label="Показать книги"]').trigger('click')
    await flushPromises()
    serviceMocks.fetchBooks.mockClear()
    serviceMocks.batchSearchBooks.mockClear()
    serviceMocks.clearOpenLibCache.mockClear()
    serviceMocks.fetchBooks.mockResolvedValue([newBook])

    await wrapper.get('[aria-label="Обновить книги из Todoist"]').trigger('click')
    await flushPromises()

    expect(serviceMocks.fetchBooks).toHaveBeenCalledOnce()
    expect(serviceMocks.fetchMovies).not.toHaveBeenCalled()
    expect(serviceMocks.clearOpenLibCache).toHaveBeenCalledOnce()
    expect(serviceMocks.clearOpenLibCache.mock.invocationCallOrder[0])
      .toBeGreaterThan(serviceMocks.fetchBooks.mock.invocationCallOrder[0])
    expect(serviceMocks.batchSearchBooks).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('New Book')
    expect(JSON.parse(localStorage.getItem('todoist_books_cache')).items).toEqual([newBook])
  })

  it('preserves Books and its artwork cache when Todoist refresh fails', async () => {
    const oldBook = { id: 'old', title: 'Old Book', sectionId: 'books' }
    writeTodoistCache('movies', [])
    writeTodoistCache('books', [oldBook])
    const wrapper = mountApp()
    await flushPromises()
    await wrapper.get('[aria-label="Показать книги"]').trigger('click')
    await flushPromises()
    serviceMocks.fetchBooks.mockClear()
    serviceMocks.batchSearchBooks.mockClear()
    serviceMocks.clearOpenLibCache.mockClear()
    serviceMocks.fetchBooks.mockRejectedValue(new Error('books offline'))

    await wrapper.get('[aria-label="Обновить книги из Todoist"]').trigger('click')
    await flushPromises()

    expect(serviceMocks.clearOpenLibCache).not.toHaveBeenCalled()
    expect(serviceMocks.batchSearchBooks).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Old Book')
    expect(wrapper.text()).toContain('books offline')
    expect(JSON.parse(localStorage.getItem('todoist_books_cache')).items).toEqual([oldBook])
  })

  it('disables movie refresh while a watched action can still be undone', async () => {
    vi.useFakeTimers()
    const movie = { id: 'm1', title: 'Movie', sectionId: 'movies' }
    writeTodoistCache('movies', [movie])
    vi.stubGlobal('confirm', vi.fn(() => true))
    const wrapper = mountApp()
    await flushPromises()

    wrapper.findComponent(MovieCardStub).vm.$emit('watched', movie)
    await flushPromises()

    const refreshButton = wrapper.get('[aria-label="Обновить фильмы из Todoist"]')
    expect(refreshButton.attributes('disabled')).toBeDefined()
    await refreshButton.trigger('click')
    expect(serviceMocks.fetchMovies).not.toHaveBeenCalled()
  })

  it('removes a watched movie reintroduced by an already-running refresh after delayed success', async () => {
    vi.useFakeTimers()
    const movie = { id: 'm1', title: 'Movie', sectionId: 'movies' }
    writeTodoistCache('movies', [movie])
    vi.stubGlobal('confirm', vi.fn(() => true))
    let resolveRefresh
    serviceMocks.fetchMovies.mockImplementation(() => new Promise(resolve => {
      resolveRefresh = resolve
    }))
    const wrapper = mountApp()
    await flushPromises()

    const movieCard = wrapper.findComponent(MovieCardStub)
    wrapper.get('[aria-label="Обновить фильмы из Todoist"]').trigger('click')
    movieCard.vm.$emit('watched', movie)
    resolveRefresh([movie])
    await flushPromises()
    expect(JSON.parse(localStorage.getItem('todoist_movies_cache')).items).toEqual([movie])

    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()

    expect(JSON.parse(localStorage.getItem('todoist_movies_cache')).items).toEqual([])
    expect(wrapper.text()).not.toContain('Movie')
  })

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
    expect(wrapper.get('[aria-label="Обновить фильмы из Todoist"]').attributes('disabled'))
      .toBeUndefined()
  })

  it('cancels a pending watched action when the Todoist token changes', async () => {
    vi.useFakeTimers()
    const movie = { id: 'm1', title: 'Old Account Movie', sectionId: 'movies' }
    const newMovie = { id: 'm2', title: 'New Account Movie', sectionId: 'movies' }
    writeTodoistCache('movies', [movie])
    vi.stubGlobal('confirm', vi.fn(() => true))
    serviceMocks.fetchMovies.mockResolvedValue([newMovie])
    const wrapper = mountApp()
    await flushPromises()

    wrapper.findComponent(MovieCardStub).vm.$emit('watched', movie)
    await flushPromises()
    expect(wrapper.find('.toast-action-stub').exists()).toBe(true)

    await wrapper.get('[aria-label="Открыть настройки приложения"]').trigger('click')
    wrapper.findComponent(SettingsModalStub).vm.$emit('save', {
      todoistToken: 'new-token',
      tmdbApiKey: '',
      corsProxy: ''
    })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()

    expect(wrapper.find('.toast-action-stub').exists()).toBe(false)
    expect(serviceMocks.completeTask).not.toHaveBeenCalled()
    expect(serviceMocks.createTask).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('todoist_movies_cache')).items).toEqual([newMovie])
  })

  it('does not continue an in-flight watched action after the Todoist token changes', async () => {
    vi.useFakeTimers()
    const movie = { id: 'm1', title: 'Old Account Movie', sectionId: 'movies' }
    const newMovie = { id: 'm2', title: 'New Account Movie', sectionId: 'movies' }
    writeTodoistCache('movies', [movie])
    vi.stubGlobal('confirm', vi.fn(() => true))
    let resolveCompletion
    serviceMocks.completeTask.mockImplementation(() => new Promise(resolve => {
      resolveCompletion = resolve
    }))
    const wrapper = mountApp()
    await flushPromises()

    wrapper.findComponent(MovieCardStub).vm.$emit('watched', movie)
    vi.advanceTimersByTime(5000)
    await Promise.resolve()
    expect(serviceMocks.completeTask).toHaveBeenCalledWith('token', movie.id)

    serviceMocks.fetchMovies.mockResolvedValue([newMovie])
    await wrapper.get('[aria-label="Открыть настройки приложения"]').trigger('click')
    wrapper.findComponent(SettingsModalStub).vm.$emit('save', {
      todoistToken: 'new-token',
      tmdbApiKey: '',
      corsProxy: ''
    })
    await flushPromises()
    resolveCompletion()
    await flushPromises()

    expect(serviceMocks.createTask).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('todoist_movies_cache')).items).toEqual([newMovie])
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

  it('disables book refresh while a read action can still be undone', async () => {
    vi.useFakeTimers()
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

    const refreshButton = wrapper.get('[aria-label="Обновить книги из Todoist"]')
    expect(refreshButton.attributes('disabled')).toBeDefined()
    await refreshButton.trigger('click')
    expect(serviceMocks.fetchBooks).not.toHaveBeenCalled()
  })

  it('removes a read book reintroduced by an already-running refresh after delayed success', async () => {
    vi.useFakeTimers()
    const book = { id: 'b1', title: 'Book', sectionId: 'books' }
    writeTodoistCache('movies', [])
    writeTodoistCache('books', [book])
    vi.stubGlobal('confirm', vi.fn(() => true))
    const wrapper = mountApp()
    await flushPromises()
    await wrapper.get('[aria-label="Показать книги"]').trigger('click')
    await flushPromises()

    let resolveRefresh
    serviceMocks.fetchBooks.mockImplementation(() => new Promise(resolve => {
      resolveRefresh = resolve
    }))
    const bookCard = wrapper.findComponent(BookCardStub)
    wrapper.get('[aria-label="Обновить книги из Todoist"]').trigger('click')
    bookCard.vm.$emit('read', book)
    resolveRefresh([book])
    await flushPromises()
    expect(JSON.parse(localStorage.getItem('todoist_books_cache')).items).toEqual([book])

    await vi.advanceTimersByTimeAsync(5000)
    await flushPromises()

    expect(JSON.parse(localStorage.getItem('todoist_books_cache')).items).toEqual([])
    expect(wrapper.text()).not.toContain('Book')
  })

  it('does not restore an old-account book when an in-flight write fails after a token change', async () => {
    vi.useFakeTimers()
    const book = { id: 'b1', title: 'Old Account Book', sectionId: 'books' }
    const newBook = { id: 'b2', title: 'New Account Book', sectionId: 'books' }
    writeTodoistCache('movies', [])
    writeTodoistCache('books', [book])
    vi.stubGlobal('confirm', vi.fn(() => true))
    let rejectCompletion
    serviceMocks.completeBookTask.mockImplementation(() => new Promise((resolve, reject) => {
      rejectCompletion = reject
    }))
    const wrapper = mountApp()
    await flushPromises()
    await wrapper.get('[aria-label="Показать книги"]').trigger('click')
    await flushPromises()

    wrapper.findComponent(BookCardStub).vm.$emit('read', book)
    vi.advanceTimersByTime(5000)
    await Promise.resolve()
    expect(serviceMocks.completeBookTask).toHaveBeenCalledWith('token', book.id)

    serviceMocks.fetchBooks.mockResolvedValue([newBook])
    await wrapper.get('[aria-label="Открыть настройки приложения"]').trigger('click')
    wrapper.findComponent(SettingsModalStub).vm.$emit('save', {
      todoistToken: 'new-token',
      tmdbApiKey: '',
      corsProxy: ''
    })
    await flushPromises()
    rejectCompletion(new Error('old account write failed'))
    await flushPromises()

    expect(serviceMocks.createBookReviewTask).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('todoist_books_cache')).items).toEqual([newBook])
    expect(wrapper.text()).not.toContain('old account write failed')
  })
})
