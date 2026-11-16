// Todoist API Service
const TODOIST_API_URL = 'https://api.todoist.com/api/v1'

// Project ID for "🍿 Фильмы"
const MOVIES_PROJECT_ID = '6Crg4FqFXpXHmmXm'

// CORS proxy URL (set via setCorsProxy)
let corsProxyUrl = ''

/**
 * Set the CORS proxy URL for all Todoist API requests.
 * The proxy URL is prepended to the Todoist API URL.
 * Example: 'https://my-proxy.workers.dev/' will turn
 *   'https://api.todoist.com/rest/v2/tasks' into
 *   'https://my-proxy.workers.dev/https://api.todoist.com/rest/v2/tasks'
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
 * Retries up to 3 times with exponential backoff
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

      // Wait before retrying (exponential backoff: 1s, 2s, 4s)
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // All retries failed
  throw new Error(`Ошибка сети: ${lastError?.message || 'не удалось подключиться'}. Проверьте интернет-соединение.`)
}

/**
 * Fetch all pages from a paginated API v1 endpoint.
 * Returns a flat array of all results.
 */
async function fetchAllPages(url, options = {}) {
  const allResults = []
  let cursor = null

  do {
    const separator = url.includes('?') ? '&' : '?'
    const pageUrl = cursor ? `${url}${separator}cursor=${cursor}` : url
    const response = await fetchWithRetry(pageUrl, options)

    if (!response.ok) return { ok: false, status: response.status, results: [] }

    const data = await response.json()
    const results = Array.isArray(data) ? data : (data.results || [])
    allResults.push(...results)
    cursor = data.next_cursor || null
  } while (cursor)

  return { ok: true, status: 200, results: allResults }
}

// Section IDs
export const SECTIONS = {
  RULES: '674GCv5g249xxp3F',
  WATCHING_NOW: '6W4Gvr7pfmMVpJ2m',
  MOVIES: '65CW5hwj3GQG3PCF',
  SERIES: '65CVq4gf6VxMW5jm',
  TOP_25: '6frj8jR8vM5299vm'
}

export const SECTION_NAMES = {
  [SECTIONS.RULES]: 'Правила',
  [SECTIONS.WATCHING_NOW]: 'Смотрю сейчас',
  [SECTIONS.MOVIES]: 'Фильмы',
  [SECTIONS.SERIES]: 'Сериалы',
  [SECTIONS.TOP_25]: '25 главных фильмов XXI века'
}

/**
 * Parse movie info from Todoist task
 */
