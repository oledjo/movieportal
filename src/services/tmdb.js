// TMDB API Service for movie posters and additional info
const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p'

// Provider logo sizes
export const PROVIDER_LOGO_SIZES = {
  small: 'w45',
  medium: 'w92',
  large: 'w154',
  original: 'original'
}

/**
 * Get provider logo URL
 */
export function getProviderLogoUrl(logoPath, size = 'medium') {
  if (!logoPath) return null
  return `${TMDB_IMAGE_URL}/${PROVIDER_LOGO_SIZES[size]}${logoPath}`
}

// Image sizes
export const POSTER_SIZES = {
  small: 'w185',
  medium: 'w342',
  large: 'w500',
  original: 'original'
}

// In-memory cache for API results
const cache = new Map()

// LocalStorage cache key
const CACHE_STORAGE_KEY = 'tmdb_posters_cache'
const CACHE_VERSION = 1
const CACHE_EXPIRY_DAYS = 30 // Cache expires after 30 days

/**
 * Load cache from localStorage
 */
function loadCacheFromStorage() {
  try {
    const cached = localStorage.getItem(CACHE_STORAGE_KEY)
    if (!cached) return

    const parsed = JSON.parse(cached)
    
    // Check cache version
    if (parsed.version !== CACHE_VERSION) {
      console.log('TMDB: Cache version mismatch, clearing old cache')
      localStorage.removeItem(CACHE_STORAGE_KEY)
      return
    }

    // Check expiry
    const now = Date.now()
    if (parsed.expiry && parsed.expiry < now) {
      console.log('TMDB: Cache expired, clearing')
      localStorage.removeItem(CACHE_STORAGE_KEY)
      return
    }

    // Load into memory cache
    if (parsed.data) {
      Object.entries(parsed.data).forEach(([key, value]) => {
        cache.set(key, value)
      })
      console.log(`TMDB: Loaded ${Object.keys(parsed.data).length} cached poster results`)
    }
  } catch (e) {
    console.warn('TMDB: Failed to load cache from storage:', e)
    localStorage.removeItem(CACHE_STORAGE_KEY)
  }
}

/**
 * Save cache to localStorage
 */
function saveCacheToStorage() {
  try {
    const cacheData = {}
    cache.forEach((value, key) => {
      cacheData[key] = value
    })

    const toStore = {
      version: CACHE_VERSION,
      expiry: Date.now() + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      data: cacheData
    }

    // Check size (localStorage limit is ~5-10MB)
    const jsonString = JSON.stringify(toStore)
    if (jsonString.length > 4 * 1024 * 1024) { // 4MB limit
      console.warn('TMDB: Cache too large, clearing oldest entries')
      // Remove oldest 20% of entries
      const entries = Object.entries(cacheData)
      entries.sort((a, b) => {
        // Sort by some criteria (e.g., keep most recent)
        return 0 // Simple: remove random entries
      })
      const toKeep = entries.slice(0, Math.floor(entries.length * 0.8))
      toStore.data = Object.fromEntries(toKeep)
    }

    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(toStore))
  } catch (e) {
    console.warn('TMDB: Failed to save cache to storage:', e)
    // If quota exceeded, clear and try again
    if (e.name === 'QuotaExceededError') {
      console.log('TMDB: Storage quota exceeded, clearing cache')
      localStorage.removeItem(CACHE_STORAGE_KEY)
    }
  }
}

/**
 * Clear the TMDB cache (both memory and storage)
 */
export function clearTmdbCache() {
  cache.clear()
  localStorage.removeItem(CACHE_STORAGE_KEY)
  console.log('TMDB cache cleared (memory + storage)')
}

// Debounce for saving cache to avoid too many writes
let saveCacheTimeout = null
function debouncedSaveCache() {
  if (saveCacheTimeout) {
    clearTimeout(saveCacheTimeout)
  }
  saveCacheTimeout = setTimeout(() => {
    saveCacheToStorage()
    saveCacheTimeout = null
  }, 1000) // Save after 1 second of inactivity
}

// Load cache on module initialization
loadCacheFromStorage()

