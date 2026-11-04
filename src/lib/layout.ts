import { reactive, watch } from 'vue'

/** 阅读面的排法：对开翻页 / 中英对照 / 单栏滚动 */
export type Mode = 'spread' | 'compare' | 'single'
export type Ratio = '5:5' | '4:6' | '6:4' | '3:7' | '7:3'
/** 纸色：纸白 / 米黄 / 护眼 / 夜间 */
export type Theme = 'light' | 'sepia' | 'green' | 'dark'
/** 页边距 */
export type Measure = 'narrow' | 'normal' | 'wide'
/** 正文字体 */
export type FontKind = 'hei' | 'song' | 'kai' | 'fangsong' | 'fzss' | 'ali'

export interface Layout {
  mode: Mode
  ratio: Ratio
  fontSize: number
  lineHeight: number
  theme: Theme
  measure: Measure
  font: FontKind
  /** 首行缩进（手机上默认关：靠段距分段，和微信读书一致） */
  indent: boolean
  immersive: boolean
  drawerWidth: 260 | 300 | 340
  /** 书架上显示封面；默认关，列表更清爽 */
  covers: boolean
}

const KEY = 'duiye:layout:v3'

export const DEFAULTS: Layout = {
  mode: 'spread',
  ratio: '5:5',
  fontSize: 21,
  lineHeight: 1.9,
  theme: 'light',
  measure: 'normal',
  font: 'hei',
  indent: false,
  immersive: false,
  drawerWidth: 300,
  covers: false,
}

/** 上一版的默认字号：浏览器里存着的还是这两个值时，跟着新默认走一次 */
const OLD_DEFAULT_FS = 19
const OLD_DEFAULT_LH = 1.85

function load(): Layout {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem('duiye:layout:v2')
    if (!raw) return { ...DEFAULTS }
    const saved = { ...DEFAULTS, ...JSON.parse(raw) } as Layout
    saved.fontSize = Math.min(40, Math.max(18, Math.round(saved.fontSize || DEFAULTS.fontSize)))
    if (!FONT_LABEL[saved.font]) saved.font = DEFAULTS.font
    // 只 migrate 一次：没动过字号（还是旧默认）的人升级到新默认，自己调过的不动
    if (!localStorage.getItem(`${KEY}:migrated-typo`)) {
      if (saved.fontSize === OLD_DEFAULT_FS) saved.fontSize = DEFAULTS.fontSize
      if (saved.lineHeight === OLD_DEFAULT_LH) saved.lineHeight = DEFAULTS.lineHeight
      // 老默认是宋体，新默认黑体；没自己换过字体的人跟着走一次
      if (saved.font === 'song') saved.font = DEFAULTS.font
      try {
        localStorage.setItem(`${KEY}:migrated-typo`, '1')
      } catch {
        /* 隐身窗口存不了就算了 */
      }
    }
    return saved
  } catch {
    return { ...DEFAULTS }
  }
}

export const layout = reactive<Layout>(load())

export const RATIOS: Record<Ratio, number[]> = {
  '5:5': [1, 1],
  '4:6': [4, 6],
  '6:4': [6, 4],
  '3:7': [3, 7],
  '7:3': [7, 3],
}

export const MODE_LABEL: Record<Mode, string> = {
  spread: '对开',
  compare: '对照',
  single: '单栏',
}

export const THEME_LABEL: Record<Theme, string> = {
  light: '纸白',
  sepia: '米黄',
  green: '护眼',
  dark: '夜间',
}

export const MEASURE_LABEL: Record<Measure, string> = {
  narrow: '窄',
  normal: '中',
  wide: '宽',
}

/** 顺序就是面板上的顺序：黑体排第一，也是默认字体 */
export const FONT_LABEL: Record<FontKind, string> = {
  hei: '黑体',
  song: '宋体',
  kai: '文楷',
  fangsong: '仿宋',
  fzss: '方正书宋',
  ali: '阿里普惠',
}

/**
 * 每个字体选项的字族栈（先装先得）。
 * 方正 / 阿里巴巴 / 思源这些不往仓库里塞字体文件：装了就用，没装就落到后面的兜底，
 * 和国内阅读器的做法一致（文楷是唯一的 CDN 字体，见 index.html）。
 */
