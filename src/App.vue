<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { fetchMovies, completeTask, createTask, updateTaskDueDate, SECTIONS, SECTION_NAMES } from './services/todoist.js'
import { batchSearchMovies, getPosterUrl, clearTmdbCache, saveCacheToStorage } from './services/tmdb.js'
import { fetchBooks, completeBookTask, createBookReviewTask, clearBooksCache } from './services/books.js'
import { batchSearchBooks, getBookCoverUrl, clearOpenLibCache } from './services/openlib.js'
import MovieCard from './components/MovieCard.vue'
import MovieModal from './components/MovieModal.vue'
import BookCard from './components/BookCard.vue'
import BookModal from './components/BookModal.vue'
import FilterBar from './components/FilterBar.vue'
import SettingsModal from './components/SettingsModal.vue'
import ToastNotification from './components/ToastNotification.vue'

// Content mode: 'movies' or 'books'
const contentMode = ref(localStorage.getItem('content_mode') || 'movies')

// Watch content mode changes
watch(contentMode, (newMode) => {
  localStorage.setItem('content_mode', newMode)
  loadContent()
})

// State
const movies = ref([])
const books = ref([])
const posters = ref(new Map())
const bookCovers = ref(new Map())
const loading = ref(true)
const loadingPosters = ref(false)
const postersProgress = ref({ current: 0, total: 0 })
const error = ref(null)
const selectedMovie = ref(null)
const selectedBook = ref(null)
const showSettings = ref(false)

// Toast notification state
const toast = ref({
  show: false,
  message: '',
  type: 'success',
  actionText: null,
  actionCallback: null
})

// Undo state for watched movies
const pendingWatched = ref(null)
let watchedTimeout = null

function showToast(message, type = 'success', actionText = null, actionCallback = null) {
  toast.value = { show: true, message, type, actionText, actionCallback }
}

function hideToast() {
  toast.value.show = false
}

// Button loading states
const watchedLoading = ref(false)
const scheduleLoading = ref(false)

// Load saved filters from localStorage
const savedFilters = JSON.parse(localStorage.getItem('movie_filters') || '{}')

// Filters
const searchQuery = ref(savedFilters.searchQuery || '')
const selectedSection = ref(savedFilters.selectedSection || 'all')
const sortBy = ref(savedFilters.sortBy || 'default')
const minRating = ref(savedFilters.minRating || 0)
const movieType = ref(savedFilters.movieType || 'all') // 'all', 'movie', 'series'
const selectedProvider = ref(savedFilters.selectedProvider || 'all') // Filter by streaming platform
const minDuration = ref(savedFilters.minDuration || 0) // Minimum duration in minutes
const maxDuration = ref(savedFilters.maxDuration ?? 300) // Maximum duration in minutes (5 hours)
const scheduledFilter = ref(savedFilters.scheduledFilter || 'all') // 'all', 'scheduled', 'not-scheduled'

// Save filters to localStorage when they change
watch(
  [searchQuery, selectedSection, sortBy, minRating, movieType, selectedProvider, minDuration, maxDuration, scheduledFilter],
  () => {
    localStorage.setItem('movie_filters', JSON.stringify({
      searchQuery: searchQuery.value,
      selectedSection: selectedSection.value,
      sortBy: sortBy.value,
      minRating: minRating.value,
      movieType: movieType.value,
      selectedProvider: selectedProvider.value,
      minDuration: minDuration.value,
      maxDuration: maxDuration.value,
      scheduledFilter: scheduledFilter.value
    }))
  }
)

// API Keys from localStorage
const todoistToken = ref(localStorage.getItem('todoist_token') || '')
const tmdbApiKey = ref(localStorage.getItem('tmdb_api_key') || '')

