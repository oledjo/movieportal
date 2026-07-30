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
    vi.unstubAllGlobals()
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
})
