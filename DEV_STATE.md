# 开发状态

更新时间：2026-08-17

## 当前目标

完成项目设计系统 v3 重构：变更记录改为「顶部公告条 + 时间线对话框」形态（不再占据主界面）、CSS 结构彻底重写（消除旧版分裂的 token 与碎片化媒体查询）、全面圆角化并注入设计师艺术感（Material 3 / Arco 启发）。

## 已完成

### 设计系统 v3（本轮）

- **变更记录重构为「顶部公告条 + 时间线对话框」**：页面顶部一条精致的横向公告（图标 + 最新摘要 + 总数 + 双区块胶囊切换 + 「查看全部」按钮），不占用主界面；点击后弹出全屏时间线对话框，内嵌完整时间线（功能更新 / 系统说明双区块切换）。
- **CSS 从 4700 行碎片化恢复品重写为 1733 行结构化设计系统**：单一 token 源（`:root` 默认 + `body[data-theme]` 覆盖）、7 大章节（令牌 → 基础 → 布局 → 组件 → 区块 → 主题 → 响应式）、无重复选择器、媒体查询统一收尾。
- **圆角艺术化**：五主题各自鲜明的圆角性格（Atelier 24px / Command 12px / Atlas 32px / Blueprint 10px / Spectrum 28px 大圆角），胶囊切换器（999px）、圆角按钮（100px）、柔和分层阴影（shadow-1/2/3 三级）、毛玻璃顶栏、渐变公告条。
- **公告条交互**：显示最新一条更新摘要 + 总数；「查看全部」与侧栏「变更记录」入口均打开对话框；对话框支持 Esc/点击遮罩关闭、双区块键盘 Tab 导航。
- **修复移动端对话框**：`dialog:modal` UA 样式（`max-width: calc(100% - 38px)`）覆盖问题，通过 `dialog.timeline-dialog:modal { max-width: none }` 修复，390px 下对话框全宽无圆角。
- 修复暗色主题（Spectrum/Command）对话框、卡片、时间线节点的完整换肤。

### 此前已完成（v2 基线）

- 恢复并强化设计系统：Apple/Kimi 式克制设计（毛玻璃顶栏、无阴影卡片、大字号层次）。
- 新增变更记录时间线样式：节点微光、卡片悬浮、入场错位动画，全部 CSS 变量驱动。
- 新增 GitHub 索引采集字段：license、languages、createdAt、sizeKb、watchers、openIssues、openPullRequests、recentReleaseAt、disabled；summary 聚合。
- Actions 工作流校验并发布 `data/changelog.json`。

## 关键决策

- **「更新说明放最顶上但不占主界面」**：公告条只占一条横带高度，完整时间线收进对话框——主界面聚焦内容，变更记录随时可查。
- **第一性原理重写 CSS 而非修补**：旧版结构有两个根本缺陷——`:root` 与 `body[data-theme]` 双 token 体系分裂、同一组件样式散落多处。v3 统一为单一 token 源 + 7 章节顺序。
- **圆角是主题性格的一部分**：五套主题的圆角半径作为 token 独立定义，而非全局统一，保证每套主题的辨识度。
- 保持零构建 HTML/CSS/JavaScript 与 GitHub Pages 工作流。
- 全部测试契约（19 项单测 + 浏览器烟测选择器）在新结构下保留。

## 核心文件

- `index.html`：公告条（changelog-banner）+ 时间线对话框（timeline-dialog）+ 侧栏入口按钮。
- `styles.css`：设计系统 v3（1733 行，7 章节结构化）。
- `app.js`：`openTimelineDialog`、公告条摘要渲染、双组 Tab 键盘导航、对话框开合事件。
- `data/changelog.json`：变更记录数据（14 条：9 功能更新 + 5 系统说明）。
- `tests/test_frontend_contract.py`：19 项测试覆盖 changelog 与新索引字段。

## 验证

- `node --check app.js`、`knowledge-map.js`、`project-map.js`：均通过。
- `python -m unittest discover -s tests -p "test_*.py"`：19 项全部通过。
- 浏览器烟测（Edge Chromium 无头，1440px + 390px）：全部通过。
- 五主题布局验证（桌面 1440 + 移动 390）：无溢出、公告条位于标题之后、对话框开关正常、双区块切换 9+5=14 条、暗色主题换肤正常。
- 截图存于 `D:\Temp\v3-*.png`（atelier-top / atelier-projects / atelier-dialog / spectrum-top / mobile-390 / mobile-dialog）。

## 已知边界与下一步

- 示例笔记 URL 仍指向 GitHub Pages 根地址，需替换为正式文章地址后做线上链接健康检查。
- Spectrum 主题玻璃拟态在低端 GPU 上可能降低帧率；`prefers-reduced-motion` 可自动关闭入场动画。
- 变更记录的 `commit` 字段为手动维护，需在每次提交前确认是否同步到 changelog。
- 后续可考虑：公告条加入「最近更新」横向滚动条（如只显示近 3 条）或在页面底部追加完整 changelog 锚点。