// Available sections for filter
const availableSections = computed(() => {
  const sections = new Set(movies.value.map(m => m.sectionId))
  const sectionList = [
    { id: 'all', name: 'Все' }
  ]
  
  // Add sections from movies
  Array.from(sections).forEach(id => {
    const name = SECTION_NAMES[id]
    if (name) {
      sectionList.push({ id, name })
    } else {
      // If section name not found in constants, try to get from actual sections
      // or use sectionId as fallback
      const movie = movies.value.find(m => m.sectionId === id)
      if (movie && movie.sectionName && movie.sectionName !== 'Другое') {
        sectionList.push({ id, name: movie.sectionName })
      }
    }
  })
  
  // Remove duplicates by id
  const uniqueSections = []
  const seenIds = new Set()
  sectionList.forEach(sec => {
    if (!seenIds.has(sec.id)) {
      seenIds.add(sec.id)
      uniqueSections.push(sec)
    }
  })
  
  return uniqueSections.length > 1 ? uniqueSections : [
    { id: 'all', name: 'Все' },
    { id: '65CW5hwj3GQG3PCF', name: 'Фильмы' },
    { id: '65CVq4gf6VxMW5jm', name: 'Сериалы' },
    { id: '6W4Gvr7pfmMVpJ2m', name: 'Смотрю сейчас' }
  ]
})

// Allowed provider IDs (Netflix + Russian platforms)
// Netflix: 8, Кинопоиск HD: 283, Okko: 115, Ivi: 111, Premier: 113, Megogo: 507, Wink: 501, more.tv: 502
const ALLOWED_PROVIDER_IDS = new Set([
  8,    // Netflix
  283,  // Кинопоиск HD
  115,  // Okko
  111,  // Ivi
  113,  // Premier
  507,  // Megogo
  501,  // Wink
  502,  // more.tv
  117,  // Okko (альтернативный ID)
  119,  // KinoPoisk
  420,  // Кинопоиск
  425   // Кинопоиск HD (альтернативный)
])

// Allowed provider names (for fallback matching)
const ALLOWED_PROVIDER_NAMES = [
  'netflix',
  'кинопоиск',
  'okko',
  'ivi',
  'premier',
  'megogo',
  'wink',
  'more.tv',
  'amedia',
  'amediateka'
]

function isProviderAllowed(provider) {
  // Check by ID first
  if (ALLOWED_PROVIDER_IDS.has(provider.id)) {
    return true
  }
  
  // Check by name (case-insensitive, partial match)
  const providerNameLower = provider.name.toLowerCase()
  return ALLOWED_PROVIDER_NAMES.some(allowedName => 
    providerNameLower.includes(allowedName)
  )
}

// Available providers for filter (extract from all movies, filtered)
const availableProviders = computed(() => {
  const providerMap = new Map()
  
  movies.value.forEach(movie => {
    const providers = getMovieTmdbData(movie.id)?.watchProviders
    if (!providers) return
    
    const allProviders = [
      ...(providers.flatrate || []),
      ...(providers.rent || []),
      ...(providers.buy || [])
    ]
    
    allProviders.forEach(provider => {
      // Only add allowed providers
      if (isProviderAllowed(provider) && !providerMap.has(provider.id)) {
        providerMap.set(provider.id, provider)
      }
    })
  })
  
  // Sort by name alphabetically
  return Array.from(providerMap.values())
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
})

// Helper function to get movie rating (outside computed for reuse)
function getMovieRating(movie) {
  // Priority: Kinopoisk > IMDb > TMDB
  if (movie.kinopoiskRating) return movie.kinopoiskRating
  if (movie.imdbRating) return movie.imdbRating
  const tmdbData = getMovieTmdbData(movie.id)
  if (tmdbData?.voteAverage) {
    // TMDB uses 0-10 scale, same as our ratings
    return tmdbData.voteAverage
  }
  return null // Use null instead of 0 to distinguish "no rating" from "rating is 0"
}

