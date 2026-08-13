# 验证记录

日期：2026-08-13

## 自动检查

- `node --check app.js`：通过。
- `node --check knowledge-map.js` 与 `python -m json.tool data/relations.json`：通过。
- `python -m unittest discover -s tests -p "test_*.py" -v`：12 项通过。
- 笔记 JSON 契约：通过，10 篇数据无字段、枚举、ID 或 URL 错误。
- HTML/CSS 安全静态检查：108 个 HTML ID 无重复；5 套主题完整；未发现 GitHub Token 前缀；静态外链包含安全属性。
- GitHub Pages Actions：工作流采用官方 `configure-pages`、`upload-pages-artifact` 和 `deploy-pages`，使用最小权限并只发布站点必需文件。
- GitHub 项目索引：Actions 每天定时读取账号公开仓库，生成脱敏字段集；前端区分自建项目、已启用 Pages、Fork 项目和公开 Star，并说明默认分支提交统计口径。
- 知识地图：从笔记、分类、标签与公开项目数据构图；显式关系单独维护并验证端点存在，支持搜索保留一跳上下文、拖拽、缩放、节点详情和可访问节点列表。
- 真实 Chromium 浏览器烟雾测试：通过 Playwright 调用本机 ChromeGo Chromium，完成以下交互回归。
  - 初始数据渲染
  - 任务优先首页层级
  - 外观设置渐进式披露
  - GitHub 自建/Fork/提交/Star 概览
  - GitHub 项目范围筛选、滑动选中层与卡片入场反馈
  - 标签键盘左右切换、`aria-selected` 与 Tabpanel 关联
  - 5 个 Pages 入口按账号和仓库名生成，未使用无关 Homepage
  - GitHub Description 与空介绍兜底文案
  - 二级分类筛选
  - 全文搜索
  - “需要处理”快捷筛选
  - 主题切换与持久化
  - 列表/卡片/知识地图三视图互斥切换
  - 知识地图搜索、一跳上下文、项目范围、节点详情、适合/重置和人工关系标记
  - 本地草稿保存与持久化
  - 详情对话框
  - 390 × 844 响应式布局无页面级横向溢出

## 视觉检查

已在 Edge 中检查：

- Atelier，1440 × 1100
- Command，1440 × 1100
- Blueprint，1440 × 1000
- Spectrum，1440 × 1000
- Atlas，390 × 844

1.1 版额外检查 Atelier 默认工作台：1440 × 1000 与 390 × 844；390px 视口下页面、主内容、统计区和工具栏均位于可视宽度内。

本版已用真实 Chromium 生成 1440px 项目区域截图，确认标签状态、Pages 目标路径、项目介绍和卡片层级；390px 视口页面级横向溢出为 0。

知识地图本轮另以本机 ChromeGo Chromium 验证：桌面知识主线为 24 个节点、21 条关系，项目关联范围包含 11 个公开自建项目与 9 条人工确认关系；390 × 844 窄屏默认聚焦枢纽节点，SVG 触控命中半径为 30，页面级横向溢出为 0，且未出现控制台错误。

截图保存在 `.visual-checks/`，属于本地验证证据，不需要部署到生产站点。

## 未验证边界

- 示例笔记 URL 当前指向用户的 GitHub Pages 根地址，不是最终文章地址，需替换后重新做线上链接健康检查。
- 本次 6 个 Pages 标准地址均返回 HTTP 200；代码推送后的新版界面仍需等待 Actions 部署完成后复核。
- 页面不会测试或存储 GitHub 写凭据；正式发布必须通过 Git / PR。
