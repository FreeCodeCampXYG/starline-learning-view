# 验证记录

日期：2026-08-16

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
- 变更记录专项验证：时间线默认显示功能更新 9 条；切换到系统说明显示 5 条；键盘 `ArrowRight` 可在两个 Tab 间切换；导航计数 14 与总记录数一致；390px 下无溢出。

## 五套主题布局验证

- Atelier、Spectrum、Command、Atlas、Blueprint 五套主题在 1440px 下均无页面级横向溢出，时间线节点、卡片与顶部导航正常渲染。
- Spectrum 深空主题：背景为深空渐变（#070a0f），青色/紫/金光晕正常显示，玻璃拟态卡片正常。

## 视觉检查

- 重构后截图保存于本机 `D:\Temp\refactor-atelier-timeline.png` 与 `D:\Temp\refactor-spectrum-timeline.png`（属于验证证据，不部署到生产站点）。
- 视觉方向参考无象 AI（wuxiang.navidrawing.com）的深空能量场、玻璃拟态与轨道光效，配色与排版为本项目独立实现。

## 未验证边界

- 示例笔记 URL 当前指向用户的 GitHub Pages 根地址，不是最终文章地址，需替换后重新做线上链接健康检查。
- 页面不会测试或存储 GitHub 写凭据；正式发布必须通过 Git / PR。
- 本机未安装 ChromeGo Chromium，浏览器验证使用 Edge（Chromium 内核）完成。
- GitHub Actions 线上运行结果需在推送后通过 Actions 页面确认。