export const FONT_STACK: Record<FontKind, string> = {
  hei: '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif',
  song: '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "Noto Serif SC", "SimSun", Georgia, serif',
  kai: '"LXGW WenKai GB", "LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", serif',
  fangsong: '"FangSong", "STFangsong", "FZFangSong-Z02S", "Songti SC", "SimSun", serif',
  fzss: '"FZShuSong-Z01", "FZShuSong", "Songti SC", "Noto Serif CJK SC", "SimSun", serif',
  ali: '"Alibaba PuHuiTi 3.0", "Alibaba PuHuiTi 2.0", "AlibabaPuHuiTi", "PingFang SC", "Microsoft YaHei", sans-serif',
}

/** 页边距对应的纸内边距（宽屏） */
const PAD: Record<Measure, number> = { narrow: 48, normal: 72, wide: 96 }
/** 手机上的页边距：纸就是屏幕，左右留白 */
const PAD_M: Record<Measure, number> = { narrow: 15, normal: 20, wide: 27 }

/** 浏览器 UI（状态栏）跟着纸色走 */
const CHROME: Record<Theme, string> = {
  light: '#ffffff',
  sepia: '#f8f4ea',
  green: '#e6eddf',
  dark: '#1c1d20',
}

watch(
  layout,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {}
    applyVars()
  },
  { deep: true },
)

/**
 * 正文字体的 descent：内容盒底边到基线的距离，按 em 归一。
 *
 * 波浪线是背景图，`background-position: 100%` 指的是内容盒底边（= 基线 + descent）。
 * descent 各家字体差很多（宋体 / 苹方 0.34em，霞鹜文楷 0.26em，华文细黑 0.11em），
 * 写死偏移就会有的字体贴字、有的浮在行间，所以这里量一次，交给 CSS 的 --wave-desc。
 *
 * 量法：inline 元素的边框盒高度就是字体内容盒（不受 line-height 影响），
 * 再放一个 0 高的 inline-block 探针，它的底边正好落在基线上，两者一减就是 descent。
 */
const WAVE_DESC_FALLBACK = 0.34

function syncWaveDescent() {
  if (!document.body) return
  const box = document.createElement('div')
  box.style.cssText =
    'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;' +
    'font-family:var(--font-body);font-size:100px;line-height:1;white-space:pre'
  const text = document.createElement('span')
  text.textContent = '国'
  const probe = document.createElement('span')
  probe.style.cssText = 'display:inline-block;width:0;height:0'
  box.append(text, probe)
  document.body.appendChild(box)
  let ratio = WAVE_DESC_FALLBACK
  try {
    const descent = (text.getBoundingClientRect().bottom - probe.getBoundingClientRect().top) / 100
    if (descent > 0.05 && descent < 0.6) ratio = descent
  } catch {
    /* 量不到就用默认值 */
  } finally {
    box.remove()
  }
  document.documentElement.style.setProperty('--wave-desc', String(Math.round(ratio * 1000) / 1000))
}

export function applyVars() {
  const r = document.documentElement.style
  r.setProperty('--fs', `${layout.fontSize}px`)
  r.setProperty('--lh', String(layout.lineHeight))
  r.setProperty('--drawer-w', `${layout.drawerWidth}px`)
  r.setProperty('--page-pad', `${PAD[layout.measure] || 72}px`)
  r.setProperty('--page-pad-m', `${PAD_M[layout.measure] || 20}px`)
  r.setProperty('--indent', layout.indent ? '2em' : '0em')
  r.setProperty('--font-body', FONT_STACK[layout.font] || FONT_STACK.hei)
  document.documentElement.dataset.theme = layout.theme
  document.documentElement.dataset.font = layout.font
  document.documentElement.dataset.indent = layout.indent ? 'on' : 'off'
  document.documentElement.dataset.covers = layout.covers ? 'on' : 'off'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[layout.theme] || '#ffffff')
  // 量字体的 descent：要放在 data-font 改完之后，不然量到的是上一套字体
  syncWaveDescent()
}

/** 没有对照层时不能停在「对照」上，退回对开 */
export function normalizeMode(hasZh: boolean) {
  if (!hasZh && layout.mode === 'compare') layout.mode = 'spread'
}

applyVars()
