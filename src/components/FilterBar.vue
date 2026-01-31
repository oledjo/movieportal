<script setup>
import { computed } from 'vue'

const props = defineProps({
  search: String,
  section: String,
  sort: String,
  minRating: Number,
  movieType: String,
  sections: Array
})

const emit = defineEmits(['update:search', 'update:section', 'update:sort', 'update:minRating', 'update:movieType'])

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
  return props.search || props.section !== 'all' || props.minRating > 0 || props.sort !== 'default' || props.movieType !== 'all'
})

function clearFilters() {
  emit('update:search', '')
  emit('update:section', 'all')
  emit('update:sort', 'default')
  emit('update:minRating', 0)
  emit('update:movieType', 'all')
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
</style>