// Filtered and sorted movies
const filteredMovies = computed(() => {
  let result = [...movies.value]

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(m =>
      m.title.toLowerCase().includes(query) ||
      (m.director && m.director.toLowerCase().includes(query)) ||
      (m.reason && m.reason.toLowerCase().includes(query))
    )
  }

  // Movie Type filter (сериал/фильм)
  if (movieType.value !== 'all') {
    if (movieType.value === 'series') {
      result = result.filter(m => m.isSeries === true)
    } else if (movieType.value === 'movie') {
      result = result.filter(m => m.isSeries !== true)
    }
  }

  // Section filter
  if (selectedSection.value !== 'all') {
    result = result.filter(m => m.sectionId === selectedSection.value)
  }

  // Provider filter (streaming platform)
  if (selectedProvider.value !== 'all') {
    const providerId = parseInt(selectedProvider.value)
    result = result.filter(m => {
      const providers = getMovieTmdbData(m.id)?.watchProviders
      if (!providers) return false
      
      // Check if provider exists in flatrate, rent, or buy
      const allProviders = [
        ...(providers.flatrate || []),
        ...(providers.rent || []),
        ...(providers.buy || [])
      ]
      return allProviders.some(p => p.id === providerId)
    })
  }

  // Rating filter
  if (minRating.value > 0) {
    result = result.filter(m => {
      const rating = getMovieRating(m)
      return rating !== null && rating >= minRating.value
    })
  }

  // Duration filter (uses TMDB runtime only)
  if (minDuration.value > 0 || maxDuration.value < 300) {
    result = result.filter(m => {
      const tmdbData = getMovieTmdbData(m.id)
      const duration = tmdbData?.details?.runtime || null

      // If no duration available, include it (don't filter out)
      if (!duration || duration === 0) return true

      // Check if duration is within range
      return duration >= minDuration.value && duration <= maxDuration.value
    })
  }

  // Scheduled filter
  if (scheduledFilter.value === 'scheduled') {
    result = result.filter(m => m.dueDate)
  } else if (scheduledFilter.value === 'not-scheduled') {
    result = result.filter(m => !m.dueDate)
  }

  // Sorting
  switch (sortBy.value) {
    case 'rating-desc':
      result.sort((a, b) => {
        const ratingA = getMovieRating(a)
        const ratingB = getMovieRating(b)
        
        // Both have no rating - keep original order
        if (ratingA === null && ratingB === null) return 0
        
        // Movies without rating go to the end
        if (ratingA === null) return 1
        if (ratingB === null) return -1
        
        // Sort by rating descending
        return ratingB - ratingA
      })
      break
    case 'rating-asc':
      result.sort((a, b) => {
        const ratingA = getMovieRating(a)
        const ratingB = getMovieRating(b)
        
        // Both have no rating - keep original order
        if (ratingA === null && ratingB === null) return 0
        
        // Movies without rating go to the end
        if (ratingA === null) return 1
        if (ratingB === null) return -1
        
        // Sort by rating ascending
        return ratingA - ratingB
      })
      break
    case 'title-asc':
      result.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
      break
    case 'title-desc':
      result.sort((a, b) => b.title.localeCompare(a.title, 'ru'))
      break
    case 'year-desc':
      result.sort((a, b) => (b.year || 0) - (a.year || 0))
      break
    case 'year-asc':
      result.sort((a, b) => (a.year || 0) - (b.year || 0))
      break
  }

  return result
})

// Stats
const stats = computed(() => ({
  total: movies.value.length,
  filtered: filteredMovies.value.length,
  withRating: movies.value.filter(m => m.kinopoiskRating || m.imdbRating).length,
  avgRating: movies.value.reduce((sum, m) => {
    const rating = m.kinopoiskRating || m.imdbRating || 0
    return sum + rating
  }, 0) / movies.value.filter(m => m.kinopoiskRating || m.imdbRating).length || 0
}))

// Load content based on mode
async function loadContent() {
  if (contentMode.value === 'movies') {
    await loadMovies()
  } else {
    await loadBooks()
  }
}

// Load movies
async function loadMovies() {
  if (!todoistToken.value) {
    loading.value = false
    showSettings.value = true
    return
  }

  loading.value = true
  error.value = null

  try {
    movies.value = await fetchMovies(todoistToken.value)
    localStorage.setItem('todoist_token', todoistToken.value)

    // Load posters if TMDB key is available
    if (tmdbApiKey.value) {
      await loadPosters()
    }
  } catch (e) {
    error.value = e.message
    console.error('Error loading movies:', e)
  } finally {
    loading.value = false
  }
}

// Load books
async function loadBooks() {
  if (!todoistToken.value) {
    loading.value = false
    showSettings.value = true
    return
  }

  loading.value = true
  error.value = null

  try {
    books.value = await fetchBooks(todoistToken.value)
    localStorage.setItem('todoist_token', todoistToken.value)

    // Load book covers
    await loadBookCovers()
  } catch (e) {
    error.value = e.message
    console.error('Error loading books:', e)
  } finally {
    loading.value = false
  }
}

