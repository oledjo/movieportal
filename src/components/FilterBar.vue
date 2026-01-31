<script setup>
import { computed } from 'vue'

const props = defineProps({
  search: String,
  section: String,
  sort: String,
  minRating: Number,
  movieType: String,
  provider: String,
  minDuration: Number,
  maxDuration: Number,
  sections: Array,
  providers: Array
})

const emit = defineEmits(['update:search', 'update:section', 'update:sort', 'update:minRating', 'update:movieType', 'update:provider', 'update:minDuration', 'update:maxDuration'])

const sortOptions = [
  { value: 'default', label: 'По умолчанию' },
  { value: 'rating-desc', label: 'Рейтинг ↓' },
  { value: 'rating-asc', label: 'Рейтинг ↑' },
  { value: 'title-asc', label: 'Название А-Я' },
  { value: 'title-desc', label: 'Название Я-А' },
  { value: 'year-desc', label: 'Год ↓' },
  { value: 'year-asc', label: 'Год ↑' }
]

const ratingOptions = [
  { value: 0, label: 'Любой' },
  { value: 6, label: '6+' },
  { value: 7, label: '7+' },
  { value: 8, label: '8+' },
  { value: 9, label: '9+' }
]

const movieTypeOptions = [
  { value: 'all', label: 'Все' },
  { value: 'movie', label: 'Фильмы' },
  { value: 'series', label: 'Сериалы' }
]

const hasActiveFilters = computed(() => {
  return props.search || 
         props.section !== 'all' || 
         props.minRating > 0 || 
         props.sort !== 'default' || 
         props.movieType !== 'all' || 
         props.provider !== 'all' ||
         props.minDuration > 0 ||
         props.maxDuration < 300
})

function clearFilters() {
  emit('update:search', '')
  emit('update:section', 'all')
  emit('update:sort', 'default')
  emit('update:minRating', 0)
  emit('update:movieType', 'all')
  emit('update:provider', 'all')
  emit('update:minDuration', 0)
  emit('update:maxDuration', 300)
}

// Format duration for display
function formatDuration(minutes) {
  if (minutes === 0) return '0 мин'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return mins > 0 ? `${hours}ч ${mins}м` : `${hours}ч`
  }
  return `${mins}м`
}
</script>