/**
 * Clean movie title for search
 */
function cleanTitle(title) {
  return title
    .replace(/\s*\(\d{4}\)\s*/g, '') // Remove year
    .replace(/\s*—\s*.+$/, '') // Remove director
    .replace(/^(Фильм|Сериал|Аниме|Посмотреть|Мультфильм)\s+/i, '') // Remove prefixes
    .replace(/[«»"']/g, '') // Remove quotes
    .trim()
}

/**
 * Translate common Russian titles to English for better search
 */
const TITLE_TRANSLATIONS = {
  'Бешеный бык': 'Raging Bull',
  'Забавные игры': 'Funny Games',
  'Рыцари справедливости': 'Riders of Justice',
  'Шоа': 'Shoah',
  'Минари': 'Minari',
  'Ванильное небо': 'Vanilla Sky',
  'Фарго': 'Fargo',
  'Солнце мое': 'All of Us Strangers',
  'Быстрее пули': 'Bullet Train',
  'Варвар': 'Barbarian',
  'По соображениям совести': 'Hacksaw Ridge',
  'Шоссе в никуда': 'Lost Highway',
  'Малхолланд Драйв': 'Mulholland Drive',
  'Королевство полной луны': 'Moonrise Kingdom',
  'Темный рыцарь': 'The Dark Knight',
  'Убить Билла': 'Kill Bill',
  'Дом у озера': 'The Lake House',
  'Атака титанов': 'Attack on Titan',
  'Викинги': 'Vikings',
  'Падения дома Ашеров': 'The Fall of the House of Usher',
  'Великая красота': 'The Great Beauty',
  'Сядь за руль моей машины': 'Drive My Car',
  'Перевал Кассандры': 'The Cassandra Crossing',
  'Фантазия': 'Fantasia',
  'Накойкаци': 'Naqoyqatsi',
  'Трудно быть богом': 'Hard to Be a God',
  'Прощай речь': 'Goodbye to Language'
}

/**
 * Find the best matching result from TMDB search results
 */
function findBestMatch(results, searchTitle, year, isTV) {
  if (!results || results.length === 0) return null
  if (results.length === 1) return results[0]

  const normalizedSearch = searchTitle.toLowerCase().trim()

  // Score each result
  const scored = results.map(result => {
    let score = 0
    const resultTitle = (isTV ? result.name : result.title || '').toLowerCase()
    const originalTitle = (isTV ? result.original_name : result.original_title || '').toLowerCase()
    const releaseDate = isTV ? result.first_air_date : result.release_date
    const resultYear = releaseDate ? parseInt(releaseDate.substring(0, 4)) : null

    // Year matching (highest priority) - stricter matching
    if (year && resultYear) {
      if (resultYear === year) {
        score += 150 // Exact year match gets highest priority
      } else if (Math.abs(resultYear - year) === 1) {
        score += 30 // Allow 1 year difference but with lower score
      } else if (Math.abs(resultYear - year) <= 2) {
        score += 10 // Allow 2 years but very low score
      } else {
        // Penalize results with year difference > 2
        score -= 50
      }
    } else if (year && !resultYear) {
      // Penalize results without year when we have one
      score -= 20
    }

    // Exact title match
    if (resultTitle === normalizedSearch || originalTitle === normalizedSearch) {
      score += 100
    }
    // Title starts with search term
    else if (resultTitle.startsWith(normalizedSearch) || originalTitle.startsWith(normalizedSearch)) {
      score += 50
    }
    // Title contains search term
    else if (resultTitle.includes(normalizedSearch) || originalTitle.includes(normalizedSearch)) {
      score += 25
    } else {
      // Penalize if title doesn't match at all
      score -= 30
    }

    // Popularity boost (for disambiguation, but less weight)
    score += Math.min(result.popularity / 20, 10)

    // Vote count boost (more votes = more reliable)
    score += Math.min(result.vote_count / 200, 5)

    return { result, score }
  })

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  const bestMatch = scored[0]
  const secondBest = scored[1]

  console.log(`TMDB: Best match scores for "${searchTitle}" (year: ${year}):`,
    scored.slice(0, 3).map(s => {
      const releaseDate = isTV ? s.result.first_air_date : s.result.release_date
      const resultYear = releaseDate ? parseInt(releaseDate.substring(0, 4)) : null
      return `${isTV ? s.result.name : s.result.title} (${resultYear || '?'}, score: ${s.score.toFixed(1)})`
    }))

  // Minimum score threshold to ensure quality match
  // If year is provided, require at least 80 points (lowered from 100 for better matching)
  // If no year, require at least 30 points (lowered from 50)
  const minScore = year ? 80 : 30
  
  if (bestMatch.score < minScore) {
    console.warn(`TMDB: Low confidence match for "${searchTitle}" (score: ${bestMatch.score.toFixed(1)}, min: ${minScore}) - rejecting`)
    // If second best is close, might be ambiguous
    if (secondBest && bestMatch.score - secondBest.score < 30) {
      console.warn(`TMDB: Ambiguous match - top 2 scores are close (${bestMatch.score.toFixed(1)} vs ${secondBest.score.toFixed(1)})`)
    }
    // Return null if score is too low to avoid wrong matches
    return null
  }

  return bestMatch.result
}

/**
 * Search for a movie on TMDB
 */
export async function searchMovie(title, apiKey, year = null, isTV = false) {
  if (!apiKey) {
    console.warn('TMDB: No API key provided')
    return null
  }

  const cleanedTitle = cleanTitle(title)
  const cacheKey = `${cleanedTitle}-${year}-${isTV}`

  // Check in-memory cache first
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)
    console.log(`TMDB: Using cached result for "${cleanedTitle}"`)
    return cached
  }

  // Try translated title first if available
  const searchTitle = TITLE_TRANSLATIONS[cleanedTitle] || cleanedTitle
  const isTranslated = TITLE_TRANSLATIONS[cleanedTitle] !== undefined
  const endpoint = isTV ? 'search/tv' : 'search/movie'

  console.log(`TMDB: Searching for "${searchTitle}" (original: "${cleanedTitle}", year: ${year}, translated: ${isTranslated})`)

  try {
    // If title is translated to English, use English language for search
    // Otherwise use Russian
    const searchLanguage = isTranslated ? 'en-US' : 'ru-RU'
    
    // Build URL with year parameter if available (helps TMDB filter results)
    // But if year search fails, we'll try without year as fallback
    let url = `${TMDB_API_URL}/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(searchTitle)}&language=${searchLanguage}`
    if (year) {
      url += `&year=${year}`
    }

    let response
    try {
      response = await fetch(url)
    } catch (fetchError) {
      // Network error (connection refused, timeout, etc.)
      console.error(`TMDB: Network error fetching "${searchTitle}":`, fetchError.message)
      // Return cached result if available, even if expired
      if (cache.has(cacheKey)) {
        console.log(`TMDB: Using cached result due to network error`)
        return cache.get(cacheKey)
      }
      return null
    }

    if (!response.ok) {
      console.error(`TMDB API error: ${response.status} ${response.statusText}`)
      const errorText = await response.text()
      console.error('Response:', errorText)
      // Return cached result if available
      if (cache.has(cacheKey)) {
        console.log(`TMDB: Using cached result due to API error`)
        return cache.get(cacheKey)
      }
      return null
    }

    let data = await response.json()

    // If no results and we used Russian, try English (with year if available)
    if ((!data.results || data.results.length === 0) && !isTranslated) {
      url = `${TMDB_API_URL}/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(searchTitle)}&language=en-US`
      if (year) {
        url += `&year=${year}`
      }
      try {
        response = await fetch(url)
        if (response.ok) {
          data = await response.json()
        }
      } catch (fetchError) {
        console.error(`TMDB: Network error fetching English version:`, fetchError.message)
        // Return cached if available
        if (cache.has(cacheKey)) {
          return cache.get(cacheKey)
        }
      }
    }
    
    // If still no results and we used English translation, try Russian original title
    if ((!data.results || data.results.length === 0) && isTranslated) {
      url = `${TMDB_API_URL}/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(cleanedTitle)}&language=ru-RU`
      if (year) {
        url += `&year=${year}`
      }
      try {
        response = await fetch(url)
        if (response.ok) {
          data = await response.json()
        }
      } catch (fetchError) {
        console.error(`TMDB: Network error fetching Russian original:`, fetchError.message)
        // Return cached if available
        if (cache.has(cacheKey)) {
          return cache.get(cacheKey)
        }
      }
    }


    if (data.results && data.results.length > 0) {
      // Find the best matching result instead of just taking the first one
      let result = findBestMatch(data.results, searchTitle, year, isTV)

      // If no good match found with year, try without year filter (fallback)
      if (!result && year) {
        console.log(`TMDB: No good match with year ${year}, trying without year filter for "${searchTitle}"`)
        // Try search without year, using same language as original search
        url = `${TMDB_API_URL}/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(searchTitle)}&language=${searchLanguage}`
        try {
          response = await fetch(url)
          if (response.ok) {
            const fallbackData = await response.json()
            if (fallbackData.results && fallbackData.results.length > 0) {
              result = findBestMatch(fallbackData.results, searchTitle, null, isTV)
            }
          }
        } catch (fetchError) {
          console.error(`TMDB: Network error in fallback search:`, fetchError.message)
          // Return cached if available
          if (cache.has(cacheKey)) {
            return cache.get(cacheKey)
          }
        }
      }

      // If still no good match found, cache null result to avoid repeated failed searches
      if (!result) {
        console.warn(`TMDB: No good match found for "${searchTitle}" (year: ${year || 'none'})`)
        cache.set(cacheKey, null)
        // Cache null results too to avoid repeated failed searches
        debouncedSaveCache()
        return null
      }

      const movieData = {
        id: result.id,
        title: isTV ? result.name : result.title,
        originalTitle: isTV ? result.original_name : result.original_title,
        posterPath: result.poster_path,
        backdropPath: result.backdrop_path,
        overview: result.overview,
        releaseDate: isTV ? result.first_air_date : result.release_date,
        voteAverage: result.vote_average,
        voteCount: result.vote_count,
        genreIds: result.genre_ids || [],
        isTV
      }
      
      // Save to memory cache
      cache.set(cacheKey, movieData)
      
      // Save to localStorage (debounced to avoid too many writes)
      debouncedSaveCache()
      
      return movieData
    }

    // Cache null result to avoid repeated failed searches
    cache.set(cacheKey, null)
    debouncedSaveCache()
    return null
  } catch (error) {
    console.error('TMDB search error:', error)
    return null
  }
}

