# 对页 · duiye

三栏 Markdown 精读器：**左选 · 中读 · 右对照**。
纯静态、无数据库、无云端；内容就是你自己的文件夹和 `md`。

- 构建期把 `md` 变成 HTML / KaTeX 公式 / JSON，前端只加载 Vue
- 批注由本地小服务写进 `_duiye/annotations/`，**程序从不修改 `papers/`**
- 批注的持久身份是「层名 + 段落内容哈希」，不是段号：插段、删段、挪目录都不会串位

详细约定见 [`规格书.md`](./规格书.md)。

---

## 快速开始

```bash
npm install
npm run build      # 生成 dist/ 与 public/data/
npm start          # http://127.0.0.1:43999
```

开发：

```bash
npm run dev        # http://localhost:5178（改 md 自动重建刷新）
```

手机写批注（同一 Wi-Fi）：

```bash
npm run build && npm start -- --host
# 手机打开 http://<电脑IP>:43999
```

---

## 内容：一个目录一篇

```
papers/
└─ 深度学习/                    ← 文字命名 = 分类（可多层）
   └─ 注意力机制/
      └─ 00007-注意力机制/      ← 5 位数字开头 = 一篇文章
         ├─ index.md           主层（必需）
         ├─ zh.md              对照层（可选；有它就能开双栏）
         ├─ meta.yml           可选：title / author / year / source / keywords / slug
         ├─ style.css          可选：本篇样式（构建期自动加作用域 .a-00007）
         ├─ script.js          可选：本篇脚本（进入该篇时加载）
         └─ img/               图片（img/a.png → ./media/00007/a.png）
```

- **分类 = 目录层级**，没有标签系统；只有 `keywords`，用于搜索
- 编号 5 位、**永不回收**、允许空号；超过 99999 自动变 6 位
- 正文可以直接写 HTML；`<script>` 不执行（要 JS 就写 `script.js`）

---

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发预览 |
| `npm run build` | 构建 `dist/` |
| `npm start` | 本地服务（静态 + 批注 API），端口 **43999** |
| `npm run new -- 短名 [--cat 分类/子类]` | 发号 + 建空文章骨架 |
| `npm run validate -- <草稿目录>` | 只校验，不写入 |
| `npm run ingest -- <草稿目录> [--cat …]` | 校验 + 发号 + 装进 `papers/` |
| `npm run doctor` | 巡检：编号重复/空号、孤儿批注、失联批注、对齐异常 |
| `npm run mcp` | 启动 MCP server（给 AI 用） |

`doctor` 和 `validate` 都支持 `--json`。

---

## 批注

- 数据在 `_duiye/annotations/<编号>.json`，按编号命名，挪目录不丢
- 主键 `层名::内容哈希`，例如 `index::3f9a2c81`
- 段落被改写导致哈希失配时，用存的原文快照重新定位；再不行进「失联批注」，内容不丢
- 删除文章不会删批注文件（编号不回收，不会误挂到别的文章）
- 批注服务没启动时自动只读，写不进去的会进 localStorage 草稿箱，服务回来后自动补写

写入是原子的（临时文件 + rename），并保留 3 份 `.bak`。

---

## 字标 / 图标

字标是**取字形轮廓生成的 SVG**（不依赖字体文件、不用 SVG `<text>`，渲染不会抖）：

```bash
# 需要 fonttools（一次性）
python3 -m venv /tmp/ftenv && /tmp/ftenv/bin/pip install fonttools
/tmp/ftenv/bin/python tools/make-wordmark.py   # 重写 src/components/Wordmark.vue 与 public/icon.svg
```

改字、换字体、换字重都在 `tools/make-wordmark.py` 顶部改。生成的 `Wordmark.vue` 不要手改。

## 扩展

```
ext/css/*.css        站点级样式，排在基础样式之后
ext/js/*.js          站点级脚本，启动后执行
ext/plugins/*.mjs    构建期插件：onScan / onArticle / onHtml / onDone
```

`window.__duiye` 提供 `{ article, layout, annotations, open }`。

---

## AI（MCP）

AI **不能**直接写 `papers/`。流程固定为：

```
AI 写草稿 → _duiye/cache/<任意名>/{index.md, zh.md, img/}
   ↓ npm run ingest -- _duiye/cache/<任意名> --cat 分类/子类
不合格 → 打印错误、退出码 1、papers/ 不动
合格   → 自动发号 → 移进 papers/ → 自检
```

MCP 暴露 `duiye_list / read / validate / ingest / doctor / build / annotation_write` 七个工具。
接入方式：

```json
{ "mcpServers": { "duiye": { "command": "node", "args": ["tools/mcp.mjs"] } } }
```

---

## 目录

```
papers/      内容（你常改的地方）
_duiye/      程序自己的数据：annotations / cache / logs
ext/         扩展
tools/       命令：serve / validate / ingest / doctor / new / mcp
src/         站点代码（Vue 3）
public/      静态资源 + 构建产物 data/、media/（不进 git）
```

---

## 已知边界

- 不做部署、不做账号、不做多用户
- 不做全文检索索引（先用第一栏过滤 + 浏览器查找）
- 不做拖拽调栏宽（只有预设比例）
- 图片仅作辅助，缺图只警告，不拦截入库
- KaTeX 覆盖不了 `tikz` / `algorithm2e`，用截图

## License

MIT
