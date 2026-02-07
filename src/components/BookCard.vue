<script setup>
import { computed, ref } from 'vue'
import { getBookCoverUrl, getLivilibUrl, getGoodreadsUrl } from '../services/openlib.js'

const props = defineProps({
  book: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['click', 'read'])

const coverError = ref(false)

const cover = computed(() => {
  if (coverError.value) return null
  return getBookCoverUrl(props.book.openlib, 'M')
})

const rating = computed(() => {
  return props.book.livilibRating || props.book.goodreadsRating || props.book.openlib?.ratingsAverage || null
})

const ratingColor = computed(() => {
  if (!rating.value) return 'var(--text-muted)'
  if (rating.value >= 4.5) return 'var(--rating-excellent)'
  if (rating.value >= 4.0) return 'var(--rating-good)'
  if (rating.value >= 3.5) return 'var(--rating-ok)'
  return 'var(--rating-low)'
})

const ratingLabel = computed(() => {
  if (!rating.value) return ''
  if (rating.value >= 4.5) return 'Отлично'
  if (rating.value >= 4.0) return 'Хорошо'
  if (rating.value >= 3.5) return 'Нормально'
  return 'Низкий'
})

const author = computed(() => {
  return props.book.author || props.book.openlib?.author || null
})

const livilibUrl = computed(() => {
  return getLivilibUrl(props.book.title, author.value)
})

function handleCoverError() {
  coverError.value = true
}
</script>

<template>
  <article class="book-card" @click="emit('click', book)">
    <!-- Cover -->
    <div class="cover-container">
      <img
        v-if="cover"
        :src="cover"
        :alt="book.title"
        class="cover"
        loading="lazy"
        @error="handleCoverError"
      />
      <div v-else class="cover-placeholder">
        <div class="placeholder-gradient"></div>
        <div class="placeholder-content">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="placeholder-icon" aria-hidden="true">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
          </svg>
          <span class="cover-title">{{ book.title }}</span>
          <span v-if="author" class="cover-author">{{ author }}</span>
        </div>
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

      <!-- Audiobook badge -->
      <div v-if="book.isAudiobook" class="audiobook-badge" title="Аудиокнига">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
        </svg>
      </div>

      <!-- Overlay on hover -->
      <div class="overlay">
        <div class="overlay-content">
          <div class="overlay-buttons">
            <a
              :href="livilibUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="livelib-btn"
              @click.stop
              title="Открыть в Livelib"
              aria-label="Открыть книгу в Livelib (откроется в новой вкладке)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              Livelib
            </a>
            <button
              class="read-btn"
              @click.stop="emit('read', book)"
              title="Отметить как прочитанное"
              aria-label="Отметить книгу как прочитанную"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Прочитано
            </button>
          </div>
          <span class="details-hint">Подробнее</span>
        </div>
      </div>
    </div>

    <!-- Info -->
    <div class="book-info">
      <h3 class="book-title">{{ book.title }}</h3>
      <p v-if="author" class="book-author">{{ author }}</p>
      <div class="book-meta">
        <span v-if="book.year" class="meta-item">{{ book.year }}</span>
        <span v-if="book.pages || book.openlib?.pages" class="meta-item">
          {{ book.pages || book.openlib?.pages }} стр.
        </span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.book-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: transform var(--transition-normal), box-shadow var(--transition-normal);
  animation: fadeIn 0.5s ease-out;
}

.book-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.cover-container {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  background: var(--bg-secondary);
}

.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--transition-slow);
}

.book-card:hover .cover {
  transform: scale(1.05);
}

.cover-placeholder {
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
    rgba(96, 165, 250, 0.15) 0%,
    var(--bg-secondary) 50%,
    rgba(168, 85, 247, 0.1) 100%
  );
}

.placeholder-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  text-align: center;
}

.placeholder-icon {
  color: var(--text-muted);
  opacity: 0.4;
}

.cover-title {
  font-size: 0.8rem;
  text-align: center;
  color: var(--text-secondary);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 500;
}

.cover-author {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-style: italic;
}

.rating-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 700;
  color: #000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.audiobook-badge {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.7);
  color: #fbbf24;
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.7) 50%, transparent 100%);
  opacity: 0;
  transition: opacity var(--transition-normal);
  display: flex;
  align-items: flex-end;
  padding: 1rem;
}

.book-card:hover .overlay {
  opacity: 1;
}

.overlay-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.overlay-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.livelib-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: #ff6600;
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  text-decoration: none;
}

.livelib-btn:hover {
  background: #e65c00;
  transform: scale(1.05);
}

.read-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: #4ade80;
  color: #000;
  border: none;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.read-btn:hover {
  background: #22c55e;
  transform: scale(1.05);
}

.details-hint {
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-muted);
  opacity: 0.8;
}

.book-info {
  padding: 1rem;
}

.book-title {
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.3;
  margin-bottom: 0.25rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.book-author {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.book-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.meta-item {
  font-size: 0.75rem;
  color: var(--text-muted);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .overlay-buttons {
    flex-direction: column;
  }

  .livelib-btn,
  .read-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