/**
 * Fetch watch providers (streaming platforms) for a movie/TV
 */
export async function fetchWatchProviders(tmdbId, apiKey, isTV = false, country = 'RU') {
  if (!apiKey || !tmdbId) return null

  const cacheKey = `providers-${tmdbId}-${isTV}-${country}`
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  const endpoint = isTV ? 'tv' : 'movie'
  const url = `${TMDB_API_URL}/${endpoint}/${tmdbId}/watch/providers?api_key=${apiKey}`

  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const data = await response.json()
    const providers = data.results?.[country] || null

    if (providers) {
      const providerData = {
        flatrate: (providers.flatrate || []).map(p => ({
          id: p.provider_id,
          name: p.provider_name,
          logo: p.logo_path
        })),
        rent: (providers.rent || []).map(p => ({
          id: p.provider_id,
          name: p.provider_name,
          logo: p.logo_path
        })),
        buy: (providers.buy || []).map(p => ({
          id: p.provider_id,
          name: p.provider_name,
          logo: p.logo_path
        }))
      }
      cache.set(cacheKey, providerData)
      return providerData
    }

    cache.set(cacheKey, null)
    return null
  } catch (error) {
    console.error('TMDB watch providers error:', error)
    return null
  }
}

/**
 * Fetch detailed movie/TV info from TMDB
 */
