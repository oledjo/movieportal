// Open Library API Service for book covers and info
const OPEN_LIBRARY_API = 'https://openlibrary.org'
const COVERS_URL = 'https://covers.openlibrary.org'

// In-memory cache
const cache = new Map()

// LocalStorage cache
const CACHE_STORAGE_KEY = 'openlib_books_cache'
const CACHE_VERSION = 1
const CACHE_EXPIRY_DAYS = 30

/**
 * Load cache from localStorage
 */
function loadCacheFromStorage() {
  try {
    const cached = localStorage.getItem(CACHE_STORAGE_KEY)
    if (!cached) return

    const parsed = JSON.parse(cached)

    if (parsed.version !== CACHE_VERSION) {
      console.log('OpenLib: Cache version mismatch, clearing')
      localStorage.removeItem(CACHE_STORAGE_KEY)
      return
    }

    if (parsed.expiry && parsed.expiry < Date.now()) {
      console.log('OpenLib: Cache expired, clearing')
      localStorage.removeItem(CACHE_STORAGE_KEY)
      return
    }

    if (parsed.data) {
      Object.entries(parsed.data).forEach(([key, value]) => {
        cache.set(key, value)
      })
      console.log(`OpenLib: Loaded ${Object.keys(parsed.data).length} cached results`)
    }
  } catch (e) {
    console.warn('OpenLib: Failed to load cache:', e)
    localStorage.removeItem(CACHE_STORAGE_KEY)
  }
}

/**
 * Save cache to localStorage
 */
export function saveCacheToStorage() {
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

    const jsonString = JSON.stringify(toStore)
    if (jsonString.length > 4 * 1024 * 1024) {
      console.warn('OpenLib: Cache too large, clearing oldest entries')
      const entries = Object.entries(cacheData)
      const toKeep = entries.slice(0, Math.floor(entries.length * 0.8))
      toStore.data = Object.fromEntries(toKeep)
    }

    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(toStore))
  } catch (e) {
    console.warn('OpenLib: Failed to save cache:', e)
    if (e.name === 'QuotaExceededError') {
      localStorage.removeItem(CACHE_STORAGE_KEY)
    }
  }
}

/**
 * Clear cache
 */
export function clearOpenLibCache() {
  cache.clear()
  localStorage.removeItem(CACHE_STORAGE_KEY)
  console.log('OpenLib cache cleared')
}

// Load cache on init
loadCacheFromStorage()

// Debounced save
let saveCacheTimeout = null
function debouncedSaveCache() {
  if (saveCacheTimeout) clearTimeout(saveCacheTimeout)
  saveCacheTimeout = setTimeout(() => {
    saveCacheToStorage()
    saveCacheTimeout = null
  }, 1000)
}

/**
 * Clean and normalize book title for search
 */