// Load book covers from Open Library
async function loadBookCovers() {
  if (books.value.length === 0) return

  loadingPosters.value = true
  postersProgress.value = { current: 0, total: books.value.length }

  try {
    const results = await batchSearchBooks(
      books.value,
      (current, total) => {
        postersProgress.value = { current, total }
      }
    )
    bookCovers.value = results

    let found = 0
    results.forEach((v) => { if (v && v.coverId) found++ })
    console.log(`Book covers loaded: ${found}/${books.value.length} found`)
  } catch (e) {
    console.error('Error loading book covers:', e)
  } finally {
    loadingPosters.value = false
  }
}

// Get book cover
function getBookCover(bookId) {
  const openLibData = bookCovers.value.get(bookId)
  return getBookCoverUrl(openLibData, 'M')
}

// Get Open Library data for a book
function getBookOpenLibData(bookId) {
  return bookCovers.value.get(bookId) || null
}

// Open book details
function openBook(book) {
  selectedBook.value = {
    ...book,
    cover: getBookCover(book.id),
    openlib: getBookOpenLibData(book.id)
  }
}

// Close book modal
function closeBook() {
  selectedBook.value = null
}

// Load posters from TMDB
async function loadPosters() {
  console.log('loadPosters called, TMDB key:', tmdbApiKey.value ? 'present' : 'missing', 'movies:', movies.value.length)

  if (!tmdbApiKey.value || movies.value.length === 0) {
    console.warn('Skipping poster load: no API key or no movies')
    return
  }

  loadingPosters.value = true
  postersProgress.value = { current: 0, total: movies.value.length }

  try {
    localStorage.setItem('tmdb_api_key', tmdbApiKey.value)
    const results = await batchSearchMovies(
      movies.value,
      tmdbApiKey.value,
      (current, total) => {
        postersProgress.value = { current, total }
      },
      true // Fetch details (now optimized with parallel batches)
    )
    posters.value = results

    // Count successful poster loads
    let found = 0
    results.forEach((v) => { if (v && v.posterPath) found++ })
    console.log(`Posters loaded: ${found}/${movies.value.length} found`)
  } catch (e) {
    console.error('Error loading posters:', e)
  } finally {
    loadingPosters.value = false
  }
}

// Get poster for a movie
function getMoviePoster(movieId) {
  const tmdbData = posters.value.get(movieId)
  if (tmdbData && tmdbData.posterPath) {
    return getPosterUrl(tmdbData.posterPath, 'medium')
  }
  return null
}

// Get TMDB data for a movie
function getMovieTmdbData(movieId) {
  return posters.value.get(movieId) || null
}

// Open movie details
function openMovie(movie) {
  selectedMovie.value = {
    ...movie,
    poster: getMoviePoster(movie.id),
    tmdb: getMovieTmdbData(movie.id)
  }
}

// Close movie modal
function closeMovie() {
  selectedMovie.value = null
}

// Mark movie as watched with undo support
async function handleWatched(movie) {
  if (!todoistToken.value) {
    showToast('Для отметки просмотра нужен Todoist API токен. Откройте настройки.', 'error', 'Настройки', () => {
      hideToast()
      showSettings.value = true
    })
    return
  }

  // Confirmation dialog
  const confirmed = confirm(`Отметить «${movie.title}» как просмотренный?\n\nБудет создана задача «Написать отзыв на фильм».`)
  if (!confirmed) return

  watchedLoading.value = true

  try {
    // Store movie for potential undo
    const movieToRemove = { ...movie }

    // Remove movie from local list immediately (optimistic update)
    movies.value = movies.value.filter(m => m.id !== movie.id)

    // Close modal if this movie was open
    if (selectedMovie.value && selectedMovie.value.id === movie.id) {
      selectedMovie.value = null
    }

    // Show toast with undo option
    pendingWatched.value = movieToRemove
    clearTimeout(watchedTimeout)

    showToast(
      `«${movie.title}» отмечен как просмотренный`,
      'success',
      'Отменить',
      () => {
        // Undo action
        clearTimeout(watchedTimeout)
        movies.value = [movieToRemove, ...movies.value]
        pendingWatched.value = null
        hideToast()
        showToast('Действие отменено', 'info')
      }
    )

    // Complete action after delay (allows undo)
    watchedTimeout = setTimeout(async () => {
      if (pendingWatched.value && pendingWatched.value.id === movieToRemove.id) {
        try {
          await completeTask(todoistToken.value, movieToRemove.id)
          await createTask(todoistToken.value, `Написать отзыв на фильм «${movieToRemove.title}»`)
          pendingWatched.value = null
        } catch (e) {
          console.error('Error completing task:', e)
          // Restore movie on error
          movies.value = [movieToRemove, ...movies.value]
          showToast('Ошибка при сохранении: ' + e.message, 'error')
        }
      }
    }, 5000)
  } catch (e) {
    console.error('Error marking movie as watched:', e)
    showToast('Ошибка при отметке просмотра: ' + e.message, 'error')
  } finally {
    watchedLoading.value = false
  }
}

