<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { getBackdropUrl, getProviderLogoUrl } from '../services/tmdb.js'

const props = defineProps({
  movie: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

const rating = computed(() => props.movie.kinopoiskRating || props.movie.imdbRating || null)

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
    return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`
  }
  return `${minutes} мин`
})

const seriesInfo = computed(() => {
  if (!props.movie.isSeries) return null
  const parts = []
  if (props.movie.seasons) {
    parts.push(`${props.movie.seasons} сезон${props.movie.seasons > 1 ? (props.movie.seasons < 5 ? 'а' : 'ов') : ''}`)
  }
  if (props.movie.episodes) {
    parts.push(`${props.movie.episodes} серий`)
  }
  return parts.length > 0 ? parts.join(', ') : null
})

const backdrop = computed(() => {
  if (props.movie.tmdb?.backdropPath) {
    return getBackdropUrl(props.movie.tmdb.backdropPath)
  }
  return null
})

const tmdbRating = computed(() => {
  if (props.movie.tmdb?.voteAverage) {
    return props.movie.tmdb.voteAverage.toFixed(1)
  }
  return null
})

const genres = computed(() => {
  return props.movie.tmdb?.details?.genres || []
})

const cast = computed(() => {
  return props.movie.tmdb?.details?.cast || []
})

const tmdbDirector = computed(() => {
  return props.movie.tmdb?.details?.director || null
})

const runtime = computed(() => {
  const mins = props.movie.tmdb?.details?.runtime
  if (!mins) return null
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  if (hours > 0) {
    return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`
  }
  return `${minutes} мин`
})

const countries = computed(() => {
  const countries = props.movie.tmdb?.details?.productionCountries || []
  return countries.map(c => c.name).join(', ')
})

// Allowed provider IDs (Netflix + Russian platforms)
const ALLOWED_PROVIDER_IDS = new Set([8, 283, 115, 111, 113, 507, 501, 502, 117, 119, 420, 425])
const ALLOWED_PROVIDER_NAMES = ['netflix', 'кинопоиск', 'okko', 'ivi', 'premier', 'megogo', 'wink', 'more.tv', 'amedia', 'amediateka']

function isProviderAllowed(provider) {
  if (ALLOWED_PROVIDER_IDS.has(provider.id)) return true
  const nameLower = provider.name.toLowerCase()
  return ALLOWED_PROVIDER_NAMES.some(allowed => nameLower.includes(allowed))
}

