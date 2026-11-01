/**
 * 本地服务：静态站点 + 批注 API。
 *   npm start                 http://127.0.0.1:43999
 *   npm start -- --host       监听 0.0.0.0（手机同一 Wi-Fi 可用）
 *   npm start -- --port 44000
 *
 * 只碰 _duiye/annotations/，绝不修改 papers/ 里的 md。
 */
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { readAnnotations, writeAnnotation, ID_RE } from './lib/annotations.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

const argv = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const PORT = Number(argOf('port', 43999))
// --host            → 0.0.0.0（局域网 / 手机）
// --host 100.x.y.z  → 只绑定某个网卡（例如 Tailscale 地址，最省事也最安全）
const hostArg = (() => {
  const i = argv.indexOf('--host')
  if (i < 0) return null
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : '0.0.0.0'
})()
const HOST = hostArg || '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}
const COMPRESSIBLE = /\.(html|js|mjs|css|json|svg|map|webmanifest|txt)$/
const gzCache = new Map()

const json = (res, code, body) => {
  const s = JSON.stringify(body)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  })
  res.end(s)
}

const readBody = (req, limit = 1 << 20) =>
  new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0])
  if (rel === '/' || rel === '') rel = '/index.html'
  const target = path.join(DIST, rel)
  if (!target.startsWith(DIST)) {
    res.writeHead(403).end('forbidden')
    return
  }
  let buf
  let mtime = 0
  try {
    const st = await fs.stat(target)
    mtime = st.mtimeMs
    buf = await fs.readFile(target)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404')
    return
  }
  const ext = path.extname(target).toLowerCase()
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': rel.startsWith('/data/') || rel.startsWith('/media/') ? 'no-cache' : 'public, max-age=600',
  }
  const accept = String(req.headers['accept-encoding'] || '')
  if (COMPRESSIBLE.test(rel) && accept.includes('gzip') && buf.length > 1024) {
    // 缓存键带 mtime：重新构建后不会再把旧的 gzip 结果发出去
    const key = `${target}:${mtime}`
    let gz = gzCache.get(key)
    if (!gz) {
      gz = zlib.gzipSync(buf, { level: 6 })
      if (gzCache.size > 400) gzCache.clear()
      gzCache.set(key, gz)
    }
    headers['content-encoding'] = 'gzip'
    headers['vary'] = 'Accept-Encoding'
    res.writeHead(200, headers).end(gz)
    return
  }
  res.writeHead(200, headers).end(buf)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const p = url.pathname

  if (p.startsWith('/api/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,PUT,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      })
      res.end()
      return
    }
    if (p === '/api/ping') return json(res, 200, { ok: true, v: 1, app: 'duiye' })

    const m = /^\/api\/annotations\/(\d{5,6})$/.exec(p)
    if (m) {
      const id = m[1]
      if (!ID_RE.test(id)) return json(res, 400, { ok: false, error: 'bad id' })
      try {
        if (req.method === 'GET') return json(res, 200, await readAnnotations(ROOT, id))
        if (req.method === 'PUT') {
          const body = await readBody(req)
          const data = await writeAnnotation(ROOT, id, body)
          return json(res, 200, { ok: true, count: Object.keys(data.items || {}).length })
        }
      } catch (e) {
        return json(res, 400, { ok: false, error: String(e.message || e) })
      }
    }
    return json(res, 404, { ok: false, error: 'no such api' })
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('method not allowed')
    return
  }
  try {
    await serveStatic(req, res, p)
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(e.message || e))
  }
})

server.listen(PORT, HOST, () => {
  console.log(`对页 · http://${HOST}:${PORT}`)
  console.log(`  静态目录 ${DIST}`)
  console.log(`  批注数据 _duiye/annotations/`)
  if (!fs.access(DIST).then(() => true, () => false)) {
    console.log('  ! 还没有 dist/，先跑 npm run build')
  }
})