// Schedule movie viewing date
async function handleSchedule({ movie, date }) {
  if (!todoistToken.value) {
    showToast('Для планирования нужен Todoist API токен. Откройте настройки.', 'error', 'Настройки', () => {
      hideToast()
      showSettings.value = true
    })
    return
  }

  scheduleLoading.value = true

  try {
    // Update due date in Todoist
    await updateTaskDueDate(todoistToken.value, movie.id, date)

    // Update local movie data
    const movieIndex = movies.value.findIndex(m => m.id === movie.id)
    if (movieIndex !== -1) {
      movies.value[movieIndex].dueDate = date
    }

    // Update selected movie if open
    if (selectedMovie.value && selectedMovie.value.id === movie.id) {
      selectedMovie.value = { ...selectedMovie.value, dueDate: date }
    }

    // Show success toast
    if (date) {
      const dateObj = new Date(date)
      const formattedDate = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
      showToast(`«${movie.title}» запланирован на ${formattedDate}`, 'success')
    } else {
      showToast(`Дата просмотра «${movie.title}» убрана`, 'info')
    }
  } catch (e) {
    console.error('Error scheduling movie:', e)
    showToast('Ошибка при планировании: ' + e.message, 'error')
  } finally {
    scheduleLoading.value = false
  }
}

// Reload posters (clear cache and reload)
async function reloadPosters() {
  if (contentMode.value === 'movies') {
    if (!tmdbApiKey.value) {
      showToast('Сначала укажите TMDB API ключ в настройках', 'error', 'Настройки', () => {
        hideToast()
        showSettings.value = true
      })
      return
    }
    clearTmdbCache()
    posters.value.clear()
    await loadPosters()
    showToast('Постеры перезагружены', 'success')
  } else {
    clearOpenLibCache()
    bookCovers.value.clear()
    await loadBookCovers()
    showToast('Обложки перезагружены', 'success')
  }
}

// Mark book as read with undo support
async function handleBookRead(book) {
  if (!todoistToken.value) {
    showToast('Для отметки прочтения нужен Todoist API токен. Откройте настройки.', 'error', 'Настройки', () => {
      hideToast()
      showSettings.value = true
    })
    return
  }

  const confirmed = confirm(`Отметить «${book.title}» как прочитанную?\n\nБудет создана задача «Написать отзыв на книгу».`)
  if (!confirmed) return

  watchedLoading.value = true

  try {
    const bookToRemove = { ...book }

    // Remove book from local list immediately
    books.value = books.value.filter(b => b.id !== book.id)

    // Close modal if this book was open
    if (selectedBook.value && selectedBook.value.id === book.id) {
      selectedBook.value = null
    }

    // Show toast with undo option
    pendingWatched.value = bookToRemove
    clearTimeout(watchedTimeout)

    showToast(
      `«${book.title}» отмечена как прочитанная`,
      'success',
      'Отменить',
      () => {
        clearTimeout(watchedTimeout)
        books.value = [bookToRemove, ...books.value]
        pendingWatched.value = null
        hideToast()
        showToast('Действие отменено', 'info')
      }
    )

    // Complete action after delay
    watchedTimeout = setTimeout(async () => {
      if (pendingWatched.value && pendingWatched.value.id === bookToRemove.id) {
        try {
          await completeBookTask(todoistToken.value, bookToRemove.id)
          await createBookReviewTask(todoistToken.value, bookToRemove.title)
          pendingWatched.value = null
        } catch (e) {
          console.error('Error completing book task:', e)
          books.value = [bookToRemove, ...books.value]
          showToast('Ошибка при сохранении: ' + e.message, 'error')
        }
      }
    }, 5000)
  } catch (e) {
    console.error('Error marking book as read:', e)
    showToast('Ошибка при отметке прочтения: ' + e.message, 'error')
  } finally {
    watchedLoading.value = false
  }
}

