import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { buildAll } from './tools/lib/pipeline.mjs'

/**
 * 构建期把 papers/ 编译成 public/data/{index.json,articles/*.json}。
 * dev 下改 md 会自动重建并刷新。
 */
function woyaoreadContent(): Plugin {
  let root = process.cwd()
  return {
    name: 'woyaoread-content',
    configResolved(c) {
      root = c.root
    },
    async buildStart() {
      const r = await buildAll(root)
      if (r.errors.length) {
        for (const e of r.errors) this.error(`[woyaoread] ${e.code}: ${e.message}`)
      }
    },
    configureServer(server) {
      const watch = ['papers', 'ext'].map((d) => path.join(root, d))
      server.watcher.add(watch)
      server.watcher.on('all', async (_e, file) => {
        if (file.includes(`${path.sep}public${path.sep}`)) return
        if (!watch.some((w) => file.startsWith(w))) return
        try {
          const r = await buildAll(root)
          if (r.errors.length) {
            server.config.logger.error(
              `[woyaoread] ${r.errors.map((e) => `${e.code}: ${e.message}`).join('; ')}`,
            )
          }
          server.ws.send({ type: 'full-reload' })
        } catch (err) {
          server.config.logger.error(`[woyaoread] ${(err as Error).message}`)
        }
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [vue(), woyaoreadContent()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: true,
    assetsInlineLimit: 4096,
  },
  server: { port: 5178, host: true },
  preview: { port: 5178 },
})