function filterProviders(providerList) {
  if (!providerList) return []
  return providerList.filter(isProviderAllowed)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

const watchProviders = computed(() => {
  const providers = props.movie.tmdb?.watchProviders
  if (!providers) return { flatrate: [], rent: [], buy: [] }
  
  return {
    flatrate: filterProviders(providers.flatrate),
    rent: filterProviders(providers.rent),
    buy: filterProviders(providers.buy)
  }
})

const hasProviders = computed(() => {
  const p = watchProviders.value
  return (p.flatrate?.length || 0) + (p.rent?.length || 0) + (p.buy?.length || 0) > 0
})

// Handle escape key
function handleKeydown(e) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal">
        <!-- Close button -->
        <button class="close-btn" @click="emit('close')">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </svg>
        </button>

        <!-- Backdrop -->
        <div class="backdrop-container" v-if="backdrop">
          <img :src="backdrop" :alt="movie.title" class="backdrop" />
          <div class="backdrop-gradient"></div>
        </div>

        <!-- Content -->
        <div class="modal-content">
          <!-- Poster -->
          <div class="poster-section">
            <div class="poster-container">
              <img
                v-if="movie.poster"
                :src="movie.poster"
                :alt="movie.title"
                class="poster"
              />
              <div v-else class="poster-placeholder">
                <span class="poster-icon">🎬</span>
              </div>
            </div>
          </div>

          <!-- Info -->
          <div class="info-section">
            <h2 class="title">{{ movie.title }}</h2>

            <!-- Meta -->
            <div class="meta">
              <span v-if="movie.year" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
                  <line x1="16" x2="16" y1="2" y2="6"></line>
                  <line x1="8" x2="8" y1="2" y2="6"></line>
                  <line x1="3" x2="21" y1="10" y2="10"></line>
                </svg>
                {{ movie.year }}
              </span>
              <span v-if="movie.isSeries" class="meta-item series-badge">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
                  <polyline points="17 2 12 7 7 2"></polyline>
                </svg>
                Сериал
              </span>
              <span v-if="seriesInfo" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15V6"></path>
                  <path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"></path>
                  <path d="M12 12H3"></path>
                  <path d="M16 6H3"></path>
                  <path d="M12 18H3"></path>
                </svg>
                {{ seriesInfo }}
              </span>
              <span v-else-if="durationFormatted" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {{ durationFormatted }}
              </span>
              <span v-if="movie.director || tmdbDirector" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"></path>
                  <rect x="2" y="6" width="14" height="12" rx="2"></rect>
                </svg>
                {{ movie.director || tmdbDirector }}
              </span>
              <span v-if="runtime && !movie.duration && !seriesInfo" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {{ runtime }}
              </span>
              <span v-if="countries" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
                  <path d="M2 12h20"></path>
                </svg>
                {{ countries }}
              </span>
              <span class="meta-item category">
                {{ movie.sectionName }}
              </span>
            </div>

            <!-- Genres -->
            <div v-if="genres.length > 0" class="genres-section">
              <span v-for="genre in genres" :key="genre.id" class="genre-tag">
                {{ genre.name }}
              </span>
            </div>

            <!-- Ratings -->
            <div class="ratings" v-if="rating || tmdbRating">
              <div v-if="movie.kinopoiskRating" class="rating-item">
                <span class="rating-source">Кинопоиск</span>
                <span class="rating-value" :style="{ color: ratingColor }">
                  {{ movie.kinopoiskRating.toFixed(1) }}
                </span>
              </div>
              <div v-if="movie.imdbRating" class="rating-item">
                <span class="rating-source">IMDb</span>
                <span class="rating-value imdb">
                  {{ movie.imdbRating.toFixed(1) }}
                </span>
              </div>
              <div v-if="tmdbRating && !movie.imdbRating" class="rating-item">
                <span class="rating-source">TMDB</span>
                <span class="rating-value tmdb">
                  {{ tmdbRating }}
                </span>
              </div>
            </div>

            <!-- Reason / Why to watch -->
            <div v-if="movie.reason" class="reason-section">
              <h3 class="section-title">Почему посмотреть</h3>
              <p class="reason-text">{{ movie.reason }}</p>
            </div>

            <!-- TMDB Overview -->
            <div v-if="movie.tmdb?.overview" class="overview-section">
              <h3 class="section-title">Описание</h3>
              <p class="overview-text">{{ movie.tmdb.overview }}</p>
            </div>

            <!-- Cast -->
            <div v-if="cast.length > 0" class="cast-section">
              <h3 class="section-title">В ролях</h3>
              <div class="cast-list">
                <div v-for="actor in cast" :key="actor.name" class="cast-item">
                  <span class="actor-name">{{ actor.name }}</span>
                  <span v-if="actor.character" class="actor-character">{{ actor.character }}</span>
                </div>
              </div>
            </div>

            <!-- Watch Providers -->
            <div v-if="hasProviders" class="providers-section">
              <h3 class="section-title">Где посмотреть</h3>
              <div v-if="watchProviders.flatrate && watchProviders.flatrate.length > 0" class="provider-group">
                <span class="provider-type">Подписка:</span>
                <div class="providers-list">
                  <div
                    v-for="provider in watchProviders.flatrate"
                    :key="provider.id"
                    class="provider-item"
                    :title="provider.name"
                  >
                    <img
                      :src="getProviderLogoUrl(provider.logo, 'medium')"
                      :alt="provider.name"
                      class="provider-logo"
                    />
                    <span class="provider-name">{{ provider.name }}</span>
                  </div>
                </div>
              </div>
              <div v-if="watchProviders.rent && watchProviders.rent.length > 0" class="provider-group">
                <span class="provider-type">Аренда:</span>
                <div class="providers-list">
                  <div
                    v-for="provider in watchProviders.rent"
                    :key="provider.id"
                    class="provider-item"
                    :title="provider.name"
                  >
                    <img
                      :src="getProviderLogoUrl(provider.logo, 'medium')"
                      :alt="provider.name"
                      class="provider-logo"
                    />
                    <span class="provider-name">{{ provider.name }}</span>
                  </div>
                </div>
              </div>
              <div v-if="watchProviders.buy && watchProviders.buy.length > 0" class="provider-group">
                <span class="provider-type">Покупка:</span>
                <div class="providers-list">
                  <div
                    v-for="provider in watchProviders.buy"
                    :key="provider.id"
                    class="provider-item"
                    :title="provider.name"
                  >
                    <img
                      :src="getProviderLogoUrl(provider.logo, 'medium')"
                      :alt="provider.name"
                      class="provider-logo"
                    />
                    <span class="provider-name">{{ provider.name }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Labels -->
            <div v-if="movie.labels && movie.labels.length > 0" class="labels-section">
              <span v-for="label in movie.labels" :key="label" class="label">
                {{ label }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  position: relative;
  background: var(--bg-secondary);
  border-radius: 16px;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.1);
}

.backdrop-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 300px;
  overflow: hidden;
}

