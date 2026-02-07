<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { getBookCoverUrl, getLivilibUrl, getGoodreadsUrl } from '../services/openlib.js'

const props = defineProps({
  book: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'read'])

const coverError = ref(false)

const cover = computed(() => {
  if (coverError.value) return null
  return getBookCoverUrl(props.book.openlib, 'L')
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

const author = computed(() => {
  return props.book.author || props.book.openlib?.author || null
})

const authors = computed(() => {
  return props.book.openlib?.authors || (author.value ? [author.value] : [])
})

const subjects = computed(() => {
  return props.book.openlib?.subjects || []
})

const livilibUrl = computed(() => {
  return getLivilibUrl(props.book.title, author.value)
})

const goodreadsUrl = computed(() => {
  return getGoodreadsUrl(props.book.title, author.value)
})

const pages = computed(() => {
  return props.book.pages || props.book.openlib?.pages || null
})

function handleCoverError() {
  coverError.value = true
}

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
        <button
          class="close-btn"
          @click="emit('close')"
          aria-label="Закрыть окно"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </svg>
        </button>

        <!-- Content -->
        <div class="modal-content">
          <!-- Cover -->
          <div class="cover-section">
            <div class="cover-container">
              <img
                v-if="cover"
                :src="cover"
                :alt="book.title"
                class="cover"
                @error="handleCoverError"
              />
              <div v-else class="cover-placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                </svg>
              </div>
            </div>
          </div>

          <!-- Info -->
          <div class="info-section">
            <div class="title-row">
              <h2 class="title">{{ book.title }}</h2>
              <div class="title-actions">
                <a
                  :href="livilibUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="livelib-btn"
                  title="Открыть в Livelib"
                  aria-label="Открыть книгу в Livelib (откроется в новой вкладке)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  Livelib
                </a>
                <a
                  :href="goodreadsUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="goodreads-btn"
                  title="Открыть в Goodreads"
                  aria-label="Открыть книгу в Goodreads (откроется в новой вкладке)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  Goodreads
                </a>
                <button
                  class="read-btn"
                  @click="emit('read', book)"
                  title="Отметить как прочитанное"
                  aria-label="Отметить книгу как прочитанную"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Прочитано
                </button>
              </div>
            </div>

            <!-- Author -->
            <div v-if="authors.length > 0" class="authors">
              <span v-for="(a, index) in authors" :key="a" class="author">
                {{ a }}<span v-if="index < authors.length - 1">, </span>
              </span>
            </div>

            <!-- Meta -->
            <div class="meta">
              <span v-if="book.year || book.openlib?.firstPublishYear" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
                  <line x1="16" x2="16" y1="2" y2="6"></line>
                  <line x1="8" x2="8" y1="2" y2="6"></line>
                  <line x1="3" x2="21" y1="10" y2="10"></line>
                </svg>
                {{ book.year || book.openlib?.firstPublishYear }}
              </span>
              <span v-if="pages" class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                </svg>
                {{ pages }} стр.
              </span>
              <span v-if="book.isAudiobook" class="meta-item audiobook-badge">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
                </svg>
                Аудиокнига
              </span>
              <span class="meta-item category">
                {{ book.sectionName }}
              </span>
            </div>

            <!-- Subjects/Genres -->
            <div v-if="subjects.length > 0" class="subjects-section">
              <span v-for="subject in subjects" :key="subject" class="subject-tag">
                {{ subject }}
              </span>
            </div>

            <!-- Ratings -->
            <div class="ratings" v-if="rating || book.livilibRating || book.goodreadsRating">
              <div v-if="book.livilibRating" class="rating-item">
                <span class="rating-source">Livelib</span>
                <span class="rating-value" :style="{ color: ratingColor }">
                  {{ book.livilibRating.toFixed(1) }}
                </span>
              </div>
              <div v-if="book.goodreadsRating" class="rating-item">
                <span class="rating-source">Goodreads</span>
                <span class="rating-value goodreads">
                  {{ book.goodreadsRating.toFixed(1) }}
                </span>
              </div>
              <div v-if="book.openlib?.ratingsAverage && !book.livilibRating && !book.goodreadsRating" class="rating-item">
                <span class="rating-source">Open Library</span>
                <span class="rating-value openlib">
                  {{ book.openlib.ratingsAverage.toFixed(1) }}
                </span>
              </div>
            </div>

            <!-- Reason / Why to read -->
            <div v-if="book.reason" class="reason-section">
              <h3 class="section-title">Почему прочитать</h3>
              <p class="reason-text">{{ book.reason }}</p>
            </div>

            <!-- Labels -->
            <div v-if="book.labels && book.labels.length > 0" class="labels-section">
              <span v-for="label in book.labels" :key="label" class="label">
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
  border-radius: var(--radius-xl);
  max-width: 800px;
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
  transition: all var(--transition-normal);
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.1);
}

.modal-content {
  display: flex;
  gap: 2rem;
  padding: 2rem;
  max-height: 90vh;
  overflow-y: auto;
}

.cover-section {
  flex-shrink: 0;
}

.cover-container {
  width: 200px;
  aspect-ratio: 2/3;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  background: var(--bg-card);
}

.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
  color: var(--text-muted);
}

.info-section {
  flex: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.title {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.3;
  flex: 1;
}

.title-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.livelib-btn,
.goodreads-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-normal);
  white-space: nowrap;
  text-decoration: none;
}

.livelib-btn {
  background: #ff6600;
}

.livelib-btn:hover {
  background: #e65c00;
  transform: scale(1.02);
}

.goodreads-btn {
  background: #553b08;
}

.goodreads-btn:hover {
  background: #6b4a0a;
  transform: scale(1.02);
}

.read-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: #4ade80;
  color: #000;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-normal);
  white-space: nowrap;
}

.read-btn:hover {
  background: #22c55e;
  transform: scale(1.02);
}

.authors {
  font-size: 1.1rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.author {
  color: var(--accent);
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
  border-radius: var(--radius-full);
  font-size: 0.8rem;
}

.meta-item.audiobook-badge {
  background: #fbbf24;
  color: black;
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  font-weight: 600;
}

.meta-item.audiobook-badge svg {
  opacity: 1;
}

.subjects-section {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.subject-tag {
  padding: 0.375rem 0.75rem;
  background: rgba(96, 165, 250, 0.15);
  border: 1px solid rgba(96, 165, 250, 0.3);
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  color: #60a5fa;
}

.ratings {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
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

.rating-value.goodreads {
  color: #553b08;
}

.rating-value.openlib {
  color: #60a5fa;
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
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, transparent 100%);
  border-left: 3px solid #60a5fa;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}

.reason-text {
  color: var(--text-primary);
  line-height: 1.6;
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
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  color: var(--text-secondary);
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
  }

  .cover-section {
    display: flex;
    justify-content: center;
  }

  .cover-container {
    width: 150px;
  }

  .title-row {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .title {
    font-size: 1.5rem;
    text-align: center;
  }

  .title-actions {
    width: 100%;
    flex-direction: column;
  }

  .livelib-btn,
  .goodreads-btn,
  .read-btn {
    width: 100%;
    justify-content: center;
  }

  .authors {
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