// Save settings
function saveSettings(settings) {
  todoistToken.value = settings.todoistToken
  tmdbApiKey.value = settings.tmdbApiKey
  showSettings.value = false
  loadContent()
}

// Computed properties for books filtering
const filteredBooks = computed(() => {
  let result = [...books.value]

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(b =>
      b.title.toLowerCase().includes(query) ||
      (b.author && b.author.toLowerCase().includes(query)) ||
      (b.reason && b.reason.toLowerCase().includes(query))
    )
  }

  // Section filter
  if (selectedSection.value !== 'all') {
    result = result.filter(b => b.sectionId === selectedSection.value)
  }

  // Rating filter (for books, use livilibRating or goodreadsRating)
  if (minRating.value > 0) {
    result = result.filter(b => {
      const rating = b.livilibRating || b.goodreadsRating || b.openlib?.ratingsAverage
      // Books use 5-point scale, so convert minRating from 10-point to 5-point
      const minRatingConverted = minRating.value / 2
      return rating !== null && rating >= minRatingConverted
    })
  }

  // Sorting
  switch (sortBy.value) {
    case 'rating-desc':
      result.sort((a, b) => {
        const ratingA = a.livilibRating || a.goodreadsRating || 0
        const ratingB = b.livilibRating || b.goodreadsRating || 0
        return ratingB - ratingA
      })
      break
    case 'rating-asc':
      result.sort((a, b) => {
        const ratingA = a.livilibRating || a.goodreadsRating || 0
        const ratingB = b.livilibRating || b.goodreadsRating || 0
        return ratingA - ratingB
      })
      break
    case 'title-asc':
      result.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
      break
    case 'title-desc':
      result.sort((a, b) => b.title.localeCompare(a.title, 'ru'))
      break
    case 'year-desc':
      result.sort((a, b) => (b.year || 0) - (a.year || 0))
      break
    case 'year-asc':
      result.sort((a, b) => (a.year || 0) - (b.year || 0))
      break
  }

  return result
})

// Stats for books
const booksStats = computed(() => ({
  total: books.value.length,
  filtered: filteredBooks.value.length,
  withRating: books.value.filter(b => b.livilibRating || b.goodreadsRating).length,
  avgRating: books.value.reduce((sum, b) => {
    const rating = b.livilibRating || b.goodreadsRating || 0
    return sum + rating
  }, 0) / books.value.filter(b => b.livilibRating || b.goodreadsRating).length || 0
}))

// Available sections for books
const availableBookSections = computed(() => {
  const sections = new Set(books.value.map(b => b.sectionId))
  const sectionList = [{ id: 'all', name: 'Все' }]

  Array.from(sections).forEach(id => {
    const book = books.value.find(b => b.sectionId === id)
    if (book && book.sectionName && book.sectionName !== 'Другое') {
      sectionList.push({ id, name: book.sectionName })
    }
  })

  return sectionList
})

// Current stats based on mode
const currentStats = computed(() => {
  return contentMode.value === 'movies' ? stats : booksStats
})

// Current items count
const currentItemsCount = computed(() => {
  return contentMode.value === 'movies' ? movies.value.length : books.value.length
})

// Current filtered count
const currentFilteredCount = computed(() => {
  return contentMode.value === 'movies' ? filteredMovies.value.length : filteredBooks.value.length
})