.backdrop {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.backdrop-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent 0%, var(--bg-secondary) 100%);
}

.modal-content {
  position: relative;
  display: flex;
  gap: 2rem;
  padding: 2rem;
  padding-top: 200px;
  max-height: 90vh;
  overflow-y: auto;
}

.poster-section {
  flex-shrink: 0;
}

.poster-container {
  width: 200px;
  aspect-ratio: 2/3;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.poster-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
}

.poster-icon {
  font-size: 4rem;
  opacity: 0.5;
}

.info-section {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 1rem;
  line-height: 1.3;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.meta-item svg {
  opacity: 0.7;
}

.meta-item.category {
  background: var(--bg-card);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
}

.meta-item.series-badge {
  background: #60a5fa;
  color: black;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.meta-item.series-badge svg {
  opacity: 1;
}

.ratings {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-card);
  border-radius: 12px;
}

.rating-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.rating-source {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rating-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.rating-value.imdb {
  color: var(--accent-gold);
}

.rating-value.tmdb {
  color: #01d277;
}

.section-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.reason-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(229, 9, 20, 0.1) 0%, transparent 100%);
  border-left: 3px solid var(--accent);
  border-radius: 0 8px 8px 0;
}

.reason-text {
  color: var(--text-primary);
  line-height: 1.6;
}

.overview-section {
  margin-bottom: 1.5rem;
}

.overview-text {
  color: var(--text-secondary);
  line-height: 1.7;
}

.genres-section {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.genre-tag {
  padding: 0.375rem 0.75rem;
  background: rgba(229, 9, 20, 0.15);
  border: 1px solid rgba(229, 9, 20, 0.3);
  border-radius: 20px;
  font-size: 0.8rem;
  color: var(--accent);
}

.cast-section {
  margin-bottom: 1.5rem;
}

.cast-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.cast-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-card);
  border-radius: 8px;
  font-size: 0.85rem;
}

.actor-name {
  color: var(--text-primary);
  font-weight: 500;
}

.actor-character {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.labels-section {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.label {
  padding: 0.375rem 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.providers-section {
  margin-bottom: 1.5rem;
}

.provider-group {
  margin-bottom: 1rem;
}

.provider-type {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.providers-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.provider-item:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.provider-logo {
  height: 24px;
  width: auto;
  border-radius: 4px;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px;
}

.provider-name {
  font-size: 0.85rem;
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .modal-overlay {
    padding: 0;
  }

  .modal {
    max-height: 100vh;
    border-radius: 0;
  }

  .modal-content {
    flex-direction: column;
    padding: 1.5rem;
    padding-top: 180px;
  }

  .poster-section {
    display: flex;
    justify-content: center;
  }

  .poster-container {
    width: 150px;
  }

  .title {
    font-size: 1.5rem;
    text-align: center;
  }

  .meta {
    justify-content: center;
  }

  .ratings {
    justify-content: center;
  }
}
</style>