function cleanTitle(title) {
  return title
    .replace(/\s*\(\d{4}\)\s*/g, '') // Remove year
    .replace(/\s*[—–-]\s*.+$/, '') // Remove author after dash
    .replace(/[«»"']/g, '') // Remove quotes
    .replace(/#\d+/g, '') // Remove series numbers
    .replace(/[Тт]ом\s*\d+/g, '') // Remove "Том X"
    .replace(/[Кк]нига\s*\d+/g, '') // Remove "Книга X"
    .trim()
}

/**
 * Translate common Russian book titles to English
 */
const TITLE_TRANSLATIONS = {
  'Война и мир': 'War and Peace',
  'Преступление и наказание': 'Crime and Punishment',
  'Анна Каренина': 'Anna Karenina',
  'Мастер и Маргарита': 'The Master and Margarita',
  'Братья Карамазовы': 'The Brothers Karamazov',
  'Идиот': 'The Idiot',
  '1984': '1984',
  'Гарри Поттер': 'Harry Potter',
  'Властелин колец': 'Lord of the Rings',
  'Маленький принц': 'The Little Prince',
  'Три товарища': 'Three Comrades',
  'Над пропастью во ржи': 'The Catcher in the Rye',
  'Убить пересмешника': 'To Kill a Mockingbird',
  'Великий Гэтсби': 'The Great Gatsby',
  'Портрет Дориана Грея': 'The Picture of Dorian Gray'
}

/**
 * Search for a book on Open Library
 */
export async function searchBook(title, author = null) {
  const cleanedTitle = cleanTitle(title)
  const searchTitle = TITLE_TRANSLATIONS[cleanedTitle] || cleanedTitle
  const cacheKey = `${searchTitle}-${author || ''}`

  if (cache.has(cacheKey)) {
    console.log(`OpenLib: Using cached result for "${cleanedTitle}"`)
    return cache.get(cacheKey)
  }

  console.log(`OpenLib: Searching for "${searchTitle}"${author ? ` by ${author}` : ''}`)

  try {
    let query = `title=${encodeURIComponent(searchTitle)}`
    if (author) {
      query += `&author=${encodeURIComponent(author)}`
    }

    const response = await fetch(`${OPEN_LIBRARY_API}/search.json?${query}&limit=5`)
    if (!response.ok) {
      console.error(`OpenLib API error: ${response.status}`)
      return null
    }

    const data = await response.json()

    if (!data.docs || data.docs.length === 0) {
      // Try with translated title if we haven't already
      if (searchTitle === cleanedTitle && !TITLE_TRANSLATIONS[cleanedTitle]) {
        // Try English search
        const englishQuery = `title=${encodeURIComponent(cleanedTitle)}&language=eng`
        const englishResponse = await fetch(`${OPEN_LIBRARY_API}/search.json?${englishQuery}&limit=5`)
        if (englishResponse.ok) {
          const englishData = await englishResponse.json()
          if (englishData.docs && englishData.docs.length > 0) {
            const result = processSearchResult(englishData.docs[0])
            cache.set(cacheKey, result)
            debouncedSaveCache()
            return result
          }
        }
      }
      cache.set(cacheKey, null)
      debouncedSaveCache()
      return null
    }

    // Find best match
    const result = processSearchResult(data.docs[0])
    cache.set(cacheKey, result)
    debouncedSaveCache()
    return result
  } catch (error) {
    console.error('OpenLib search error:', error)
    return null
  }
}

/**
 * Process search result into normalized format
 */
function processSearchResult(doc) {
  return {
    key: doc.key,
    title: doc.title,
    author: doc.author_name?.[0] || null,
    authors: doc.author_name || [],
    firstPublishYear: doc.first_publish_year,
    coverId: doc.cover_i,
    isbn: doc.isbn?.[0] || null,
    subjects: doc.subject?.slice(0, 5) || [],
    language: doc.language?.[0] || null,
    pages: doc.number_of_pages_median || null,
    editionCount: doc.edition_count,
    ratingsAverage: doc.ratings_average,
    ratingsCount: doc.ratings_count
  }
}

/**
 * Get cover URL
 */
export function getCoverUrl(coverId, size = 'M') {
  if (!coverId) return null
  // Sizes: S (small), M (medium), L (large)
  return `${COVERS_URL}/b/id/${coverId}-${size}.jpg`
}

/**
 * Get cover URL by ISBN
 */
export function getCoverByIsbn(isbn, size = 'M') {
  if (!isbn) return null
  return `${COVERS_URL}/b/isbn/${isbn}-${size}.jpg`
}

/**
 * Batch search books with parallel processing
 */
export async function batchSearchBooks(books, onProgress = null) {
  const results = new Map()
  let completed = 0

  const BATCH_SIZE = 3 // Smaller batch for Open Library to avoid rate limiting

  const batches = []
  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    batches.push(books.slice(i, i + BATCH_SIZE))
  }

  console.log(`OpenLib: Processing ${books.length} books in ${batches.length} batches`)

  for (const batch of batches) {
    const batchPromises = batch.map(async (book) => {
      let searchResult = null

      try {
        searchResult = await searchBook(book.title, book.author)
      } catch (error) {
        console.error(`OpenLib: Error searching for "${book.title}":`, error)
        searchResult = null
      }

      return { bookId: book.id, result: searchResult }
    })

    const batchResults = await Promise.all(batchPromises)

    batchResults.forEach(({ bookId, result }) => {
      results.set(bookId, result)
      completed++
      if (onProgress) {
        onProgress(completed, books.length)
      }
    })

    // Delay between batches to avoid rate limiting
    if (batch !== batches[batches.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  // Final save
  if (saveCacheTimeout) {
    clearTimeout(saveCacheTimeout)
    saveCacheTimeout = null
  }
  saveCacheToStorage()
  console.log('OpenLib: Batch search complete')

  return results
}

/**
 * Get Livelib URL for a book
 */
export function getLivilibUrl(title, author = null) {
  const query = author ? `${title} ${author}` : title
  return `https://www.livelib.ru/find/${encodeURIComponent(query)}`
}

/**
 * Get Goodreads search URL
 */
export function getGoodreadsUrl(title, author = null) {
  const query = author ? `${title} ${author}` : title
  return `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`
}
