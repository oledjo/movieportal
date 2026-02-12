// Todoist Books API Service
const TODOIST_API_URL = 'https://api.todoist.com/api/v1'

// Books project name to search for
const BOOKS_PROJECT_NAME = '📚 Книги'

// Cache for project info
let booksProjectId = null
let booksSections = {}

// CORS proxy URL (set via setCorsProxy)
let corsProxyUrl = ''

/**
 * Set the CORS proxy URL for all Books API requests.
 */
export function setCorsProxy(proxyUrl) {
  let url = proxyUrl ? proxyUrl.replace(/\/+$/, '') : ''
  if (url && url.startsWith('http://')) {
    url = url.replace('http://', 'https://')
  }
  corsProxyUrl = url
}

function applyProxy(url) {
  if (!corsProxyUrl) return url
  return `${corsProxyUrl}/${url}`
}

/**
 * Fetch with retry logic for network errors
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  const proxiedUrl = applyProxy(url)
  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(proxiedUrl, options)
      return response
    } catch (error) {
      lastError = error
      console.warn(`Network error (attempt ${attempt + 1}/${maxRetries}):`, error.message)

      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw new Error(`Ошибка сети: ${lastError?.message || 'не удалось подключиться'}. Проверьте интернет-соединение.`)
}

/**
 * Find books project ID
 */
async function findBooksProject(apiToken) {
  if (booksProjectId) return booksProjectId

  const response = await fetchWithRetry(`${TODOIST_API_URL}/projects`, {
    headers: { 'Authorization': `Bearer ${apiToken}` }
  })

  if (!response.ok) {
    throw new Error(`Ошибка Todoist: ${response.status}`)
  }

  const projects = await response.json()
  const booksProject = projects.find(p => p.name.includes('Книги'))

  if (!booksProject) {
    throw new Error('Проект "📚 Книги" не найден в Todoist')
  }

  booksProjectId = booksProject.id
  console.log('Found books project:', booksProject.name, 'ID:', booksProjectId)
  return booksProjectId
}

/**
 * Fetch sections for books project
 */
async function fetchBooksSections(apiToken, projectId) {
  const response = await fetchWithRetry(`${TODOIST_API_URL}/sections?project_id=${projectId}`, {
    headers: { 'Authorization': `Bearer ${apiToken}` }
  })

  if (!response.ok) {
    throw new Error(`Ошибка Todoist: ${response.status}`)
  }

  const sections = await response.json()
  booksSections = {}
  sections.forEach(section => {
    booksSections[section.id] = section.name
  })

  console.log('Fetched book sections:', booksSections)
  return booksSections
}

/**
 * Parse book info from Todoist task
 */
