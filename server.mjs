import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { roomMiddleware } from './lobby-server.ts'

const root = dirname(fileURLToPath(import.meta.url))
const dist = resolve(root, 'dist')
const port = Number(process.env.PORT ?? 4173)
const host = process.env.HOST ?? '0.0.0.0'
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end()
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  } catch {
    res.writeHead(400)
    res.end()
    return
  }
  const requested = resolve(dist, '.' + pathname)
  const pathWithinDist = relative(dist, requested)
  if (pathWithinDist.startsWith('..' + sep) || pathWithinDist === '..' || pathWithinDist.startsWith(sep)) {
    res.writeHead(403)
    res.end()
    return
  }
  let target = requested
  try {
    const file = await stat(target)
    if (!file.isFile()) throw new Error('Not a file')
  } catch {
    if (extname(pathname)) {
      res.writeHead(404)
      res.end()
      return
    }
    target = resolve(dist, 'index.html')
  }
  res.writeHead(200, {
    'Content-Type': mime[extname(target)] ?? 'application/octet-stream',
    'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(target).pipe(res)
}

const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/rooms')) {
    void roomMiddleware(req, res, () => {
      res.writeHead(404)
      res.end()
    })
  } else {
    void serveStatic(req, res)
  }
})

server.listen(port, host, () => {
  console.log(`Lacucu VTT disponível em http://${host}:${port}`)
})

