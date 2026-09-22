#!/usr/bin/env node
/**
 * Serves dist/client the way Netlify does: static files, plus a catch-all
 * `/* -> /index.html` returning 200 for everything else.
 *
 * The e2e suite uses this rather than `vite dev`, for two reasons.
 *
 * Route guards. `vite dev` renders on the server, so every beforeLoad hits
 * `typeof document === 'undefined'` and returns early without redirecting, and
 * the client does not necessarily re-run it on hydration. Production never does
 * that — it is a prerendered SPA, the shell is static, and the router evaluates
 * beforeLoad in the browser where the redirect actually happens. Driving the dev
 * server would mean testing a code path that never ships.
 *
 * Logging. The dev server loads @tanstack/devtools-vite, which forwards client
 * console output to the server, which logs it, which the client picks up and
 * forwards again. Any repeating client-side error grows exponentially; one run
 * wrote a 17GB log and filled the disk. A production build contains no devtools
 * plugin and no SSR pass, so neither the loop nor its triggers exist here.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import process from 'node:process'

const ROOT = new URL('../dist/client/', import.meta.url).pathname
const PORT = Number(process.env['E2E_PORT'] ?? 3100)
const HOST = '127.0.0.1'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

async function readIfFile(path) {
  try {
    const s = await stat(path)
    return s.isFile() ? await readFile(path) : null
  } catch {
    return null
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
    // normalize() collapses any ../ segments before they can escape ROOT.
    const rel = normalize(decodeURIComponent(url.pathname)).replace(
      /^(\.\.[/\\])+/,
      '',
    )

    let body = rel === '/' ? null : await readIfFile(join(ROOT, rel))
    let type = TYPES[extname(rel)] ?? 'application/octet-stream'

    if (!body) {
      body = await readIfFile(join(ROOT, 'index.html'))
      type = TYPES['.html']
      if (!body) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('dist/client/index.html is missing — the build did not run.')
        return
      }
    }

    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(body)
  })()
})

server.listen(PORT, HOST, () => {
  console.log(`[e2e] serving dist/client at http://${HOST}:${PORT}`)
})