export function parseBookInfo(task, allTasks = [], sections = {}) {
  const sectionName = sections[task.section_id] || 'Другое'

  const info = {
    id: task.id,
    title: task.content,
    description: task.description || '',
    sectionId: task.section_id,
    sectionName: sectionName,
    labels: task.labels || [],
    priority: task.priority,
    dueDate: task.due?.date || null,
    // Book-specific fields
    author: null,
    year: null,
    livilibRating: null,
    goodreadsRating: null,
    pages: null,
    reason: null,
    genre: null,
    isAudiobook: false,
    series: null,
    seriesNumber: null
  }

  // Check if audiobook based on labels or section
  info.isAudiobook = info.labels.some(l =>
    l.toLowerCase().includes('аудио') || l.toLowerCase().includes('audio')
  ) || sectionName.toLowerCase().includes('аудио')

  // Clean title and extract info
  let cleanedTitle = info.title
    .replace(/^[•*#\d]+\s*/, '')
    .replace(/^\d+\s+/, '')
    .trim()

  // Extract author from title (e.g., "Книга — Автор" or "Автор - Книга")
  // Pattern 1: "Title — Author"
  let authorMatch = cleanedTitle.match(/^(.+?)\s*[—–-]\s*([^(]+?)(?:\s*\(|$)/)
  if (authorMatch) {
    // Check which part is likely the author (usually shorter, or contains typical name patterns)
    const part1 = authorMatch[1].trim()
    const part2 = authorMatch[2].trim()

    // If part2 looks like year or other metadata, part1 might contain both title and author
    if (/^\d{4}$/.test(part2)) {
      info.title = part1
      info.year = parseInt(part2)
    } else {
      // Assume format is "Title — Author"
      info.title = part1
      info.author = part2
    }
    cleanedTitle = info.title
  }

  // Extract year from title (e.g., "(2020)")
  const yearMatch = cleanedTitle.match(/\((\d{4})\)/)
  if (yearMatch) {
    info.year = parseInt(yearMatch[1])
    cleanedTitle = cleanedTitle.replace(/\s*\(\d{4}\)\s*/, ' ').trim()
  }

  // Extract series info (e.g., "#3" or "Том 2")
  const seriesMatch = cleanedTitle.match(/#(\d+)|[Тт]ом\s*(\d+)|[Кк]нига\s*(\d+)/)
  if (seriesMatch) {
    info.seriesNumber = parseInt(seriesMatch[1] || seriesMatch[2] || seriesMatch[3])
  }

  info.title = cleanedTitle

  // Parse description for ratings and additional info
  if (info.description) {
    // Livelib rating (e.g., "Livelib: 4.5" or "LiveLib: 4.5")
    const livilibMatch = info.description.match(/(?:Livelib|LiveLib|livelib)[:\s]*(\d+\.?\d*)/i)
    if (livilibMatch) {
      info.livilibRating = parseFloat(livilibMatch[1])
    }

    // Goodreads rating
    const goodreadsMatch = info.description.match(/(?:Goodreads|GoodReads|goodreads)[:\s]*(\d+\.?\d*)/i)
    if (goodreadsMatch) {
      info.goodreadsRating = parseFloat(goodreadsMatch[1])
    }

    // Page count (e.g., "320 стр" or "320 pages")
    const pagesMatch = info.description.match(/(\d+)\s*(?:стр|страниц|pages?|p\.)/i)
    if (pagesMatch) {
      info.pages = parseInt(pagesMatch[1])
    }

    // Author from description if not found in title
    if (!info.author) {
      const authorDescMatch = info.description.match(/(?:Автор|Author)[:\s]*(.+?)(?:\n|$)/i)
      if (authorDescMatch) {
        info.author = authorDescMatch[1].trim()
      }
    }

    // Genre from description
    const genreMatch = info.description.match(/(?:Жанр|Genre)[:\s]*(.+?)(?:\n|$)/i)
    if (genreMatch) {
      info.genre = genreMatch[1].trim()
    }

    // Extract reason (everything after metadata)
    const lines = info.description.split('\n').filter(l => l.trim())
    const reasonLines = lines.filter(line => {
      const lower = line.toLowerCase()
      return !lower.includes('livelib') &&
             !lower.includes('goodreads') &&
             !lower.match(/^\d+\s*(стр|pages)/) &&
             !lower.includes('автор:') &&
             !lower.includes('author:') &&
             !lower.includes('жанр:') &&
             !lower.includes('genre:')
    })
    if (reasonLines.length > 0) {
      info.reason = reasonLines.join(' ').trim()
    }
  }

  return info
}

/**
 * Fetch books from Todoist API
 */
export async function fetchBooks(apiToken) {
  if (!apiToken) {
    throw new Error('Todoist API token is required')
  }

  // Find books project
  const projectId = await findBooksProject(apiToken)

  // Fetch sections
  const sections = await fetchBooksSections(apiToken, projectId)

  // Fetch tasks
  const response = await fetchWithRetry(`${TODOIST_API_URL}/tasks?project_id=${projectId}`, {
    headers: { 'Authorization': `Bearer ${apiToken}` }
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Неверный Todoist токен. Проверьте настройки.')
    } else if (response.status === 403) {
      throw new Error('Нет доступа к проекту в Todoist.')
    } else if (response.status >= 500) {
      throw new Error('Сервер Todoist временно недоступен. Попробуйте позже.')
    }
    throw new Error(`Ошибка Todoist: ${response.status}`)
  }

  const tasks = await response.json()

  // Filter and parse books
  const books = tasks
    .filter(task => {
      // Skip subtasks
      if (task.parent_id) return false
      // Skip items that look like headers
      if (task.content.startsWith('*')) return false
      // Skip items starting with bullet points
      if (task.content.startsWith('•')) return false
      return true
    })
    .map(task => parseBookInfo(task, tasks, sections))

  return books
}

/**
 * Get available sections
 */
export function getBooksSections() {
  return booksSections
}

/**
 * Complete (close) a book task
 */
export async function completeBookTask(apiToken, taskId) {
  if (!apiToken) {
    throw new Error('Todoist API token is required')
  }

  const response = await fetchWithRetry(`${TODOIST_API_URL}/tasks/${taskId}/close`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiToken}` }
  })

  if (!response.ok) {
    throw new Error(`Ошибка Todoist: ${response.status}`)
  }

  return true
}

/**
 * Create a new task for book review
 */
export async function createBookReviewTask(apiToken, bookTitle) {
  if (!apiToken) {
    throw new Error('Todoist API token is required')
  }

  const response = await fetchWithRetry(`${TODOIST_API_URL}/tasks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: `Написать отзыв на книгу «${bookTitle}»`
    })
  })

  if (!response.ok) {
    throw new Error(`Ошибка Todoist: ${response.status}`)
  }

  return await response.json()
}

/**
 * Update book task due date
 */
export async function updateBookDueDate(apiToken, taskId, dueDate) {
  if (!apiToken) {
    throw new Error('Todoist API token is required')
  }

  const body = dueDate
    ? { due_date: dueDate }
    : { due_string: 'no date' }

  const response = await fetchWithRetry(`${TODOIST_API_URL}/tasks/${taskId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`Ошибка Todoist: ${response.status}`)
  }

  return await response.json()
}

/**
 * Clear cached project info (useful when switching accounts)
 */
export function clearBooksCache() {
  booksProjectId = null
  booksSections = {}
}