export async function fetchMovieDetails(tmdbId, apiKey, isTV = false) {
  if (!apiKey || !tmdbId) return null

  const cacheKey = `details-${tmdbId}-${isTV}`
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  const endpoint = isTV ? 'tv' : 'movie'
  const url = `${TMDB_API_URL}/${endpoint}/${tmdbId}?api_key=${apiKey}&language=ru-RU&append_to_response=credits`

  try {
    const response = await fetch(url)
    if (!response.ok) return null

    const data = await response.json()

    const details = {
      genres: data.genres || [],
      runtime: isTV ? (data.episode_run_time?.[0] || null) : data.runtime,
      productionCountries: data.production_countries || [],
      originalLanguage: data.original_language,
      status: data.status,
      tagline: data.tagline,
      cast: (data.credits?.cast || []).slice(0, 5).map(p => ({
        name: p.name,
        character: p.character,
        profilePath: p.profile_path
      })),
      director: isTV
        ? (data.created_by || []).map(p => p.name).join(', ')
        : (data.credits?.crew || []).find(p => p.job === 'Director')?.name || null,
      // TV-specific
      numberOfSeasons: isTV ? data.number_of_seasons : null,
      numberOfEpisodes: isTV ? data.number_of_episodes : null,
      networks: isTV ? (data.networks || []).map(n => n.name) : null
    }

    cache.set(cacheKey, details)
    return details
  } catch (error) {
    console.error('TMDB details error:', error)
    return null
  }
}

