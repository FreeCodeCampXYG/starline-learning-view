# 墨卷 · 学习笔记管理台

一个不依赖构建工具、可直接部署到 GitHub Pages 的学习笔记网页目录。正式数据来自 `data/notes.json`；浏览器编辑只生成本地草稿，不会也不应该直接持有 GitHub Token。

GitHub Actions 会读取 `FreeCodeCampXYG` 的公开仓库并生成 `data/github-projects.json`。页面默认展示全部自建项目，并可切换到已部署 Pages、Fork 项目和我的 Star；私有仓库不会进入公开索引。

1.1 版采用任务优先首页：快捷入口、最近更新、维护提醒和默认列表视图直接服务日常工作；五套主题、导入导出和高级筛选通过设置与菜单渐进式披露。

## 本地预览

直接双击 HTML 时，浏览器通常会拦截页面读取 JSON。请在本目录启动静态服务器：

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 五套视觉方案

- Atelier：编辑部 / 内容期刊，大留白与衬线标题。
- Command：开发者控制台，深色、高密度、状态优先。
- Atlas：柔和知识地图，圆润色带与分类方向感。
- Blueprint：工程蓝图，网格、线框与版本维护感。
- Spectrum：现代产品台，渐变氛围与管理效率平衡。

五套主题共享同一套 HTML、数据和 JavaScript，只通过 CSS tokens 切换，后续功能只需维护一次。主题入口位于“外观”设置，不占用业务首页。

## 数据维护

1. 编辑 `data/notes.json`，或在页面中新增/编辑本地草稿。
2. 在页面右上角导出 JSON。
3. 审核分类、URL 与 Git diff。
4. 用导出文件替换仓库中的 `data/notes.json`。
5. 通过分支和 PR 合并到 `main`，让 GitHub Actions 自动验证并部署。

## GitHub 项目自动发现

- 每天北京时间约 10:20 自动扫描一次公开仓库；GitHub 可能有少量排队延迟。
- 推送到 `main` 或在 Actions 手动运行工作流时也会立即刷新。
- 索引在构建过程中生成并直接进入 Pages artifact，不会每天产生 Git 提交。
- 前端不保存 GitHub Token；Actions 只使用仓库内置的短期 `GITHUB_TOKEN` 读取公开数据。
- 默认页面展示全部非 Fork 自建项目；筛选器可分别查看已启用 Pages、Fork 项目和账号公开收藏的 Star。
- Pages 入口固定按 `https://<账号>.github.io/<仓库名>/` 生成，卡片会同时显示目标路径，避免被仓库 `homepage` 字段带到无关页面。
- 项目介绍优先使用 GitHub Description；尚未填写时只生成基于 Fork、Pages 和主要语言等公开事实的兜底说明。
- 不应公开展示的旧项目通过仓库 Actions 变量 `HIDDEN_GITHUB_REPOSITORIES` 排除；支持逗号、分号或换行分隔，隐藏名单不会写入 Pages 数据文件。
- “本人提交”按 GitHub 账号身份匹配每个公开仓库默认分支统计，不包含其他分支、未推送提交或使用未绑定邮箱的历史。

本地刷新命令：

```powershell
python scripts\sync_github_projects.py --owner FreeCodeCampXYG --output data\github-projects.json
```

必需字段：`id`、`title`、`summary`、`url`、`categoryPath`、`tags`、`status`、`linkStatus`、`updatedAt`。

状态枚举：

- `status`: `published` / `draft` / `archived`
- `linkStatus`: `healthy` / `unchecked` / `broken`

验证数据：

```powershell
python "C:\Users\xiaoy\.codex\skills\starline-note-library\scripts\validate_notes.py" data\notes.json
```

## GitHub Pages 部署

仓库包含 `.github/workflows/deploy-pages.yml`，使用 GitHub 官方 Pages Actions 部署，不需要 npm 构建步骤：

1. 将代码推送到 GitHub，默认分支使用 `main`；
2. 首次部署前，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；
3. 推送到 `main` 后，工作流会检查站点入口、JavaScript 语法和 JSON 格式；
4. 验证通过后，仅将 `index.html`、`styles.css`、`app.js` 和 `data/notes.json` 打包为 Pages artifact 并发布；
5. 也可在 **Actions → Deploy GitHub Pages → Run workflow** 手动重跑。

工作流使用最小权限：构建阶段只有 `contents: read`，部署阶段只有 `pages: write` 和 `id-token: write`。`.visual-checks/`、`.research-screens/` 和浏览器测试不会进入线上 artifact。

默认访问地址预计为：

```text
https://FreeCodeCampXYG.github.io/starline-learning-view/
```

实际地址以 Actions 的 `github-pages` environment 输出为准。

## 安全边界

- 不在 HTML、JavaScript、localStorage 或 URL 中保存 GitHub Token。
- “保存到本机”不等于云同步；远程变更必须通过 Git / PR 或受控后端完成。
- 外部链接使用 `noopener noreferrer`。
- 示例 URL 指向用户的 GitHub Pages 根地址，链接状态需在替换为正式笔记 URL 后重新核验。

## 开源先例

信息架构与交互借鉴了 AppFlowy 的工作区层级、Karakeep 的列表/标签/检索模型、linkding 的极简维护方式、Apple HIG 的内容优先与适配原则、Kimi 官网的安静工作空间，以及相关设计 Skill 的渐进式披露方法；未复制其代码或品牌视觉。
