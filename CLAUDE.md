# CLAUDE.md

给在这个仓库里干活的 AI（以及三个月后的自己）看的。要完整设计见 `规格书.md`。

## 一、这是什么

三栏 Markdown 精读器：左选、中读、右对照。Vite + Vue 3，纯静态，无数据库。

三条原则：

1. **文件即数据** —— `papers/` 里的文件夹和 `md` 是唯一真相，不引入数据库
2. **构建期算完** —— md → HTML / KaTeX / JSON 都在构建时做，前端不解析 md
3. **编号是身份，位置不是** —— 编号（5 位，永不回收）定文章，内容哈希定段落

## 二、数据边界（最重要）

| 目录 | 谁写 | 说明 |
|---|---|---|
| `papers/` | **只有人**（或 `npm run ingest`） | 程序只读。任何代码都不许直接往这里写 |
| `_duiye/annotations/` | `tools/serve.mjs` | 批注唯一主存储。原子写 + `.bak` |
| `_duiye/cache/` | AI | 草稿区，`ingest` 的输入 |
| `public/data/`、`public/media/` | 构建 | 产物，已 gitignore，别手改 |

AI 的写内容流程只有一条：写 `_duiye/cache/…` → `npm run validate` → 改 → `npm run ingest`。
**不要**为了省事直接改 `papers/`。

## 三、允许 Git

在必要时可以自己提交，规则：

- 提交前跑：`npm run doctor && npx vite build`（都要过）
- 提交信息用前缀：`feat:` / `fix:` / `docs:` / `chore:` / `content:`
- 不 `force push`，不改写已有提交
- 不提交 `dist/`、`public/data/`、`public/media/`、`node_modules/`、`_duiye/cache/*`
- 一次提交只做一件事；内容变更用 `content:` 前缀单独提交

## 四、字标

`src/components/Wordmark.vue` 与 `public/icon.svg` 由 `tools/make-wordmark.py` 生成，**不要手改**。
要换字形/字重就改脚本再跑（需要 fontTools，命令写在 README）。

## 五、改代码的约束

- 运行时依赖只有 `vue`。加任何新依赖前先说明理由
- 不装 vue-router / Pinia / UI 库 / 动画库（hash 路由和状态都在 `src/lib/`）
- 批注协议、编号规则、目录结构属于**契约**：要改先改 `规格书.md`，再改代码
- 批注主键格式 `^(index|zh)::[0-9a-f]{8}(#\d+)?$`，别改
- 端口固定 **43999**；批注服务只碰 `_duiye/annotations/`
- 构建不混淆，但开压缩（`minify: 'esbuild'`），并保留 sourcemap

## 六、自检清单

改完任何东西：

```bash
npm run doctor     # 编号 / 批注 / 对齐
npx vite build     # 必须能过
```

改了 UI：`npm start` 打开 http://127.0.0.1:43999，看三栏、双栏、批注、手机宽度。
