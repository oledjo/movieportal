<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { fetchMovies, SECTIONS, SECTION_NAMES } from './services/todoist.js'
import { batchSearchMovies, getPosterUrl, clearTmdbCache } from './services/tmdb.js'
import MovieCard from './components/MovieCard.vue'
import MovieModal from './components/MovieModal.vue'
import FilterBar from './components/FilterBar.vue'
import SettingsModal from './components/SettingsModal.vue'

// State
const movies = ref([])
const posters = ref(new Map())
const loading = ref(true)
const loadingPosters = ref(false)
const postersProgress = ref({ current: 0, total: 0 })
const error = ref(null)
const selectedMovie = ref(null)
const showSettings = ref(false)

// Filters
const searchQuery = ref('')
const selectedSection = ref('all')
const sortBy = ref('default')
const minRating = ref(0)
const movieType = ref('all') // 'all', 'movie', 'series'

// API Keys from localStorage
const todoistToken = ref(localStorage.getItem('todoist_token') || '')
const tmdbApiKey = ref(localStorage.getItem('tmdb_api_key') || '')

// Available sections for filter
const availableSections = computed(() => {
  const sections = new Set(movies.value.map(m => m.sectionId))
  return [
    { id: 'all', name: 'Все' },
    ...Array.from(sections)
      .filter(id => SECTION_NAMES[id])
      .map(id => ({ id, name: SECTION_NAMES[id] }))
  ]
})

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

  // Rating filter
  if (minRating.value > 0) {
    result = result.filter(m => {
      const rating = m.kinopoiskRating || m.imdbRating || 0
      return rating >= minRating.value
    })
  }

  // Sorting
  switch (sortBy.value) {
    case 'rating-desc':
      result.sort((a, b) => {
        const ratingA = a.kinopoiskRating || a.imdbRating || 0
        const ratingB = b.kinopoiskRating || b.imdbRating || 0
        return ratingB - ratingA
      })
      break
    case 'rating-asc':
      result.sort((a, b) => {
        const ratingA = a.kinopoiskRating || a.imdbRating || 0
        const ratingB = b.kinopoiskRating || b.imdbRating || 0
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
      }
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

// Reload posters (clear cache and reload)
async function reloadPosters() {
  if (!tmdbApiKey.value) {
    alert('Сначала укажите TMDB API ключ в настройках')
    return
  }
  clearTmdbCache()
  posters.value.clear()
  await loadPosters()
}

// Save settings
function saveSettings(settings) {
  todoistToken.value = settings.todoistToken
  tmdbApiKey.value = settings.tmdbApiKey
  showSettings.value = false
  loadMovies()
}

// Initial load
onMounted(() => {
  loadMovies()
})
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <h1 class="logo">
          <span class="logo-icon">🍿</span>
          Мои Фильмы
        </h1>
        <div class="header-actions">
          <div class="stats" v-if="!loading && movies.length > 0">
            <span class="stat">
              <strong>{{ stats.filtered }}</strong> из {{ stats.total }}
            </span>
            <span class="stat" v-if="stats.avgRating > 0">
              Средний рейтинг: <strong>{{ stats.avgRating.toFixed(1) }}</strong>
            </span>
          </div>
          <button 
            v-if="!loading && movies.length > 0 && tmdbApiKey" 
            class="reload-posters-btn" 
            @click="reloadPosters" 
            :disabled="loadingPosters"
            title="Перезагрузить постеры"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M8 16H3v5"></path>
            </svg>
          </button>
          <button class="settings-btn" @click="showSettings = true" title="Настройки">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
        <p>Загрузка фильмов...</p>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="error-container">
        <p class="error-message">{{ error }}</p>
        <button class="retry-btn" @click="loadMovies">Попробовать снова</button>
      </div>

      <!-- Content -->
      <template v-else>
        <!-- Filter bar -->
        <FilterBar
          v-model:search="searchQuery"
          v-model:section="selectedSection"
          v-model:sort="sortBy"
          v-model:minRating="minRating"
          v-model:movieType="movieType"
          :sections="availableSections"
        />

        <!-- Posters loading indicator -->
        <div v-if="loadingPosters" class="posters-loading">
          <div class="posters-progress">
            <div
              class="posters-progress-bar"
              :style="{ width: `${(postersProgress.current / postersProgress.total) * 100}%` }"
            ></div>
          </div>
          <span>Загрузка постеров: {{ postersProgress.current }} / {{ postersProgress.total }}</span>
        </div>

        <!-- Movies grid -->
        <div class="movies-grid" v-if="filteredMovies.length > 0">
          <MovieCard
            v-for="movie in filteredMovies"
            :key="movie.id"
            :movie="movie"
            :poster="getMoviePoster(movie.id)"
            :tmdb="getMovieTmdbData(movie.id)"
            @click="openMovie(movie)"
          />
        </div>

        <!-- Empty state -->
        <div v-else class="empty-container">
          <p>Фильмы не найдены</p>
          <p class="empty-hint" v-if="searchQuery || selectedSection !== 'all' || minRating > 0">
            Попробуйте изменить фильтры
          </p>
        </div>
      </template>
    </main>

    <!-- Movie modal -->
    <MovieModal
      v-if="selectedMovie"
      :movie="selectedMovie"
      @close="closeMovie"
    />

    <!-- Settings modal -->
    <SettingsModal
      v-if="showSettings"
      :todoist-token="todoistToken"
      :tmdb-api-key="tmdbApiKey"
      @save="saveSettings"
      @close="showSettings = false"
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.stats {
  display: flex;
  gap: 1.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
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

.error-message {
  color: var(--accent);
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

  .stats {
    display: none;
  }

  .main {
    padding: 1rem;
  }

  .movies-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }
}
</style>