// Initial load
onMounted(() => {
  loadContent()
})
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <div class="header-left">
          <h1 class="logo">
            <span class="logo-icon">{{ contentMode === 'movies' ? '🍿' : '📚' }}</span>
            {{ contentMode === 'movies' ? 'Мои Фильмы' : 'Мои Книги' }}
          </h1>
          <!-- Content mode switcher -->
          <div class="mode-switcher">
            <button
              :class="['mode-btn', { active: contentMode === 'movies' }]"
              @click="contentMode = 'movies'"
              aria-label="Показать фильмы"
            >
              <span class="mode-icon">🍿</span>
              <span class="mode-text">Фильмы</span>
            </button>
            <button
              :class="['mode-btn', { active: contentMode === 'books' }]"
              @click="contentMode = 'books'"
              aria-label="Показать книги"
            >
              <span class="mode-icon">📚</span>
              <span class="mode-text">Книги</span>
            </button>
          </div>
        </div>
        <div class="header-actions">
          <!-- Desktop stats -->
          <div class="stats stats-desktop" v-if="!loading && currentItemsCount > 0">
            <span class="stat">
              <strong>{{ currentStats.value.filtered }}</strong> из {{ currentStats.value.total }}
            </span>
            <span class="stat" v-if="currentStats.value.avgRating > 0">
              Средний рейтинг: <strong>{{ currentStats.value.avgRating.toFixed(1) }}</strong>
            </span>
          </div>
          <!-- Mobile stats badge -->
          <div class="stats-mobile" v-if="!loading && currentItemsCount > 0">
            <span class="stats-badge">{{ currentStats.value.filtered }}/{{ currentStats.value.total }}</span>
          </div>
          <button
            v-if="!loading && currentItemsCount > 0 && (contentMode === 'books' || tmdbApiKey)"
            class="reload-posters-btn"
            @click="reloadPosters"
            :disabled="loadingPosters"
            :class="{ 'loading': loadingPosters }"
            :title="contentMode === 'movies' ? 'Перезагрузить постеры' : 'Перезагрузить обложки'"
            :aria-label="contentMode === 'movies' ? 'Перезагрузить постеры фильмов' : 'Перезагрузить обложки книг'"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M8 16H3v5"></path>
            </svg>
          </button>
          <button
            class="settings-btn"
            @click="showSettings = true"
            title="Настройки"
            aria-label="Открыть настройки приложения"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="main">
      <!-- Loading state -->
      <div v-if="loading" class="loading-container">
        <div class="loader"></div>
        <p>{{ contentMode === 'movies' ? 'Загрузка фильмов...' : 'Загрузка книг...' }}</p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="error-container">
        <div class="error-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <p class="error-message">{{ error }}</p>
        <div class="error-actions">
          <button class="retry-btn" @click="loadMovies">Попробовать снова</button>
          <button class="settings-link-btn" @click="showSettings = true">Проверить настройки</button>
        </div>
      </div>

      <!-- Content -->
      <template v-else>
        <!-- Filter bar (movies mode) -->
        <FilterBar
          v-if="contentMode === 'movies'"
          v-model:search="searchQuery"
          v-model:section="selectedSection"
          v-model:sort="sortBy"
          v-model:minRating="minRating"
          v-model:movieType="movieType"
          v-model:provider="selectedProvider"
          v-model:minDuration="minDuration"
          v-model:maxDuration="maxDuration"
          v-model:scheduledFilter="scheduledFilter"
          :sections="availableSections"
          :providers="availableProviders"
        />

        <!-- Filter bar (books mode) - simplified -->
        <FilterBar
          v-else
          v-model:search="searchQuery"
          v-model:section="selectedSection"
          v-model:sort="sortBy"
          v-model:minRating="minRating"
          :sections="availableBookSections"
          :providers="[]"
          movie-type="all"
          :hide-movie-filters="true"
        />

        <!-- Posters/Covers loading indicator -->
        <div v-if="loadingPosters" class="posters-loading">
          <div class="posters-progress">
            <div
              class="posters-progress-bar"
              :style="{ width: `${(postersProgress.current / postersProgress.total) * 100}%` }"
            ></div>
          </div>
          <span>{{ contentMode === 'movies' ? 'Загрузка постеров' : 'Загрузка обложек' }}: {{ postersProgress.current }} / {{ postersProgress.total }}</span>
        </div>

        <!-- Movies grid -->
        <template v-if="contentMode === 'movies'">
          <div class="movies-grid" v-if="filteredMovies.length > 0">
            <MovieCard
              v-for="movie in filteredMovies"
              :key="movie.id"
              :movie="movie"
              :poster="getMoviePoster(movie.id)"
              :tmdb="getMovieTmdbData(movie.id)"
              @click="openMovie(movie)"
              @watched="handleWatched"
              @schedule="handleSchedule"
            />
          </div>

          <div v-else class="empty-container">
            <p>Фильмы не найдены</p>
            <p class="empty-hint" v-if="searchQuery || selectedSection !== 'all' || minRating > 0">
              Попробуйте изменить фильтры
            </p>
          </div>
        </template>

        <!-- Books grid -->
        <template v-else>
          <div class="movies-grid" v-if="filteredBooks.length > 0">
            <BookCard
              v-for="book in filteredBooks"
              :key="book.id"
              :book="{ ...book, openlib: getBookOpenLibData(book.id) }"
              @click="openBook(book)"
              @read="handleBookRead"
            />
          </div>

          <div v-else class="empty-container">
            <p>Книги не найдены</p>
            <p class="empty-hint" v-if="searchQuery || selectedSection !== 'all' || minRating > 0">
              Попробуйте изменить фильтры
            </p>
          </div>
        </template>
      </template>
    </main>

    <!-- Movie modal -->
    <MovieModal
      v-if="selectedMovie"
      :movie="selectedMovie"
      @close="closeMovie"
      @watched="handleWatched"
      @schedule="handleSchedule"
    />

    <!-- Book modal -->
    <BookModal
      v-if="selectedBook"
      :book="selectedBook"
      @close="closeBook"
      @read="handleBookRead"
    />

    <!-- Settings modal -->
    <SettingsModal
      v-if="showSettings"
      :todoist-token="todoistToken"
      :tmdb-api-key="tmdbApiKey"
      @save="saveSettings"
      @close="showSettings = false"
    />

    <!-- Toast notifications -->
    <ToastNotification
      :show="toast.show"
      :message="toast.message"
      :type="toast.type"
      :action-text="toast.actionText"
      :action-callback="toast.actionCallback"
      @close="hideToast"
      @action="toast.actionCallback && toast.actionCallback()"
    />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  max-width: 1600px;
  margin: 0 auto;
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.logo {
  font-size: 1.5rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-icon {
  font-size: 1.8rem;
}

.mode-switcher {
  display: flex;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 0.25rem;
  gap: 0.25rem;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-normal);
  font-size: 0.9rem;
  font-weight: 500;
}

