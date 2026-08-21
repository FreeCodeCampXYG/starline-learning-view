# 验证记录

日期：2026-08-17

## 自动检查

- `node --check app.js`、`node --check knowledge-map.js`、`node --check project-map.js`：通过。
- `python -m unittest discover -s tests -p "test_*.py" -v`：19 项通过（含新增的变更记录契约测试与新索引字段测试）。
- 变更记录 JSON：`data/changelog.json` 可解析，包含 `features`（功能更新）与 `system`（系统说明）两个区块、14 条记录；`id` 无重复、`section` 合法、`date` 格式正确。
- 新索引字段：`data/github-projects.json` 每个项目含 `license`、`languages`、`createdAt`、`sizeKb`、`watchers`、`openIssues`、`openPullRequests`、`recentReleaseAt`、`disabled`；汇总层含 `languages`、`licenses` 聚合。
- 工作流：`deploy-pages.yml` 校验并发布 `data/changelog.json` 到 Pages artifact；继续使用最小权限（`contents: read` / `pages: write`）。
- HTML/CSS 安全静态检查：所有测试契约所需的 ID、类名、选择器完整；五套主题完整；未发现 GitHub Token 前缀；外链包含安全属性。
- 许可证与仓库治理：根目录 `LICENSE` 为标准 MIT 文本，版权主体为 `StarLine (GitHub: FreeCodeCampXYG)`；Issue/PR 模板存在。
- `git diff --check`：通过。

## 浏览器烟测（Edge Chromium，CDP）

- 1440 × 1100 桌面：数据渲染、任务优先首页层级、MIT 页脚、README 导览、GitHub 优先排序、项目介绍、桌面目录折叠、GitHub 项目概览、维护焦点、范围筛选、外观设置、二级分类、全文搜索、需处理筛选、主题持久化、视图切换、本地草稿、详情对话框。
- 390 × 844 移动端：页面级横向溢出为 0，抽屉导航打开/关闭正常，主内容不超出可视宽度。

## 变更记录专项验证（v3 公告条 + 对话框）

- 公告条位于页面标题之下、GitHub 项目区之前，仅占一条横带高度，不占主界面；显示最新一条摘要与总数（14 条）。
- 点击「查看全部」打开时间线对话框：功能更新 9 条；切换到系统说明显示 5 条；对话框内键盘 `ArrowRight` 可在两个 Tab 间切换。
- 侧栏「变更记录」入口同样打开对话框；Esc 键、关闭按钮、点击遮罩均可关闭。
- 移动端 390px：对话框全宽（`max-width: none` 修复 UA `dialog:modal` 限制）、无横向溢出。
- 五套主题对话框与公告条全部正常换肤（Spectrum/Command 暗色、Atlas/Blueprint 浅色）。

## 五套主题布局验证

- Atelier、Spectrum、Command、Atlas、Blueprint 五套主题在 1440px 下均无页面级横向溢出，公告条位于标题之后、时间线节点、卡片与顶部导航正常渲染。
- 各主题圆角性格：Atelier 24px / Command 12px / Atlas 32px / Blueprint 10px / Spectrum 28px。
- Spectrum 深空主题：背景为深空渐变（#0c1020），紫/青/粉光晕正常显示，玻璃拟态卡片正常。

## 视觉检查

- v3 截图保存于本机 `D:\Temp\v3-*.png`（atelier-top / atelier-projects / atelier-dialog / spectrum-top / mobile-390 / mobile-dialog，属于验证证据，不部署到生产站点）。
- 设计方向：Material 3 / Arco 圆角艺术化启发 + 五主题 token 性格化，配色与排版为本项目独立实现。

## 未验证边界

- 示例笔记 URL 当前指向用户的 GitHub Pages 根地址，不是最终文章地址，需替换后重新做线上链接健康检查。
- 页面不会测试或存储 GitHub 写凭据；正式发布必须通过 Git / PR。
- 本机未安装 ChromeGo Chromium，浏览器验证使用 Edge（Chromium 内核）完成。
- GitHub Actions 线上运行结果需在推送后通过 Actions 页面确认。
