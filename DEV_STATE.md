# 开发状态

更新时间：2026-08-15

## 当前目标

维护 GitHub Pages 学习笔记管理页：自动聚合公开 GitHub 项目和近期活动，让用户无需手工置顶即可追溯当前重点项目，再进入本地笔记学习。

## 已完成

- 首页增加“先看这里，再开始浏览”导览带，直接链接笔记目录、知识地图、项目关系图、GitHub README、Pages 和 Actions。
- 页面 DOM 顺序调整为 `GitHub 公开项目 -> 首页导览 -> 本地内容概览 -> 学习笔记`，项目卡片中的源码、Pages 和 README 作为公开追溯入口。
- 目录导航支持桌面端收起/恢复、移动端抽屉打开/关闭，并保存桌面收起偏好。
- GitHub 项目索引改为每 6 小时自动刷新，并增加近 30 天本人提交数和最近匹配提交时间；其他仓库单独提交后不需要手工更新本项目。
- GitHub 项目区改为“近期优先项目”。近期提交数优先、最近实际推送次之，旧项目不会再因历史累计提交多而长期置顶；列表完全由索引动态计算，不写死项目名称。
- 项目区显示索引新鲜度；超过正常刷新周期会明确提示同步可能延迟，便于直接检查 Actions。
- 项目卡片对维护状态使用左侧强调线、状态点和 9–10px 辅助信息；正文介绍保持可读字号。
- 自建项目区增加 `starline-learning-view` 项目说明面板，明确项目定位、适用对象、三项核心能力和四步 README 阅读路径；每张项目卡片提供 README 直达链接。
- `data/project-guides.json` 单独维护面向读者的补充介绍，GitHub 自动索引继续保留原始公开字段和每日刷新职责。
- 项目关系图、知识地图和 Pages 地址继续使用公开 JSON 与静态 SVG，不在浏览器请求 GitHub Token。
- README 和 VALIDATION.md 已补充首页入口、数据口径、隐私边界与本轮验证证据。

## 关键决策

- 保持零构建 HTML/CSS/JavaScript 和 GitHub Pages 工作流，不引入新的运行时依赖。
- 首页采用苹果公开课式的章节分段、留白和明确入口，辅助信息采用 9–10px；不把说明堆成嵌套卡片。
- 信息架构优先公开项目，避免把无法追溯的本地内容误认为 GitHub 项目。
- Canva 插件在本次会话没有可调用的设计工具接口，因此未声称完成 Canva 验证；实现沿用现有静态前端约束。
- GitHub 项目索引由 Actions 生成；私有仓库和隐藏仓库只在生成阶段排除，不把名称写入公开数据。
- 项目补充介绍不写回 Actions 生成的 `data/github-projects.json`，避免每日刷新覆盖人工维护的 README 引导。
- 不引入跨仓库 PAT 或 Webhook；其他仓库提交通过每 6 小时的无密钥聚合进入 Pages，不宣称秒级实时。

## 核心文件

- `index.html`：首页导览、笔记目录、GitHub 项目区及关系图入口。
- `styles.css`：五套主题、响应式布局、首页导览和维护焦点视觉层。
- `app.js`：筛选、导览跳转、索引新鲜度、近期优先排序和卡片渲染。
- `scripts/sync_github_projects.py`：读取公开仓库、累计提交和近 30 天提交活动，生成脱敏索引。
- `knowledge-map.js`、`project-map.js`：知识关系图和 GitHub 项目关系图。
- `data/notes.json`、`data/github-projects.json`、`data/project-guides.json`、`data/relations.json`：正式笔记、公开项目索引、人工项目介绍和确认关系。
- `.github/workflows/deploy-pages.yml`：每日索引刷新、静态校验和 Pages 发布。

## 验证

- `node --check app.js`、`node --check knowledge-map.js`、`node --check project-map.js`：均通过。
- `python -m unittest discover -s tests -p "test_*.py" -v`：16 项通过。
- `node tests/browser-smoke.mjs`：通过；覆盖项目详细介绍、README 阅读路径、项目筛选、维护焦点、关系图、草稿和 390px 响应式交互。
- 新版同步脚本使用当前 GitHub 账号完成只读实测：29 个公开仓库、14 个自建项目、近 30 天匹配提交 49 次；输出仅写入本机临时审计文件。
- `git diff --check`：通过；PowerShell 仅报告现有 LF/CRLF 转换提醒。
- 本机 ChromeGo Chromium 已检查 Atelier 首页和项目区截图；当前工作区页面级横向溢出为 0。

## 已知边界与下一步

- 本轮改动尚未提交或推送，线上 Pages 尚未包含这些变化；推送后需要等待 Actions 完成并复核线上页面。
- 当前线上旧版定时任务已成功运行并生成新鲜索引，但每 6 小时刷新、近期活动字段和新优先算法仍需本轮代码推送后才会生效。
- 示例笔记 URL 仍需在内容正式发布后逐条替换并做线上链接健康检查。
- 暂不把维护状态写入 `data/github-projects.json`，避免把相对当前日期的展示逻辑固化到每日生成的数据中。