.mode-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}

.mode-btn.active {
  background: var(--accent);
  color: white;
}

.mode-icon {
  font-size: 1.1rem;
}

.mode-text {
  display: block;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.stats-desktop {
  display: flex;
  gap: 1.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.stats-mobile {
  display: none;
}

.stats-badge {
  padding: 0.375rem 0.75rem;
  background: var(--bg-card);
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
}

.stat strong {
  color: var(--text-primary);
}

.reload-posters-btn,
.settings-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reload-posters-btn:hover:not(:disabled),
.settings-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.reload-posters-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.main {
  flex: 1;
  max-width: 1600px;
  margin: 0 auto;
  padding: 2rem;
  width: 100%;
}

.loading-container,
.error-container,
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: 1rem;
  color: var(--text-secondary);
}

.loader {
  width: 48px;
  height: 48px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-icon {
  color: var(--accent);
  margin-bottom: 0.5rem;
}

.error-message {
  color: var(--accent);
  text-align: center;
  max-width: 400px;
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.retry-btn {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: var(--accent-hover);
}

.settings-link-btn {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.settings-link-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.reload-posters-btn.loading svg {
  animation: spin 1s linear infinite;
}

.empty-hint {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.posters-loading {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.posters-progress {
  flex: 1;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.posters-progress-bar {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s;
}

.movies-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .header-content {
    padding: 1rem;
    flex-wrap: wrap;
  }

  .header-left {
    width: 100%;
    justify-content: space-between;
    gap: 1rem;
  }

  .logo {
    font-size: 1.25rem;
  }

  .mode-switcher {
    padding: 0.125rem;
  }

  .mode-btn {
    padding: 0.375rem 0.625rem;
    font-size: 0.8rem;
  }

  .mode-text {
    display: none;
  }

  .stats-desktop {
    display: none;
  }

  .stats-mobile {
    display: block;
  }

  .main {
    padding: 1rem;
  }

  .movies-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }

  .error-actions {
    flex-direction: column;
    width: 100%;
  }

  .retry-btn,
  .settings-link-btn {
    width: 100%;
    text-align: center;
  }
}
</style>
