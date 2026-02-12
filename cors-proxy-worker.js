/**
 * Cloudflare Worker — CORS proxy for Todoist API.
 *
 * Deploy this worker to Cloudflare (free tier) and paste
 * the worker URL into Settings → CORS Proxy URL in the app.
 *
 * Usage:  https://<worker>.workers.dev/https://api.todoist.com/rest/v2/tasks
 *
 * Deploy steps:
 *   1. Create a free Cloudflare account at https://dash.cloudflare.com
 *   2. Go to Workers & Pages → Create Worker
 *   3. Paste this code and click Deploy
 *   4. Copy the worker URL (e.g. https://my-proxy.workers.dev)
 *   5. Paste it into Settings → CORS Proxy URL in the app
 */

const ALLOWED_ORIGINS = [
  'https://oledjo.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

const ALLOWED_API = 'https://api.todoist.com/'

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ''

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // Extract target URL from path
    const url = new URL(request.url)
    const target = url.pathname.slice(1) + url.search // remove leading /

    if (!target.startsWith(ALLOWED_API)) {
      return new Response('Forbidden', { status: 403 })
    }

    // Forward request to Todoist
    const headers = new Headers(request.headers)
    headers.delete('Host')

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    })

    // Return response with CORS headers
    const newResponse = new Response(response.body, response)
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      newResponse.headers.set(k, v)
    }
    return newResponse
  },
}

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}