export function parseMovieInfo(task, allTasks = [], actualSections = {}) {
  // Use actual section name from API if available, otherwise fall back to constants
  const sectionName = actualSections[task.section_id] || SECTION_NAMES[task.section_id] || 'Другое'
  
  const info = {
    id: task.id,
    title: task.content,
    description: task.description || '',
    sectionId: task.section_id,
    sectionName: sectionName,
    labels: task.labels || [],
    priority: task.priority,
    dueDate: task.due?.date || null,
    kinopoiskRating: null,
    imdbRating: null,
    reason: null,
    year: null,
    director: null,
    isSeries: false,
    seasons: null,
    episodes: null
  }
  
  // Debug logging for specific movie
  if (info.title && info.title.includes('Когда они увидят нас')) {
    console.log('parseMovieInfo debug for "Когда они увидят нас":', {
      title: info.title,
      sectionId: info.sectionId,
      sectionName: info.sectionName,
      actualSectionName: actualSections[task.section_id],
      sectionIdMatch: info.sectionId === SECTIONS.SERIES,
      isSeriesSection: sectionName === 'Сериалы' || sectionName.toLowerCase().includes('сериал'),
      SERIES_SECTION_ID: SECTIONS.SERIES
    })
  }

  // Determine if it's a series based on section
  // Check by section name (more reliable than ID which might change)
  // "Сериалы" section is ALWAYS a series, regardless of subtasks
  // "Смотрю сейчас" can contain both movies and series, so check subtasks
  const isSeriesSection = sectionName === 'Сериалы' || 
                          sectionName.toLowerCase().includes('сериал') ||
                          task.section_id === SECTIONS.SERIES
  info.isSeries = isSeriesSection

  // Count episodes from subtasks
  if (allTasks.length > 0) {
    const subtasks = allTasks.filter(t => t.parent_id === task.id)
    if (subtasks.length > 0) {
      // If has subtasks (episodes), it's definitely a series
      info.isSeries = true
      info.episodes = subtasks.length

      // Try to determine seasons from subtask content (e.g., "Сезон 4, Эпизод 16")
      const seasonNumbers = new Set()
      subtasks.forEach(st => {
        const seasonMatch = st.content.match(/[Сс]езон\s*(\d+)/i)
        if (seasonMatch) {
          seasonNumbers.add(parseInt(seasonMatch[1]))
        }
      })
      if (seasonNumbers.size > 0) {
        info.seasons = Math.max(...seasonNumbers)
      }
    } else if (task.section_id === SECTIONS.WATCHING_NOW) {
      // If in "Смотрю сейчас" but no subtasks, assume it's a movie (not a series)
      // But DON'T override if it's already in SERIES section
      if (task.section_id !== SECTIONS.SERIES) {
        info.isSeries = false
      }
    }
  } else if (task.section_id === SECTIONS.WATCHING_NOW) {
    // If in "Смотрю сейчас" but no subtasks at all, assume it's a movie
    // But DON'T override if it's already in SERIES section
    if (task.section_id !== SECTIONS.SERIES) {
      info.isSeries = false
    }
  }
  
  // Final check: if in SERIES section, always mark as series
  if (task.section_id === SECTIONS.SERIES) {
    info.isSeries = true
  }

  // Clean title from markers
  info.title = info.title
    .replace(/^[•*#\d]+\s*/, '')
    .replace(/^\d+\s+/, '')
    .trim()

  // Extract year from title (e.g., "Малхолланд Драйв (2001)")
  const yearMatch = info.title.match(/\((\d{4})\)/)
  if (yearMatch) {
    info.year = parseInt(yearMatch[1])
  }

  // Extract director from title (e.g., "— Дэвид Линч")
  const directorMatch = info.title.match(/—\s*(.+)$/)
  if (directorMatch) {
    info.director = directorMatch[1].trim()
    info.title = info.title.replace(/\s*—\s*.+$/, '').trim()
  }

  // Clean title further
  info.title = info.title.replace(/\s*\(\d{4}\)\s*/, ' ').trim()

  // Parse description for ratings and info
  if (info.description) {
    // Kinopoisk rating (e.g., "Кинопоиск:8.1" or "на Кинопоиске: 8.1")
    const kpMatch = info.description.match(/(?:Кинопоиск|на Кинопоиске)[:\s]*(\d+\.?\d*)/i)
    if (kpMatch) {
      info.kinopoiskRating = parseFloat(kpMatch[1])
    }

    // IMDb rating (e.g., "IMDb: 8.2" or "на IMDb: 8.2")
    const imdbMatch = info.description.match(/(?:IMDb|на IMDb)[:\s]*(\d+\.?\d*)/i)
    if (imdbMatch) {
      info.imdbRating = parseFloat(imdbMatch[1])
    }

    // Extract reason (everything after ratings info, or the whole description if no ratings)
    const lines = info.description.split('\n').filter(l => l.trim())
    const reasonLines = lines.filter(line => {
      const lower = line.toLowerCase()
      return !lower.includes('кинопоиск') &&
             !lower.includes('imdb') &&
             !lower.includes('оценка на') &&
             !line.match(/^\d+\s*(ч|мин)/) &&
             !line.match(/^\*\*Оценка/)
    })
    if (reasonLines.length > 0) {
      info.reason = reasonLines.join(' ').trim()
    }
  }

  return info
}

/**
 * Returns the movies project and all its descendant sub-projects.
 * Falls back to the root project alone if the projects list can't be loaded.
 */
async function fetchMovieProjects(headers) {
  const root = { id: MOVIES_PROJECT_ID, name: 'Фильмы' }
  const data = await fetchAllPages(`${TODOIST_API_URL}/projects`, { headers })
  if (!data.ok) return [root]

  const ids = new Set([MOVIES_PROJECT_ID])
  const result = [root]
  let added = true
  while (added) {
    added = false
    for (const p of data.results) {
      const parent = p.parent_id
      if (parent && ids.has(parent) && !ids.has(p.id)) {
        ids.add(p.id)
        result.push({ id: p.id, name: p.name })
        added = true
      }
    }
  }
  return result
}

function throwTodoistError(status) {
  if (status === 401) throw new Error('Неверный Todoist токен. Проверьте настройки.')
  if (status === 403) throw new Error('Нет доступа к проекту в Todoist.')
  if (status >= 500) throw new Error('Сервер Todoist временно недоступен. Попробуйте позже.')
  throw new Error(`Ошибка Todoist: ${status}`)
}

/**
 * Fetch movies from Todoist API
 */
export async function fetchMovies(apiToken) {
  if (!apiToken) {
    throw new Error('Todoist API token is required')
  }

  const headers = { 'Authorization': `Bearer ${apiToken}` }

  // Movies project plus all of its sub-projects (at any depth)
  const projects = await fetchMovieProjects(headers)

  const actualSections = {}
  const tasks = []
  for (const project of projects) {
    const sectionsData = await fetchAllPages(`${TODOIST_API_URL}/sections?project_id=${project.id}`, { headers })
    if (sectionsData.ok) {
      sectionsData.results.forEach(section => {
        actualSections[section.id] = section.name
      })
    }

    const projectTasks = await fetchAllPages(`${TODOIST_API_URL}/tasks?project_id=${project.id}`, { headers })
    if (!projectTasks.ok) {
      // Only the root project is mandatory; a failing sub-project is skipped
      if (project.id === MOVIES_PROJECT_ID) {
        throwTodoistError(projectTasks.status)
      }
      continue
    }
    // Tasks outside any section in a sub-project get the sub-project name
    projectTasks.results.forEach(task => {
      if (!task.section_id && project.id !== MOVIES_PROJECT_ID) {
        task.section_id = `project:${project.id}`
        actualSections[task.section_id] = project.name
      }
    })
    tasks.push(...projectTasks.results)
  }

  // Filter out rules and subtasks, parse movie info
  const movies = tasks
    .filter(task => {
      // Skip rules section
      if (task.section_id === SECTIONS.RULES) return false
      // Skip items that look like subtasks (start with •)
      if (task.content.startsWith('•')) return false
      // Skip items that are headers (start with *)
      if (task.content.startsWith('*')) return false
      // Skip subtasks (have parent_id)
      if (task.parent_id) return false
      return true
    })
    .map(task => parseMovieInfo(task, tasks, actualSections))

  return movies
}

/**
 * Complete (close) a task in Todoist
 */
export async function completeTask(apiToken, taskId) {
  if (!apiToken) {
    throw new Error('Todoist API token is required')
  }

  const response = await fetchWithRetry(`${TODOIST_API_URL}/tasks/${taskId}/close`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Ошибка Todoist: ${response.status}`)
  }

  return true
}

/**
 * Create a new task in Todoist Inbox
 */
export async function createTask(apiToken, content) {
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
      content: content
    })
  })

  if (!response.ok) {
    throw new Error(`Ошибка Todoist: ${response.status}`)
  }

  return await response.json()
}

/**
 * Update task due date in Todoist
 */
export async function updateTaskDueDate(apiToken, taskId, dueDate) {
  if (!apiToken) {
    throw new Error('Todoist API token is required')
  }

  // Use due_date for setting, due_string: "no date" for clearing
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
 * Get sections info
 */
export async function fetchSections(apiToken) {
  if (!apiToken) {
    throw new Error('Todoist API token is required')
  }

  const data = await fetchAllPages(`${TODOIST_API_URL}/sections?project_id=${MOVIES_PROJECT_ID}`, {
    headers: {
      'Authorization': `Bearer ${apiToken}`
    }
  })

  if (!data.ok) {
    throw new Error(`Ошибка Todoist: ${data.status}`)
  }

  return data.results.filter(s => s.id !== SECTIONS.RULES)
}
