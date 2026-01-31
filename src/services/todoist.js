// Todoist API Service
const TODOIST_API_URL = 'https://api.todoist.com/rest/v2'

// Project ID for "🍿 Фильмы"
const MOVIES_PROJECT_ID = '6Crg4FqFXpXHmmXm'

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
    kinopoiskRating: null,
    imdbRating: null,
    duration: null,
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

    // Duration (e.g., "2 ч 9 минут" or "45 минут" or "1 ч 38 минут")
    const durationMatch = info.description.match(/(\d+)\s*ч(?:\s*(\d+)\s*мин)?|(\d+)\s*мин/i)
    if (durationMatch) {
      if (durationMatch[3]) {
        info.duration = parseInt(durationMatch[3])
      } else {
        const hours = parseInt(durationMatch[1]) || 0
        const minutes = parseInt(durationMatch[2]) || 0
        info.duration = hours * 60 + minutes
      }
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
 * Fetch movies from Todoist API
 */
export async function fetchMovies(apiToken) {
  if (!apiToken) {
    throw new Error('Todoist API token is required')
  }

  // First fetch sections to get actual section IDs and names
  const sectionsResponse = await fetch(`${TODOIST_API_URL}/sections?project_id=${MOVIES_PROJECT_ID}`, {
    headers: {
      'Authorization': `Bearer ${apiToken}`
    }
  })

  let actualSections = {}
  if (sectionsResponse.ok) {
    const sections = await sectionsResponse.json()
    sections.forEach(section => {
      actualSections[section.id] = section.name
    })
    console.log('Fetched sections:', actualSections)
  }

  const response = await fetch(`${TODOIST_API_URL}/tasks?project_id=${MOVIES_PROJECT_ID}`, {
    headers: {
      'Authorization': `Bearer ${apiToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Todoist API error: ${response.status}`)
  }

  const tasks = await response.json()

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

  const response = await fetch(`${TODOIST_API_URL}/tasks/${taskId}/close`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Todoist API error: ${response.status}`)
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

  const response = await fetch(`${TODOIST_API_URL}/tasks`, {
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
    throw new Error(`Todoist API error: ${response.status}`)
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

  const response = await fetch(`${TODOIST_API_URL}/sections?project_id=${MOVIES_PROJECT_ID}`, {
    headers: {
      'Authorization': `Bearer ${apiToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Todoist API error: ${response.status}`)
  }

  const sections = await response.json()
  return sections.filter(s => s.id !== SECTIONS.RULES)
}
