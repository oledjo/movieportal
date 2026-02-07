// Open Library + Google Books API Service for book covers and info
const OPEN_LIBRARY_API = 'https://openlibrary.org'
const COVERS_URL = 'https://covers.openlibrary.org'
const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes'

// In-memory cache
const cache = new Map()

// LocalStorage cache
const CACHE_STORAGE_KEY = 'openlib_books_cache'
const CACHE_VERSION = 2 // Bumped to invalidate old cache without Google Books covers
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
    .replace(/\s+[—–]\s+.+$/, '') // Remove author after em/en dash (with spaces), preserve hyphens in words
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
 * Try to find a search result with a cover from a list of docs
 */
function findBestResultWithCover(docs) {
  // Prefer results that have a cover
  const withCover = docs.find(doc => doc.cover_i)
  if (withCover) return processSearchResult(withCover)
  // Fall back to first result
  return docs.length > 0 ? processSearchResult(docs[0]) : null
}

/**
 * Perform a search query on Open Library
 */
async function performOpenLibSearch(query) {
  try {
    const response = await fetch(`${OPEN_LIBRARY_API}/search.json?${query}&limit=5`)
    if (!response.ok) return null
    const data = await response.json()
    if (!data.docs || data.docs.length === 0) return null
    return findBestResultWithCover(data.docs)
  } catch (e) {
    console.warn('OpenLib search failed:', e.message)
    return null
  }
}

/**
 * Search Google Books API for a cover image
 * Google Books has much better coverage for Russian-language books
 */
async function searchGoogleBooks(title, author = null) {
  try {
    // Build query: "intitle:Title+inauthor:Author" or just the title
    let q = title
    if (author) {
      q = `${title} ${author}`
    }

    const url = `${GOOGLE_BOOKS_API}?q=${encodeURIComponent(q)}&maxResults=5&printType=books`
    const response = await fetch(url)
    if (!response.ok) return null

    const data = await response.json()
    if (!data.items || data.items.length === 0) return null

    // Find the best result with a cover image
    for (const item of data.items) {
      const imageLinks = item.volumeInfo?.imageLinks
      if (imageLinks) {
        // Get the best available thumbnail and convert to HTTPS
        let coverUrl = imageLinks.thumbnail || imageLinks.smallThumbnail
        if (coverUrl) {
          coverUrl = coverUrl.replace(/^http:/, 'https:')
          // Request higher quality: zoom=2 for better resolution
          coverUrl = coverUrl.replace(/zoom=\d/, 'zoom=2')

          return {
            coverUrl,
            // Also extract useful metadata from Google Books
            googleTitle: item.volumeInfo.title,
            googleAuthors: item.volumeInfo.authors || [],
            googlePages: item.volumeInfo.pageCount || null,
            googleRating: item.volumeInfo.averageRating || null,
            googleDescription: item.volumeInfo.description || null
          }
        }
      }
    }

    // If no items with covers, try the first result anyway for metadata
    return null
  } catch (e) {
    console.warn('Google Books search failed:', e.message)
    return null
  }
}

/**
 * Search for a book using Open Library + Google Books fallback
 */
export async function searchBook(title, author = null) {
  const cleanedTitle = cleanTitle(title)
  const searchTitle = TITLE_TRANSLATIONS[cleanedTitle] || cleanedTitle
  const cacheKey = `${searchTitle}-${author || ''}`

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  console.log(`Books: Searching for "${searchTitle}"${author ? ` by ${author}` : ''}`)

  try {
    let result = null

    // --- Open Library search (1-2 quick attempts) ---

    // Try with title + author first
    if (author) {
      const query = `q=${encodeURIComponent(`${searchTitle} ${author}`)}`
      result = await performOpenLibSearch(query)
    }

    // Try title only if no cover found
    if (!result || !result.coverId) {
      const query = `title=${encodeURIComponent(searchTitle)}`
      const titleResult = await performOpenLibSearch(query)
      if (titleResult && (!result || titleResult.coverId)) {
        result = titleResult
      }
    }

    // --- Google Books fallback for covers ---
    if (!result || !result.coverId) {
      console.log(`Books: OpenLib no cover for "${searchTitle}", trying Google Books...`)
      const googleResult = await searchGoogleBooks(searchTitle, author)

      if (googleResult?.coverUrl) {
        if (!result) {
          // No Open Library result at all — create a minimal result from Google Books
          result = {
            key: null,
            title: googleResult.googleTitle || searchTitle,
            author: googleResult.googleAuthors?.[0] || author,
            authors: googleResult.googleAuthors || [],
            firstPublishYear: null,
            coverId: null,
            coverUrl: googleResult.coverUrl,
            isbn: null,
            subjects: [],
            language: null,
            pages: googleResult.googlePages,
            editionCount: null,
            ratingsAverage: googleResult.googleRating,
            ratingsCount: null
          }
        } else {
          // Open Library result exists but without cover — add Google Books cover
          result.coverUrl = googleResult.coverUrl
          // Fill in missing metadata from Google Books
          if (!result.pages && googleResult.googlePages) {
            result.pages = googleResult.googlePages
          }
        }
        console.log(`Books: Google Books cover found for "${searchTitle}"`)
      }
    }

    cache.set(cacheKey, result)
    debouncedSaveCache()
    return result
  } catch (error) {
    console.error('Book search error:', error)
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
 * Get cover URL from Open Library cover ID
 */
export function getCoverUrl(coverId, size = 'M') {
  if (!coverId) return null
  // Sizes: S (small), M (medium), L (large)
  return `${COVERS_URL}/b/id/${coverId}-${size}.jpg`
}

/**
 * Get the best available cover URL for a book result
 * Checks Open Library cover first, then Google Books fallback
 */
export function getBookCoverUrl(openLibData, size = 'M') {
  if (!openLibData) return null
  // Prefer Open Library cover (higher quality, multiple sizes)
  if (openLibData.coverId) {
    return getCoverUrl(openLibData.coverId, size)
  }
  // Fallback to Google Books cover
  if (openLibData.coverUrl) {
    // For large size, request zoom=3 from Google Books
    if (size === 'L') {
      return openLibData.coverUrl.replace(/zoom=\d/, 'zoom=3')
    }
    return openLibData.coverUrl
  }
  return null
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
