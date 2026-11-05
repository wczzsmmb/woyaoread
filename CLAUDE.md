# CLAUDE.md

给在这个仓库里干活的 AI（以及三个月后的自己）看的。要完整设计见 `规格书.md`。

## 一、这是什么

精读器「我要读书」：一张纸两栏读（对开翻页 / 中英对照），目录、批注、排版收在纸右边的独立面板里。Vite + Vue 3，纯静态，无数据库。

三条原则：

1. **文件即数据** —— `papers/` 里的文件夹和 `md` 是唯一真相，不引入数据库
2. **构建期算完** —— md → HTML / KaTeX / JSON 都在构建时做，前端不解析 md
3. **编号是身份，位置不是** —— 编号（5 位，永不回收）定文章，内容哈希定段落

## 二、数据边界（最重要）

| 目录 | 谁写 | 说明 |
|---|---|---|
| `papers/` | **只有人**（或 `npm run ingest`） | 程序只读。任何代码都不许直接往这里写 |
| `_woyaoread/annotations/` | `tools/serve.mjs` | 批注唯一主存储。原子写 + `.bak` |
| `_woyaoread/cache/` | AI | 草稿区，`ingest` 的输入 |
| `public/data/`、`public/media/` | 构建 | 产物，已 gitignore，别手改 |

AI 的写内容流程只有一条：写 `_woyaoread/cache/…` → `npm run validate` → 改 → `npm run ingest`。
**不要**为了省事直接改 `papers/`。

## 三、允许 Git

在必要时可以自己提交，规则：

- 提交前跑：`npm run doctor && npx vite build`（都要过）
- 提交信息用前缀：`feat:` / `fix:` / `docs:` / `chore:` / `content:`
- 不 `force push`，不改写已有提交
- 不提交 `dist/`、`public/data/`、`public/media/`、`node_modules/`、`_woyaoread/cache/*`
- 一次提交只做一件事；内容变更用 `content:` 前缀单独提交

## 三·五、部署：**默认禁止，没让我上就不许上**

**这条是硬规矩：除非用户当次明确说出「上线 / 部署 / 发布 / deploy」，否则不许往任何地方发布。**

- 日常改完只做一件事：`npx vite build`，让本地 `dist/` 是最新的，用户自己 `⌘⇧R` 刷新看
- 不许自动 push 到 `gh-pages`、不许跑 rsync 到部署仓库、不许 `gh repo create`、不许开 tunnel / funnel
- 「上次你部署过」不构成许可；每一次都要当次授权
- 代码仓库：`wczzsmmb/woyaoread`（`main`），只放源码；Pages / 部署未配置
- 旧仓库 `wczzsmmb/duiye`（`gh-pages` 历史产物）已弃用，不要再往里推
- 部署相关动作（含改 `tools/deploy.*`、改 Pages 设置）一律先问

## 四、字标（方案已定，但目前不上）

**选定方案：`src/components/Mark.vue` —— 抽象双页符号（左页实心 / 右页空心）。**
现在**不在界面里显示**（用户看过觉得摆在顶栏不好看），但代码保留。
不要主动加回去；要启用就在 `ShelfView.vue` / `ReaderView.vue` 里挂 `<Mark />`。
顶栏现在用的是用户提供的应用图标 `logo.svg`（`public/logo.svg`），不是 `Mark.vue`。

（备选记录：`Wordmark.vue` 是宋体字标「我要读书」，用户否掉了；`public/icon.svg` 是「读/书」叠排的应用图标。）


`src/components/Wordmark.vue` 由 `tools/make-wordmark.py` 生成，**不要手改**。
但**界面上暂时不显示字标**（用户看过，觉得摆在顶栏不好看）。请不要主动加回去；
要恢复就改这两处：`ShelfView.vue` 的 `.brand__*`、`ReaderView.vue` 的 `.bar__*`。
`public/icon.svg`（应用图标）继续保留。

## 四·五、手机端（≤ 700px）

手机上那一套是单独做的，照微信读书：

- **顶栏** `.pbar`：浮在正文上，`chromeOn` 控制出没；点正文收起/唤出（选中文字、点到链接图片时不响应）
- **底栏** `.ptools`：五个图标（目录 / 批注 / 进度 / 纸色 / 字号），选中变蓝，不带字
- **抽屉**：`src/components/sheet/` —— `Sheet.vue`（底部圆角、只有把手、**没有标题行和 ✕**；下拉 / 点遮罩 / 再点一次底栏图标关闭；开时锁住正文滚动）+ `OutlinePane`（目录 / 我的书架）/ `TypeSheet` / `ThemeSheet` / `ProgressSheet`；批注抽屉直接复用 `NotesPane`
- 抽屉落在工具条上方（工具条一直露着），抽屉打开时顶栏收起 —— 都对着微信读书
- 手机是**一栏一页**：`.page--paged` 把 `.rows` 改成 `columns: 1` + 固定页高，用和桌面同一套 `translateX` 翻页；点左边 30% 上一页、右边 30% 下一页、中间收/放上下栏
- `paged = spread || isPhone`；`perPage = spread ? 2 : 1`，所有分页算法（measure / colOf / headingAtPage / turn）都读这两个值
- 阅读时长只存本地（`src/lib/reading-time.ts`），10 秒一跳，页面不可见不计时

## 五、改代码的约束

- 运行时依赖只有 `vue`。加任何新依赖前先说明理由
- 不装 vue-router / Pinia / UI 库 / 动画库（hash 路由和状态都在 `src/lib/`）
- 批注协议、编号规则、目录结构属于**契约**：要改先改 `规格书.md`，再改代码
- 批注主键格式 `^(index|zh)::[0-9a-f]{8}(#\d+)?$`，别改
- 端口固定 **43999**；批注服务只碰 `_woyaoread/annotations/`
- 构建不混淆，但开压缩（`minify: 'esbuild'`），并保留 sourcemap

## 六、自检清单

改完任何东西：

```bash
npm run doctor     # 编号 / 批注 / 对齐
npx vite build     # 必须能过
```

改了 UI：`npm start` 打开 http://127.0.0.1:43999，看对开翻页、对照、单栏、右侧抽屉（目录 / 批注 / 排版）、夜间、手机宽度。
