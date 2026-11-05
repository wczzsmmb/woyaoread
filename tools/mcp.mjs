/**
 * MCP server（stdio）：把我要读书的工具暴露给 AI 客户端。
 *   node tools/mcp.mjs
 *
 * 原则：AI 不能直接写 papers/ 或 _woyaoread/annotations/，
 * ingest / build / doctor 都走同名命令，写批注走同一套校验。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { scan } from './lib/scan.mjs'
import { toBlocks } from './lib/render.mjs'
import { validateDraft } from './lib/validate.mjs'
import { readAnnotations, writeAnnotation } from './lib/annotations.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VERSION = '0.1.0'

const run = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }))
  })

const tools = [
  {
    name: 'woyaoread_list',
    description: '列出全库分类树与篇目（编号、标题、是否有对照层、块数、对齐率、关键词）',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'woyaoread_read',
    description: '读一篇文章的块文本（可按层），用于理解内容',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '5–6 位编号，例如 00007' },
        layer: { type: 'string', enum: ['index', 'zh'], description: '层，默认 index' },
        from: { type: 'number', description: '起始块序号（0 起）' },
        to: { type: 'number', description: '结束块序号（不含）' },
      },
      required: ['id'],
    },
  },
  {
    name: 'woyaoread_validate',
    description: '校验一个草稿目录（不写入）。返回 errors / warnings / stats',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: '草稿目录，例如 _woyaoread/cache/foo' },
        cat: { type: 'string', description: '打算放进的分类，例如 深度学习/注意力机制' },
      },
      required: ['dir'],
    },
  },
  {
    name: 'woyaoread_ingest',
    description: '把草稿装进 papers/（先校验，不合格会拒绝并返回错误）',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string' },
        cat: { type: 'string' },
      },
      required: ['dir'],
    },
  },
  {
    name: 'woyaoread_doctor',
    description: '全库巡检：编号重复/孔洞、孤儿批注、失联批注、对齐异常',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'woyaoread_build',
    description: '构建静态站点到 dist/（改完 md 后调用）',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'woyaoread_annotation_write',
    description: '给某篇文章的某个块写/删批注。key 形如 index::3f9a2c81',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        key: { type: 'string', description: '层名::块哈希' },
        layer: { type: 'string', enum: ['index', 'zh'] },
        quote: { type: 'string', description: '该块原文快照（可选）' },
        text: { type: 'string', description: '批注内容，空字符串表示删除' },
      },
      required: ['id', 'key', 'layer', 'text'],
    },
  },
]

async function titleOf(a) {
  try {
    const meta = (await import('js-yaml')).default
    const raw = await fs.readFile(path.join(a.dir, 'meta.yml'), 'utf8').catch(() => '')
    const m = raw ? meta.load(raw) : null
    if (m && typeof m === 'object' && m.title) return String(m.title)
  } catch {}
  const md = await fs.readFile(path.join(a.dir, 'index.md'), 'utf8').catch(() => '')
  const h = /^#\s+(.+)$/m.exec(md)
  return h ? h[1].trim() : a.slug
}

async function findArticle(id) {
  const { articles } = await scan(ROOT)
  const hit = articles.find((a) => a.id === id || String(a.n) === String(Number(id)))
  return hit || null
}

const handlers = {
  async woyaoread_list() {
    const { articles, cats, errors } = await scan(ROOT)
    const flat = []
    for (const a of articles) {
      flat.push({ id: a.id, title: await titleOf(a), cats: a.cats, dir: a.relDir })
    }
    return { ok: errors.length === 0, articles: flat.length, cats, articlesList: flat, errors }
  },

  async woyaoread_read({ id, layer = 'index', from = 0, to }) {
    if (!['index', 'zh'].includes(layer)) throw new Error('layer 只能是 index 或 zh')
    const a = await findArticle(id)
    if (!a) throw new Error(`找不到文章 ${id}`)
    const file = path.join(a.dir, layer === 'zh' ? 'zh.md' : 'index.md')
    const md = await fs.readFile(file, 'utf8').catch(() => '')
    const blocks = toBlocks(md, layer)
    const slice = blocks.slice(from, to ?? blocks.length)
    return {
      id: a.id,
      slug: a.slug,
      cats: a.cats,
      total: blocks.length,
      blocks: slice.map((b, i) => ({ i: from + i, h: b.h, type: b.type, text: b.text })),
    }
  },

  async woyaoread_validate({ dir, cat }) {
    const r = await validateDraft(path.resolve(ROOT, dir), { cat })
    return r
  },

  async woyaoread_ingest({ dir, cat }) {
    const args = ['tools/ingest.mjs', dir, '--json']
    if (cat) args.push('--cat', cat)
    const r = await run(args)
    let parsed = null
    try {
      parsed = JSON.parse(r.out)
    } catch {}
    return { ok: r.code === 0, exitCode: r.code, result: parsed, output: r.out, error: r.err }
  },

  async woyaoread_doctor() {
    const r = await run(['tools/doctor.mjs', '--json'])
    let parsed = null
    try {
      parsed = JSON.parse(r.out)
    } catch {}
    return { ok: r.code === 0, report: parsed, output: parsed ? undefined : r.out, error: r.err }
  },

  async woyaoread_build() {
    const r = await run(['node_modules/vite/bin/vite.js', 'build'])
    return { ok: r.code === 0, exitCode: r.code, output: r.out.split('\n').slice(-12).join('\n'), error: r.err }
  },

  async woyaoread_annotation_write({ id, key, layer, quote, text }) {
    const data = await writeAnnotation(ROOT, id, { key, layer, quote, text })
    return { ok: true, count: Object.keys(data.items || {}).length }
  },
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')

async function handle(req) {
  const { id, method, params } = req
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'woyaoread', version: VERSION },
      },
    }
  }
  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return null
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} }
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools } }
  if (method === 'tools/call') {
    const name = params?.name
    const fn = handlers[name]
    if (!fn) {
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `未知工具 ${name}` }], isError: true } }
    }
    try {
      const result = await fn(params?.arguments || {})
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } }
    } catch (e) {
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `错误：${e.message || e}` }], isError: true },
      }
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  const text = line.trim()
  if (!text) return
  let req
  try {
    req = JSON.parse(text)
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  const res = await handle(req)
  if (res) send(res)
})

process.stderr.write(`woyaoread mcp v${VERSION} ready (root=${ROOT})\n`)
