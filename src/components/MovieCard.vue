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

const emit = defineEmits(['click'])

const rating = computed(() => {
  return props.movie.kinopoiskRating || props.movie.imdbRating || null
})

const ratingColor = computed(() => {
  if (!rating.value) return 'var(--text-muted)'
  if (rating.value >= 8) return '#4ade80'
  if (rating.value >= 7) return '#fbbf24'
  if (rating.value >= 6) return '#fb923c'
  return '#f87171'
})

const durationFormatted = computed(() => {
  if (!props.movie.duration) return null
  const hours = Math.floor(props.movie.duration / 60)
  const minutes = props.movie.duration % 60
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

const tmdbRuntime = computed(() => {
  const mins = props.tmdb?.details?.runtime
  if (!mins || props.movie.duration) return null
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  if (hours > 0) {
    return minutes > 0 ? `${hours}ч ${minutes}м` : `${hours}ч`
  }
  return `${minutes}м`
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
        <span class="poster-icon">🎬</span>
        <span class="poster-title">{{ movie.title }}</span>
      </div>

      <!-- Overlay -->
      <div class="overlay">
        <div class="overlay-content">
          <span class="view-details">Подробнее</span>
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
      <div v-if="rating" class="rating-badge" :style="{ background: ratingColor }">
        {{ rating.toFixed(1) }}
      </div>
      
      <!-- TMDB rating badge (if no other rating) -->
      <div v-if="tmdbRating && !rating" class="rating-badge tmdb-rating" :style="{ background: '#01d277' }">
        {{ tmdbRating }}
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
        <span v-else-if="durationFormatted || tmdbRuntime" class="duration">{{ durationFormatted || tmdbRuntime }}</span>
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
}

.poster-icon {
  font-size: 3rem;
  opacity: 0.5;
}

.poster-title {
  font-size: 0.9rem;
  text-align: center;
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
