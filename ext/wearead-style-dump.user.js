// ==UserScript==
// @name         微信读书 · 划线样式抓取（给「我要读书」对样式用）
// @namespace    woyaoread
// @version      1.0
// @description  在微信读书网页版里把马克笔/波浪线/直线/虚线的真实 CSS 打出来，复制给 AI 去对齐
// @match        https://weread.qq.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

;(() => {
  const PROPS = [
    'background-color',
    'background-image',
    'background-size',
    'background-position',
    'background-repeat',
    'text-decoration-line',
    'text-decoration-style',
    'text-decoration-color',
    'text-decoration-thickness',
    'text-underline-offset',
    'text-decoration-skip-ink',
    'border-bottom',
    'padding-bottom',
    'box-shadow',
    '-webkit-box-decoration-break',
    'mix-blend-mode',
    'font-size',
    'line-height',
    'display',
  ]

  /** 判断一个元素是不是「划线」：有底色 / 有背景图 / 有下划线 / 有下边框 */
  function looksMarked(el) {
    const cs = getComputedStyle(el)
    const bg = cs.backgroundColor
    const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
    const hasImg = cs.backgroundImage && cs.backgroundImage !== 'none'
    const hasDeco = cs.textDecorationLine && cs.textDecorationLine !== 'none'
    const hasBorder = parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none'
    return hasBg || hasImg || hasDeco || hasBorder
  }

  /** 只留正文区，别把 UI 上的按钮也扫进来 */
  function inReader(el) {
    let n = el
    for (let i = 0; i < 10 && n; i++) {
      const c = String(n.className || '')
      if (/readerChapterContent|chapterContent|reader_content|content/i.test(c)) return true
      n = n.parentElement
    }
    return false
  }

  const signature = (it) => [it.bg, it.img, it.deco, it.border].join('|')

  function collect() {
    const out = []
    const seen = new Set()
    for (const el of document.querySelectorAll('span, div, i, em, b, strong, p, a')) {
      const text = (el.textContent || '').trim()
      if (!text || text.length > 400) continue
      if (!inReader(el)) continue
      if (!looksMarked(el)) continue
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) continue

      const item = {
        tag: el.tagName.toLowerCase(),
        class: el.className || '',
        inlineStyle: el.getAttribute('style') || '',
        text: text.slice(0, 60),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bg: cs.backgroundColor,
        img: cs.backgroundImage,
        deco: cs.textDecorationLine + ' ' + cs.textDecorationStyle + ' ' + cs.textDecorationColor,
        border: cs.borderBottom,
        computed: Object.fromEntries(PROPS.map((p) => [p, cs.getPropertyValue(p)])),
        outerHTML: el.outerHTML.slice(0, 600),
      }
      const sig = signature(item)
      if (seen.has(sig)) continue
      seen.add(sig)
      out.push(item)
      if (out.length >= 12) break
    }
    return out
  }

  function show(data) {
    const json = JSON.stringify(data, null, 2)
    console.log('[woyaoread] 划线样式', data)
    const wrap = document.createElement('div')
    wrap.style.cssText =
      'position:fixed;inset:24px;z-index:2147483647;background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;padding:14px;font:13px/1.5 -apple-system,sans-serif'
    const head = document.createElement('div')
    head.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:8px'
    head.innerHTML =
      '<b style="flex:1">抓到的划线样式（' +
      data.length +
      ' 种）· 全选复制发给 AI</b>' +
      '<button id="__dy_copy" style="padding:5px 12px;border-radius:8px;border:1px solid #ddd;background:#f6f7f8">复制</button>' +
      '<button id="__dy_close" style="padding:5px 12px;border-radius:8px;border:1px solid #ddd;background:#f6f7f8">关闭</button>'
    const ta = document.createElement('textarea')
    ta.value = json
    ta.style.cssText =
      'flex:1;width:100%;font:12px/1.45 ui-monospace,Menlo,monospace;border:1px solid #eee;border-radius:8px;padding:10px;resize:none'
    wrap.append(head, ta)
    document.body.appendChild(wrap)
    head.querySelector('#__dy_close').onclick = () => wrap.remove()
    head.querySelector('#__dy_copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(json)
        head.querySelector('#__dy_copy').textContent = '已复制'
      } catch {
        ta.select()
        document.execCommand('copy')
      }
    }
    ta.focus()
    ta.select()
  }

  function mount() {
    if (document.getElementById('__dy_dump')) return
    const btn = document.createElement('button')
    btn.id = '__dy_dump'
    btn.textContent = '抓划线样式'
    btn.style.cssText =
      'position:fixed;right:18px;bottom:18px;z-index:2147483646;padding:9px 14px;border-radius:999px;border:0;background:#1e7fff;color:#fff;font:13px/1 -apple-system,sans-serif;box-shadow:0 10px 24px rgba(30,127,255,.35);cursor:pointer'
    btn.onclick = () => {
      const data = collect()
      if (!data.length) {
        alert('这一页没找到划线。先把正文滚动到有马克笔/波浪线/下划线的地方再点。')
        return
      }
      show(data)
    }
    document.body.appendChild(btn)
  }

  // 微信读书是 SPA，切章节后按钮会被冲掉，所以盯一下
  setInterval(mount, 1500)
})()
