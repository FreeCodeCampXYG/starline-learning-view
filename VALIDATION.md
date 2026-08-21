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

## 变更记录专项验证（编辑级通知中心）

- 顶部菜单栏通知铃铛：徽章计数 15（与 changelog.json 记录数一致）；默认收起；点击展开面板。
- 通知面板：显示最新摘要（设计系统 v3）、最近三条预览、双区块切换（功能更新 11 条 / 系统说明 5 条）。
- 面板底部「查看全部」打开完整时间线对话框；面板自动关闭；Esc/外部点击可关闭面板。
- 侧栏「变更记录」入口同样打开对话框。
- 移动端 390px：通知面板宽度 `calc(100vw - 32px)`，无横向溢出；对话框全宽（`max-width: none` 修复 UA `dialog:modal` 限制）。

## 编辑级排版验证

- Atelier：米白纸感背景 `#f6f4ef`、墨黑 `#1f1d1a`、勃艮第红 `#b3203e` 点睛（按钮/徽章/时间线节点/标题强调）。
- 首页 Hero：64px 衬线大标题（Georgia/Noto Serif SC）、58px 衬线首字下沉、右侧竖排衬线数据统计。
- 五主题排版性格：Atelier/Atlas/Blueprint/Spectrum 衬线标题，Command 等宽终端风。

## 五套主题布局验证

- Atelier、Spectrum、Command、Atlas、Blueprint 五套主题在 1440px 下均无页面级横向溢出，通知面板默认收起、时间线节点、卡片与顶部导航正常渲染。
- 各主题圆角性格：Atelier 24px / Command 12px / Atlas 32px / Blueprint 10px / Spectrum 28px。
- Spectrum 深空主题：背景为深空渐变（#0c1020），紫/青/粉光晕正常显示，玻璃拟态卡片正常。

## 视觉检查

- v4/v5 截图保存于本机 `D:\Temp\v4-*.png` / `v5-atelier-hero.png`（属于验证证据，不部署到生产站点）。
- 设计方向：编辑级杂志排版（衬线标题 + 首字下沉 + 暖白纸感）+ 五主题 token 性格化，配色与排版为本项目独立实现。

## 未验证边界

- 示例笔记 URL 当前指向用户的 GitHub Pages 根地址，不是最终文章地址，需替换后重新做线上链接健康检查。
- 页面不会测试或存储 GitHub 写凭据；正式发布必须通过 Git / PR。
- 本机未安装 ChromeGo Chromium，浏览器验证使用 Edge（Chromium 内核）完成。
- GitHub Actions 线上运行结果需在推送后通过 Actions 页面确认。
