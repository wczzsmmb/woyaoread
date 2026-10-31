import { ref } from 'vue'

export type Route = { name: 'shelf' } | { name: 'read'; id: string }

export const route = ref<Route>({ name: 'shelf' })

function parse() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''))
  const m = /^\/p\/(\d{5,6})$/.exec(raw)
  route.value = m ? { name: 'read', id: m[1] } : { name: 'shelf' }
}

export function openArticle(id: string) {
  location.hash = `#/p/${id}`
}

export function goShelf() {
  location.hash = '#/'
}

export function startRouter() {
  window.addEventListener('hashchange', parse)
  parse()
}
