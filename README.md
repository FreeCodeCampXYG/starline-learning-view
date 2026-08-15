# 墨卷 · 学习笔记管理台

[![License: MIT](https://img.shields.io/badge/License-MIT-1677ff.svg)](LICENSE)

一个不依赖构建工具、可直接部署到 GitHub Pages 的学习笔记网页目录。正式数据来自 `data/notes.json`；浏览器编辑只生成本地草稿，不会也不应该直接持有 GitHub Token。

GitHub Actions 会读取 `FreeCodeCampXYG` 的公开仓库并生成 `data/github-projects.json`。页面默认展示全部自建项目，并可切换到已部署 Pages、Fork 项目和我的 Star；私有仓库不会进入公开索引。

当前版采用任务优先首页：快捷入口、最近更新、维护提醒和默认列表视图直接服务日常工作；五套主题、导入导出和高级筛选通过设置与菜单渐进式披露。

首页顺序遵循“先追溯、后学习”：`GitHub 公开项目` 位于本地笔记之前，源码、Pages 和 README 从项目卡片直接打开；下面的 `本地内容` 只展示 `data/notes.json` 与浏览器本地草稿。桌面端目录可以收起以获得全宽项目视图，窄屏端使用带遮罩的抽屉导航，关闭后不会改变当前筛选状态。

自建项目区默认会展示当前管理台的详细介绍和 README 阅读路径。项目卡片继续保留 GitHub 原始简介作为事实来源，并提供 `README`、`源码` 与 `打开网站` 入口；可维护的补充介绍保存在 `data/project-guides.json`，不会写入 Token 或私有仓库信息。

## 首页快速导览

打开 [线上管理页](https://freecodecampxyg.github.io/starline-learning-view/) 后，首页的“先看这里，再开始浏览”会直接给出主要入口：

- **阅读笔记**：进入笔记目录，使用标题、摘要、分类、标签和更新时间判断要读什么。
- **知识地图**：在页面内切换到关系图，查看笔记、分类、标签、项目之间的一跳关系；关系来源于 `data/notes.json` 与 `data/relations.json`。
- **项目关系图**：进入 GitHub 项目区的关系图，按自建项目、Fork、Star、语言、Pages 和上游来源探索公开资产。
- **GitHub README**：查看数据字段、隐私边界、维护流程和部署规则；[源码仓库](https://github.com/FreeCodeCampXYG/starline-learning-view)、[Actions](https://github.com/FreeCodeCampXYG/starline-learning-view/actions)、[Pages 地址](https://freecodecampxyg.github.io/starline-learning-view/)、[笔记 JSON](data/notes.json) 与 [项目索引 JSON](data/github-projects.json) 都有直接链接。

当前项目的 README 建议按“首页快速导览 → GitHub 项目自动发现 → 数据维护 → GitHub Pages 部署”的顺序阅读；首页项目介绍面板会把这四步直接链接到对应章节。

首页还会显示“近期优先项目”：

- **近期高频**：近 30 天本人匹配提交较多，或最近一周持续提交；
- **近期维护**：近 30 天存在本人提交，或仓库最近 30 天有实际推送；
- **自动排序**：近期提交数权重高于推送时间，旧项目不会因为历史累计提交多而长期占据前排。

这些状态只用于帮助排序和发现，不代表项目质量评级，也不需要手工置顶。项目卡片上的 `源码` 始终指向 GitHub 仓库；存在 Pages 时，`打开网站` 按 `https://<账号>.github.io/<仓库名>/` 生成。私有仓库、隐藏名单和 Token 不会发布到页面。

列表与卡片之外，可切换到“知识地图”查看领域、分类、笔记、项目和标签的关系。分类与标签关系由 `data/notes.json` 推导，人工确认的跨笔记与项目关系维护在 `data/relations.json`；搜索会保留一跳相邻上下文，节点支持选择、拖拽、缩放和键盘查看详情。

知识地图的探索思路参考了 Apache-2.0 开源项目 [OpenWrite](https://github.com/LiPu-jpg/Openwrite) 的关系拓扑：保留搜索的一跳上下文、节点检查器和可访问列表。本项目没有引入其运行时，使用原生 SVG 与现有静态 JSON 独立实现，以保持 GitHub Pages 的零构建部署方式。

GitHub 公开项目区另提供“项目关系图”标签：直接使用 Actions 每日生成的 `data/github-projects.json`，按自建、Fork、Star、主要语言、Pages 与上游来源建立可探索网络；项目之间的人工确认关系继续复用 `data/relations.json`。该视图只呈现公开索引，不在浏览器请求 GitHub Token。

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

项目的面向读者的补充说明维护在 `data/project-guides.json`；修改 README 章节或项目工作流时，同步检查这里的引导链接。

## GitHub 项目自动发现

- Actions 每 6 小时自动扫描一次公开仓库，正常情况下其他仓库提交后最长等待约 6 小时，再加少量 GitHub 排队时间。
- 推送到本管理仓库的 `main`，或在 Actions 手动运行工作流时也会立即刷新。
- 其他项目仓库的单独提交不会直接触发本仓库工作流；为了避免给每个项目配置跨仓库 Token 或 Webhook，本项目采用无密钥的定时聚合，不宣称秒级实时。
- 索引在构建过程中生成并直接进入 Pages artifact，不会因定时刷新产生 Git 提交；因此仓库中的本地 JSON 可能比线上 Pages 数据旧，线上页面以最近一次成功 Actions 的 artifact 为准。
- 前端不保存 GitHub Token；Actions 只使用仓库内置的短期 `GITHUB_TOKEN` 读取公开数据。
- 默认页面展示全部非 Fork 自建项目；筛选器可分别查看已启用 Pages、Fork 项目和账号公开收藏的 Star。
- Pages 入口固定按 `https://<账号>.github.io/<仓库名>/` 生成，卡片会同时显示目标路径，避免被仓库 `homepage` 字段带到无关页面。
- 项目介绍优先使用 GitHub Description；尚未填写时只生成基于 Fork、Pages 和主要语言等公开事实的兜底说明。
- 需要补充“适合谁、能做什么、README 先看哪里”的项目说明时，维护 `data/project-guides.json`；它只覆盖明确维护过的项目，其余项目仍显示 GitHub 原始 Description。
- 不应公开展示的旧项目通过仓库 Actions 变量 `HIDDEN_GITHUB_REPOSITORIES` 排除；支持逗号、分号或换行分隔，隐藏名单不会写入 Pages 数据文件。
- “本人提交”按 GitHub 账号身份匹配每个公开仓库默认分支统计，不包含其他分支、未推送提交或使用未绑定邮箱的历史。
- 索引同时保存近 30 天匹配提交数和最近匹配提交时间；页面显示数据新鲜度，超过正常刷新周期会提示检查 Actions。

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
4. 验证通过后，将页面脚本、`data/notes.json`、`data/github-projects.json`、`data/project-guides.json` 和 `data/relations.json` 打包为 Pages artifact 并发布；
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

## 版权与许可证

Copyright © 2026 StarLine（GitHub：FreeCodeCampXYG）。

除另有明确说明外，本仓库由版权方原创并有权授权的源代码、界面样式、脚本和项目文档采用 [MIT License](LICENSE)。MIT 允许使用、复制、修改、合并、发布、分发、再许可和销售副本，但副本或实质性部分必须保留原版权声明与许可声明；软件按“原样”提供，不附带任何保证。完整法律文本以根目录 `LICENSE` 为准。

授权边界：

- GitHub 仓库描述、外部网页链接和自动聚合的公开项目元数据仅用于索引与跳转，不主张其版权归本项目所有。
- 第三方项目名称、商标、课程材料、图片以及链接页面内容仍归各自权利人所有，并遵循其原始许可或使用条款。
- 后续加入非原创内容时，应在相应文件或说明中标注来源和许可证；MIT 不会覆盖无权再许可的第三方内容。

## 开源先例

信息架构与交互借鉴了 AppFlowy 的工作区层级、Karakeep 的列表/标签/检索模型、linkding 的极简维护方式、Apple HIG 的内容优先与适配原则、Kimi 官网的安静工作空间，以及相关设计 Skill 的渐进式披露方法；未复制其代码或品牌视觉。