/**
 * Get poster URL
 */
export function getPosterUrl(posterPath, size = 'medium') {
  if (!posterPath) {
    return null
  }
  return `${TMDB_IMAGE_URL}/${POSTER_SIZES[size]}${posterPath}`
}

/**
 * Get backdrop URL
 */
export function getBackdropUrl(backdropPath, size = 'original') {
  if (!backdropPath) {
    return null
  }
  return `${TMDB_IMAGE_URL}/${size}${backdropPath}`
}

/**
 * Batch search multiple movies
 */
export async function batchSearchMovies(movies, apiKey, onProgress = null, fetchDetails = true) {
  const results = new Map()
  let completed = 0

  for (const movie of movies) {
    // Use isSeries flag from movie data (already determined correctly in todoist.js)
    // isSeries is set based on:
    // - Section ID (Сериалы or Смотрю сейчас)
    // - Presence of subtasks (episodes)
    // So we can trust this flag
    const isTV = movie.isSeries || false

    console.log(`Searching poster for: "${movie.title}" (year: ${movie.year || 'none'}, isTV: ${isTV}, section: ${movie.sectionName}, hasSubtasks: ${movie.episodes ? 'yes' : 'no'})`)
    
    let searchResult
    try {
      searchResult = await searchMovie(movie.title, apiKey, movie.year, isTV)
    } catch (error) {
      console.error(`TMDB: Error searching for "${movie.title}":`, error)
      // Continue with next movie instead of failing entire batch
      searchResult = null
    }

    if (searchResult && fetchDetails) {
      // Fetch additional details (genres, cast, etc.)
      const details = await fetchMovieDetails(searchResult.id, apiKey, searchResult.isTV)
      if (details) {
        Object.assign(searchResult, { details })
      }
      
      // Fetch watch providers (streaming platforms)
      const providers = await fetchWatchProviders(searchResult.id, apiKey, searchResult.isTV, 'RU')
      if (providers) {
        searchResult.watchProviders = providers
      }
      
      // Small extra delay for details request
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    results.set(movie.id, searchResult)

    completed++
    if (onProgress) {
      onProgress(completed, movies.length)
    }

    // Small delay to avoid rate limiting (only if not from cache and not null)
    if (searchResult && searchResult._fromCache !== true) {
      await new Promise(resolve => setTimeout(resolve, 100))
    } else if (!searchResult) {
      // Even for null results, small delay to avoid hammering API
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  // Final save of cache after batch is complete (flush debounced saves)
  if (saveCacheTimeout) {
    clearTimeout(saveCacheTimeout)
    saveCacheTimeout = null
  }
  saveCacheToStorage()
  console.log('TMDB: Batch search complete, cache saved')

  return results
}
