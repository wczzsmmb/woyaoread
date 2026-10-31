import { createApp } from 'vue'
import App from './App.vue'
import 'katex/dist/katex.min.css'
import './styles/base.css'
import { startRouter } from './lib/router'
import { applyVars, layout } from './lib/layout'

applyVars()
startRouter()

createApp(App).mount('#app')

// PWA：只在构建产物里注册（dev 下不注册，免得缓存干扰）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {})
  })
}

void layout
