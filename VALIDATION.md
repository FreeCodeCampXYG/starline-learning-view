# 验证记录

日期：2026-08-13

## 自动检查

- `node --check app.js`：通过。
- 笔记 JSON 契约：通过，10 篇数据无字段、枚举、ID 或 URL 错误。
- HTML/CSS 安全静态检查：57 个 HTML ID 无重复；5 套主题完整；未发现 GitHub Token 前缀；静态外链包含安全属性。
- GitHub Pages Actions：工作流采用官方 `configure-pages`、`upload-pages-artifact` 和 `deploy-pages`，使用最小权限并只发布站点必需文件。
- 真实 Edge 浏览器烟雾测试：11 项通过。
  - 初始数据渲染
  - 任务优先首页层级
  - 外观设置渐进式披露
  - 二级分类筛选
  - 全文搜索
  - “需要处理”快捷筛选
  - 主题切换与持久化
  - 卡片/列表视图切换
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

截图保存在 `.visual-checks/`，属于本地验证证据，不需要部署到生产站点。

## 未验证边界

- 示例笔记 URL 当前指向用户的 GitHub Pages 根地址，不是最终文章地址，需替换后重新做线上链接健康检查。
- GitHub Pages 线上部署需等待首次 Actions 成功运行后核验；真实用户可用性测试仍属于 `missing evidence`。
- 页面不会测试或存储 GitHub 写凭据；正式发布必须通过 Git / PR。
