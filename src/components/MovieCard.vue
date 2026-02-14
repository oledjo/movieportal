<script setup>
import { computed } from 'vue'
import { getProviderLogoUrl } from '../services/tmdb.js'

const props = defineProps({
  movie: {
    type: Object,
    required: true
  },
  poster: {
    type: String,
    default: null
  },
  tmdb: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['click', 'watched', 'schedule'])

const dueDateFormatted = computed(() => {
  if (!props.movie.dueDate) return null
  const date = new Date(props.movie.dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date.toDateString() === today.toDateString()) {
    return 'Сегодня'
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Завтра'
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
})

function handleScheduleClick(e) {
  e.stopPropagation()
  if (e.target.tagName === 'INPUT') return
  const btn = e.currentTarget
  const hiddenInput = btn.querySelector('input[type="date"]')
  if (hiddenInput) {
    try {
      hiddenInput.showPicker()
    } catch {
      hiddenInput.click()
    }
  }
}

function handleDateChange(e) {
  e.stopPropagation()
  const date = e.target.value
  emit('schedule', { movie: props.movie, date: date || null })
}

const rating = computed(() => {
  return props.movie.kinopoiskRating || props.movie.imdbRating || null
})

const ratingColor = computed(() => {
  if (!rating.value) return 'var(--text-muted)'
  if (rating.value >= 8) return '#22c55e' // Darker green for better contrast
  if (rating.value >= 7) return '#ca8a04' // Darker yellow/amber for WCAG compliance
  if (rating.value >= 6) return '#ea580c' // Darker orange
  return '#dc2626' // Darker red
})

const ratingLabel = computed(() => {
  if (!rating.value) return ''
  if (rating.value >= 8) return 'Отлично'
  if (rating.value >= 7) return 'Хорошо'
  if (rating.value >= 6) return 'Нормально'
  return 'Низкий'
})

const durationFormatted = computed(() => {
  const mins = props.tmdb?.details?.runtime
  if (!mins) return null
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  if (hours > 0) {
    return minutes > 0 ? `${hours}ч ${minutes}м` : `${hours}ч`
  }
  return `${minutes}м`
})

const sectionBadge = computed(() => {
  const section = props.movie.sectionName
  const sectionId = props.movie.sectionId
  
  // Debug logging for troubleshooting
  if (props.movie.title && (props.movie.title.includes('Когда они увидят нас') || props.movie.title.includes('When They See Us'))) {
    console.log('🔍 MovieCard debug:', {
      title: props.movie.title,
      sectionName: section,
      sectionId: sectionId,
      isSeries: props.movie.isSeries,
      sectionIdMatch: sectionId === '65CVq4gf6VxMW5jm',
      sectionNameMatch: section === 'Сериалы',
      fullMovie: props.movie
    })
  }
  
  if (section === 'Смотрю сейчас') return { text: 'Смотрю', color: '#4ade80' }
  
  // Check if it's in Сериалы section - use sectionId for reliable check
  const SERIES_SECTION_ID = '65CVq4gf6VxMW5jm' // Сериалы section ID from SECTIONS.SERIES
  const isInSeriesSection = sectionId === SERIES_SECTION_ID
  
  // Show "Сериал" badge if in Сериалы section OR isSeries flag is true
  // Priority: sectionId check first (most reliable)
  if (isInSeriesSection || props.movie.isSeries || section === 'Сериалы') {
    return { text: 'Сериал', color: '#60a5fa' }
  }
  
  if (section === '25 главных фильмов XXI века') return { text: 'TOP 25', color: '#f59e0b' }
  return null
})

const seriesInfo = computed(() => {
  if (!props.movie.isSeries) return null
  const parts = []
  if (props.movie.seasons) {
    parts.push(`${props.movie.seasons} сез.`)
  }
  if (props.movie.episodes) {
    parts.push(`${props.movie.episodes} серий`)
  }
  return parts.length > 0 ? parts.join(' • ') : null
})

const genres = computed(() => {
  const genreList = props.tmdb?.details?.genres || []
  return genreList.slice(0, 3).map(g => g.name).join(', ') // Show up to 3 genres
})


const tmdbRating = computed(() => {
  // Show TMDB rating only if we don't have Kinopoisk/IMDb rating
  if (props.movie.kinopoiskRating || props.movie.imdbRating) return null
  if (props.tmdb?.voteAverage) {
    return props.tmdb.voteAverage.toFixed(1)
  }
  return null
})

const country = computed(() => {
  const countries = props.tmdb?.details?.productionCountries || []
  if (countries.length > 0) {
    // Show first country, or first 2 if multiple
    return countries.slice(0, 2).map(c => c.name).join(', ')
  }
  return null
})

const hasReason = computed(() => {
  return !!props.movie.reason
})

// Allowed provider IDs (Netflix + Russian platforms)
const ALLOWED_PROVIDER_IDS = new Set([8, 283, 115, 111, 113, 507, 501, 502, 117, 119, 420, 425])
const ALLOWED_PROVIDER_NAMES = ['netflix', 'кинопоиск', 'okko', 'ivi', 'premier', 'megogo', 'wink', 'more.tv', 'amedia', 'amediateka']

function isProviderAllowed(provider) {
  if (ALLOWED_PROVIDER_IDS.has(provider.id)) return true
  const nameLower = provider.name.toLowerCase()
  return ALLOWED_PROVIDER_NAMES.some(allowed => nameLower.includes(allowed))
}

const watchProviders = computed(() => {
  const providers = props.tmdb?.watchProviders
  if (!providers) return []

  // Combine all providers (flatrate, rent, buy) and deduplicate by ID
  const allProviders = [
    ...(providers.flatrate || []),
    ...(providers.rent || []),
    ...(providers.buy || [])
  ]

  // Filter only allowed providers and remove duplicates
  const uniqueProviders = []
  const seenIds = new Set()
  for (const provider of allProviders) {
    if (isProviderAllowed(provider) && !seenIds.has(provider.id)) {
      seenIds.add(provider.id)
      uniqueProviders.push(provider)
    }
  }

  // Sort alphabetically
  uniqueProviders.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  // Limit to 4 providers for card display
  return uniqueProviders.slice(0, 4)
})

const kinopoiskUrl = computed(() => {
  const query = props.movie.year
    ? `${props.movie.title} ${props.movie.year}`
    : props.movie.title
  return `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(query)}`
})
</script>

<template>
  <article class="movie-card" @click="emit('click')">
    <div class="poster-container">
      <img
        v-if="poster"
        :src="poster"
        :alt="movie.title"
        class="poster"
        loading="lazy"
      />
      <div v-else class="poster-placeholder">
        <div class="placeholder-gradient"></div>
        <div class="placeholder-content">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="placeholder-icon" aria-hidden="true">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
            <circle cx="9" cy="9" r="2"></circle>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
          </svg>
          <span class="poster-title">{{ movie.title }}</span>
          <div class="placeholder-meta" v-if="movie.year || rating">
            <span v-if="movie.year" class="placeholder-year">{{ movie.year }}</span>
            <span v-if="rating" class="placeholder-rating">{{ rating.toFixed(1) }}</span>
          </div>
        </div>
      </div>

      <!-- Overlay -->
      <div class="overlay">
        <div class="overlay-content">
          <span class="view-details">Подробнее</span>
          <div class="overlay-buttons">
            <a
              :href="kinopoiskUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="kinopoisk-btn"
              @click.stop
              title="Открыть в Кинопоиске"
              aria-label="Открыть фильм в Кинопоиске (откроется в новой вкладке)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              Кинопоиск
            </a>
            <button
              class="schedule-btn"
              @click="handleScheduleClick"
              title="Запланировать просмотр"
              aria-label="Запланировать дату просмотра фильма"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
                <line x1="16" x2="16" y1="2" y2="6"></line>
                <line x1="8" x2="8" y1="2" y2="6"></line>
                <line x1="3" x2="21" y1="10" y2="10"></line>
              </svg>
              {{ dueDateFormatted || 'Запланировать' }}
              <input
                type="date"
                class="date-input"
                :value="movie.dueDate || ''"
                @change="handleDateChange"
                @click.stop
                :aria-label="'Выбрать дату просмотра для ' + movie.title"
              />
            </button>
            <button
              v-if="movie.dueDate"
              class="clear-date-btn"
              @click.stop="emit('schedule', { movie: movie, date: null })"
              title="Убрать дату"
              aria-label="Убрать запланированную дату просмотра"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </button>
            <button
              class="watched-btn"
              @click.stop="emit('watched', movie)"
              title="Отметить как просмотренное"
              aria-label="Отметить фильм как просмотренный"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Просмотрено
            </button>
          </div>
        </div>
      </div>

      <!-- Badges -->
      <div class="badges">
        <span
          v-if="sectionBadge"
          class="badge"
          :style="{ background: sectionBadge.color }"
        >
          {{ sectionBadge.text }}
        </span>
      </div>

      <!-- Rating badge -->
      <div
        v-if="rating"
        class="rating-badge"
        :style="{ background: ratingColor }"
        :title="ratingLabel"
        :aria-label="'Рейтинг ' + rating.toFixed(1) + ' - ' + ratingLabel"
        role="img"
      >
        {{ rating.toFixed(1) }}
      </div>
      
      <!-- TMDB rating badge (if no other rating) -->
      <div v-if="tmdbRating && !rating" class="rating-badge tmdb-rating" :style="{ background: '#01d277' }">
        {{ tmdbRating }}
      </div>
      
      <!-- Due date badge -->
      <div v-if="dueDateFormatted" class="due-date-badge" title="Запланировано">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
          <line x1="16" x2="16" y1="2" y2="6"></line>
          <line x1="8" x2="8" y1="2" y2="6"></line>
          <line x1="3" x2="21" y1="10" y2="10"></line>
        </svg>
        {{ dueDateFormatted }}
      </div>

      <!-- Reason indicator -->
      <div v-if="hasReason" class="reason-indicator" title="Есть описание">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 16v-4"></path>
          <path d="M12 8h.01"></path>
        </svg>
      </div>
    </div>

    <div class="info">
      <h3 class="title">{{ movie.title }}</h3>
      <div class="meta">
        <span v-if="movie.year" class="year">{{ movie.year }}</span>
        <span v-if="country" class="country">{{ country }}</span>
        <span v-if="movie.director" class="director">{{ movie.director }}</span>
        <span v-if="seriesInfo" class="series-info">{{ seriesInfo }}</span>
        <span v-else-if="durationFormatted" class="duration">{{ durationFormatted }}</span>
      </div>
      <div v-if="genres" class="genres">{{ genres }}</div>
      
      <!-- Watch Providers -->
      <div v-if="watchProviders.length > 0" class="providers">
        <div class="providers-list">
          <img
            v-for="provider in watchProviders"
            :key="provider.id"
            :src="getProviderLogoUrl(provider.logo, 'small')"
            :alt="provider.name"
            :title="provider.name"
            class="provider-logo"
            loading="lazy"
          />
        </div>
      </div>
      
      <div v-if="hasReason" class="reason-hint">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
        <span>Есть описание</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.movie-card {
  background: var(--bg-card);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  animation: fadeIn 0.5s ease-out;
}

.movie-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px var(--shadow);
}

.movie-card:hover .overlay {
  opacity: 1;
}

.movie-card:hover .poster {
  transform: scale(1.05);
}

.poster-container {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  background: var(--bg-secondary);
}

.poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.poster-placeholder {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.placeholder-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(229, 9, 20, 0.15) 0%,
    var(--bg-secondary) 50%,
    rgba(96, 165, 250, 0.1) 100%
  );
}