<template>
  <div class="filter-bar">
    <!-- Search -->
    <div class="filter-group search-group">
      <div class="search-input-container">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.3-4.3"></path>
        </svg>
        <input
          type="text"
          :value="search"
          @input="emit('update:search', $event.target.value)"
          placeholder="Поиск фильма..."
          class="search-input"
        />
        <button
          v-if="search"
          class="clear-search"
          @click="emit('update:search', '')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </svg>
        </button>
      </div>
    </div>

    <!-- Filters row -->
    <div class="filters-row">
      <!-- Movie Type filter -->
      <div class="filter-group">
        <label class="filter-label">Тип</label>
        <select
          :value="movieType"
          @change="emit('update:movieType', $event.target.value)"
          class="filter-select"
        >
          <option
            v-for="opt in movieTypeOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </div>

      <!-- Section filter -->
      <div class="filter-group">
        <label class="filter-label">Категория</label>
        <select
          :value="section"
          @change="emit('update:section', $event.target.value)"
          class="filter-select"
        >
          <option
            v-for="sec in sections"
            :key="sec.id"
            :value="sec.id"
          >
            {{ sec.name }}
          </option>
        </select>
      </div>

      <!-- Rating filter -->
      <div class="filter-group">
        <label class="filter-label">Рейтинг</label>
        <select
          :value="minRating"
          @change="emit('update:minRating', Number($event.target.value))"
          class="filter-select"
        >
          <option
            v-for="opt in ratingOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </div>

      <!-- Sort -->
      <div class="filter-group">
        <label class="filter-label">Сортировка</label>
        <select
          :value="sort"
          @change="emit('update:sort', $event.target.value)"
          class="filter-select"
        >
          <option
            v-for="opt in sortOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </div>

      <!-- Provider filter -->
      <div class="filter-group" v-if="providers && providers.length > 0">
        <label class="filter-label">Платформа</label>
        <select
          :value="provider"
          @change="emit('update:provider', $event.target.value)"
          class="filter-select"
        >
          <option value="all">Все платформы</option>
          <option
            v-for="p in providers"
            :key="p.id"
            :value="p.id.toString()"
          >
            {{ p.name }}
          </option>
        </select>
      </div>

      <!-- Duration filter -->
      <div class="filter-group duration-filter">
        <label class="filter-label">Длительность</label>
        <div class="duration-slider-container">
          <div class="duration-inputs">
            <input
              type="number"
              :value="minDuration"
              @input="emit('update:minDuration', Math.max(0, Math.min(300, parseInt($event.target.value) || 0)))"
              min="0"
              max="300"
              class="duration-input"
              placeholder="От"
            />
            <span class="duration-separator">—</span>
            <input
              type="number"
              :value="maxDuration"
              @input="emit('update:maxDuration', Math.max(0, Math.min(300, parseInt($event.target.value) || 300)))"
              min="0"
              max="300"
              class="duration-input"
              placeholder="До"
            />
          </div>
          <div class="duration-sliders">
            <div class="duration-slider-wrapper">
              <label class="duration-slider-label">От: {{ formatDuration(minDuration) }}</label>
              <input
                type="range"
                :value="minDuration"
                @input="emit('update:minDuration', Math.min(parseInt($event.target.value), maxDuration))"
                min="0"
                max="300"
                step="5"
                class="duration-slider"
              />
            </div>
            <div class="duration-slider-wrapper">
              <label class="duration-slider-label">До: {{ formatDuration(maxDuration) }}</label>
              <input
                type="range"
                :value="maxDuration"
                @input="emit('update:maxDuration', Math.max(parseInt($event.target.value), minDuration))"
                min="0"
                max="300"
                step="5"
                class="duration-slider"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Clear filters -->
      <button
        v-if="hasActiveFilters"
        class="clear-filters-btn"
        @click="clearFilters"
      >
        Сбросить фильтры
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  margin-bottom: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.search-group {
  width: 100%;
}

.search-input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 1rem;
  color: var(--text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.875rem 2.5rem 0.875rem 3rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 1rem;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(229, 9, 20, 0.1);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.clear-search {
  position: absolute;
  right: 0.75rem;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.clear-search:hover {
  color: var(--text-primary);
}

.filters-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 500;
}

.filter-select {
  padding: 0.625rem 2rem 0.625rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.9rem;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b7b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  transition: all 0.2s;
}

.filter-select:focus {
  outline: none;
  border-color: var(--accent);
}

.filter-select:hover {
  border-color: var(--text-muted);
}

.clear-filters-btn {
  padding: 0.625rem 1rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-filters-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .filters-row {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-group {
    width: 100%;
  }

  .filter-select {
    width: 100%;
  }

  .clear-filters-btn {
    width: 100%;
    text-align: center;
  }
}

.duration-filter {
  min-width: 200px;
}

.duration-slider-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.duration-inputs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.duration-input {
  flex: 1;
  padding: 0.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.85rem;
  text-align: center;
}

.duration-input:focus {
  outline: none;
  border-color: var(--accent);
}

.duration-separator {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.duration-sliders {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.duration-slider-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.duration-slider-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 500;
}

.duration-slider {
  width: 100%;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.duration-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.duration-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  background: var(--accent-hover);
}

.duration-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--accent);
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.duration-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
  background: var(--accent-hover);
}

.duration-slider::-webkit-slider-runnable-track {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
}

.duration-slider::-moz-range-track {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
}

@media (max-width: 768px) {
  .duration-filter {
    width: 100%;
  }
}
</style>
