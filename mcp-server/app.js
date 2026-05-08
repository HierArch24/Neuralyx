// Passenger entrypoint for the NEURALYX MCP server on cPanel.
//
// Passenger's node-loader.js uses require() to load this file, which means
// we cannot use top-level await even though package.json sets
// "type": "module". Use dynamic import with then-chaining instead — the
// imported module's listen() call still runs to completion before any
// request arrives.

import http from 'node:http'

const PASSENGER_BASE_URI = process.env.PASSENGER_BASE_URI || '/api'

const originalCreateServer = http.createServer.bind(http)
http.createServer = function patchedCreateServer(handlerOrOptions, maybeHandler) {
  const handler = typeof handlerOrOptions === 'function'
    ? handlerOrOptions
    : maybeHandler
  if (typeof handler !== 'function') {
    return originalCreateServer.apply(http, arguments)
  }
  const wrapped = function wrappedHandler(req, res) {
    try {
      const u = String(req.url || '/')
      if (!u.startsWith(PASSENGER_BASE_URI)) {
        // /health → /api/health
        req.url = PASSENGER_BASE_URI + (u === '/' ? '' : u)
      }
    } catch { /* leave url as-is */ }
    return handler(req, res)
  }
  if (typeof handlerOrOptions === 'function') {
    return originalCreateServer(wrapped)
  }
  return originalCreateServer(handlerOrOptions, wrapped)
}

// Boot the actual server — dist/api.js calls server.listen(PORT, ...) on
// import. Use dynamic import without top-level await so Passenger's CJS
// node-loader.js can require() this file.
import('./dist/api.js').catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[neuralyx-mcp] fatal: failed to import dist/api.js:', err)
  process.exit(1)
})