.placeholder-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem;
  text-align: center;
}

.placeholder-icon {
  color: var(--text-muted);
  opacity: 0.4;
}

.poster-title {
  font-size: 0.85rem;
  text-align: center;
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 500;
}

.placeholder-meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.75rem;
}

.placeholder-year {
  color: var(--text-muted);
}

.placeholder-rating {
  background: var(--accent);
  color: white;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-weight: 600;
}

.overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 50%, transparent 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1.5rem;
}

.overlay-content {
  text-align: center;
}

.view-details {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: var(--accent);
  color: white;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

.overlay-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.kinopoisk-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: #ff6600;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.kinopoisk-btn:hover {
  background: #e65c00;
  transform: scale(1.05);
}

.kinopoisk-btn svg {
  flex-shrink: 0;
}

.schedule-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.schedule-btn:hover {
  background: #7c3aed;
  transform: scale(1.05);
}

.schedule-btn svg {
  flex-shrink: 0;
}

.schedule-btn .date-input {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  opacity: 0;
  pointer-events: none;
}

.clear-date-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-date-btn:hover {
  background: rgba(239, 68, 68, 0.8);
  transform: scale(1.1);
}

.clear-date-btn svg {
  flex-shrink: 0;
}

.watched-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: #4ade80;
  color: #000;
  border: none;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.watched-btn:hover {
  background: #22c55e;
  transform: scale(1.05);
}

.watched-btn svg {
  flex-shrink: 0;
}

.badges {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  color: black;
  text-transform: uppercase;
}

.rating-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 700;
  color: black;
}

.tmdb-rating {
  background: #01d277 !important;
}

.reason-indicator {
  position: absolute;
  bottom: 0.75rem;
  right: 0.75rem;
  background: rgba(0, 0, 0, 0.7);
  color: var(--accent);
  padding: 0.25rem 0.375rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.due-date-badge {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  background: rgba(139, 92, 246, 0.9);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  backdrop-filter: blur(4px);
}

.due-date-badge svg {
  flex-shrink: 0;
}

.info {
  padding: 1rem;
}

.title {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.meta span:not(:last-child)::after {
  content: '•';
  margin-left: 0.5rem;
  opacity: 0.5;
}

.genres {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.375rem;
  line-height: 1.3;
}

.reason-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.reason-hint svg {
  opacity: 0.6;
  flex-shrink: 0;
}

.providers {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.providers-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.provider-logo {
  height: 20px;
  width: auto;
  border-radius: 4px;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px;
  transition: transform 0.2s;
}

.provider-logo:hover {
  transform: scale(1.1);
}

@media (max-width: 768px) {
  .title {
    font-size: 0.85rem;
  }

  .meta {
    font-size: 0.75rem;
  }

  .info {
    padding: 0.75rem;
  }
}
</style>
