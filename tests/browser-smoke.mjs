const DEBUG_ENDPOINT = "http://127.0.0.1:9333/json";
const githubPayload = await fetch("http://127.0.0.1:8765/data/github-projects.json").then((response) => response.json());
const expectedGitHub = {
  owned: githubPayload.projects.filter((project) => !project.fork).length,
  forks: githubPayload.projects.filter((project) => project.fork).length,
  pages: githubPayload.projects.filter((project) => !project.fork && project.hasPages).length,
  commits: Number.isInteger(githubPayload.summary?.recentMatchedDefaultBranchCommits)
    ? githubPayload.summary.recentMatchedDefaultBranchCommits
    : githubPayload.projects.reduce((total, project) => total + (Number.isInteger(project.commitCount) ? project.commitCount : 0), 0),
  starred: githubPayload.starred.length
};
const projectsWithRecentCommits = githubPayload.projects
  .filter((project) => !project.fork && Number.isInteger(project.recentCommitCount) && project.recentCommitCount > 0)
  .sort((a, b) => b.recentCommitCount - a.recentCommitCount);
const expectedPriorityProject = projectsWithRecentCommits[0]?.name || "";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tabs = await fetch(DEBUG_ENDPOINT).then((response) => response.json());
const tab = tabs.find((item) => item.type === "page" && item.url.includes("127.0.0.1:8765"));
assert(tab, "找不到用于测试的页面标签");

const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: false
});
await evaluate("localStorage.clear(); location.replace('http://127.0.0.1:8765/?theme=atelier'); true");
await delay(700);

const initial = await evaluate(`({
  theme: document.body.dataset.theme,
  cards: document.querySelectorAll('.note-card').length,
  categories: document.querySelectorAll('[data-category]').length,
  errors: document.querySelector('#emptyState').hidden
})`);
assert(initial.theme === "atelier", "Atelier 主题未正确应用");
assert(initial.cards === 10, `初始笔记数量错误：${initial.cards}`);
assert(initial.categories >= 10, "分类树未正确生成");
assert(initial.errors, "页面错误状态不应显示");

const usability = await evaluate(`({
  themesHidden: !document.querySelector('#appearanceDialog').open,
  smartViews: document.querySelectorAll('[data-smart-view]').length,
  focusCards: document.querySelectorAll('.focus-row > article').length,
  readmeLinks: document.querySelectorAll('.readme-link').length,
  projectSpotlightVisible: !document.querySelector('#projectSpotlight').hidden,
  projectReadmeSteps: document.querySelectorAll('#projectSpotlight .project-readme-guide li').length,
  cardReadmeLinks: document.querySelectorAll('.project-card a[href$="#readme"]').length,
  projectBeforeLibrary: Boolean(document.querySelector('.project-section').compareDocumentPosition(document.querySelector('.library-section')) & Node.DOCUMENT_POSITION_FOLLOWING),
  defaultList: document.querySelector('#notesGrid').classList.contains('is-list'),
  exactTotal: document.querySelector('#statTotal').textContent.trim()
})`);
assert(usability.themesHidden, "外观选择不应占据首屏");
assert(usability.smartViews === 4, "快捷入口数量错误");
assert(usability.focusCards === 2, "最近更新与维护提醒未渲染");
assert(usability.readmeLinks === 4, "首页 README 导览入口未完整渲染");
assert(usability.projectSpotlightVisible, "自建项目默认应显示当前项目介绍");
assert(usability.projectReadmeSteps === 4, "当前项目 README 引导步骤未完整渲染");
assert(usability.cardReadmeLinks > 0, "项目卡片缺少 README 追溯入口");
assert(usability.projectBeforeLibrary, "GitHub 项目区应位于本地笔记区之前");
assert(usability.defaultList, "文本型笔记应默认使用列表视图");
assert(usability.exactTotal === "10", "统计数字应立即显示真实值");
const actionMenuInitial = await evaluate(`({
  open: document.querySelector('#actionMenu').open,
  expanded: document.querySelector('#actionMenuSummary').getAttribute('aria-expanded'),
  panelVisible: document.querySelector('.action-menu-panel').checkVisibility()
})`);
assert(!actionMenuInitial.open && actionMenuInitial.expanded === "false" && !actionMenuInitial.panelVisible, "更多操作菜单默认应收起");
await evaluate("document.querySelector('#actionMenuSummary').click(); true");
assert(await evaluate("document.querySelector('#actionMenu').open && document.querySelector('#actionMenuSummary').getAttribute('aria-expanded') === 'true'"), "更多操作菜单未打开");
await evaluate("document.querySelector('main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true");
assert(await evaluate("!document.querySelector('#actionMenu').open"), "点击菜单外部后更多操作未收起");
await evaluate("document.querySelector('#actionMenuSummary').click(); true");
await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
assert(await evaluate("!document.querySelector('#actionMenu').open && document.activeElement.id === 'actionMenuSummary'"), "Esc 未关闭更多操作或恢复焦点");
await evaluate("document.querySelector('#openSidebar').click(); true");
await delay(80);
assert(await evaluate("document.body.classList.contains('sidebar-collapsed')"), "桌面目录开关未收起侧栏");
assert(await evaluate("document.querySelector('#openSidebarLabel').textContent.trim()") === "展开目录", "侧栏收起后未显示明确的展开入口");
await evaluate("document.querySelector('#openSidebar').click(); true");
assert(await evaluate("!document.body.classList.contains('sidebar-collapsed')"), "桌面目录开关未恢复侧栏");
assert(await evaluate("document.querySelector('#openSidebarLabel').textContent.trim()") === "收起目录", "侧栏展开后入口状态未同步");
const sidebarLayout = await evaluate(`(() => {
  const sidebar = document.querySelector('#sidebar');
  const scroller = document.querySelector('#sidebarScroll');
  const heading = document.querySelector('#categoryHeading');
  const sidebarBox = sidebar.getBoundingClientRect();
  const headingBox = heading.getBoundingClientRect();
  return {
    overflow: getComputedStyle(scroller).overflowY,
    headingInside: headingBox.left >= sidebarBox.left && headingBox.right <= sidebarBox.right,
    scrollable: scroller.scrollHeight >= scroller.clientHeight
  };
})()`);
assert(sidebarLayout.overflow === "auto" && sidebarLayout.headingInside && sidebarLayout.scrollable, "分类导航滚动区未正确约束在侧栏内");
await evaluate("document.querySelector('[data-readme-action=\"project-map\"]').click(); true");
await delay(120);
assert(await evaluate("document.querySelector('[data-project-filter=\"map\"]').getAttribute('aria-selected')") === "true", "首页 README 项目关系图入口未切换到对应视图");
await evaluate("document.querySelector('[data-project-filter=\"owned\"]').click(); true");

await evaluate("document.querySelector('[data-view=\"map\"]').click(); true");
await delay(120);
const knowledgeMap = await evaluate(`({
  visible: !document.querySelector('#knowledgeMap').hidden && document.querySelector('#knowledgeMap').checkVisibility(),
  notesHidden: document.querySelector('#notesGrid').hidden && !document.querySelector('#notesGrid').checkVisibility(),
  nodes: document.querySelectorAll('.knowledge-map-node').length,
  edges: document.querySelectorAll('.knowledge-map-edge').length,
  explicitEdges: document.querySelectorAll('.knowledge-map-edge.explicit').length
})`);
assert(knowledgeMap.visible, "知识地图未显示");
assert(knowledgeMap.notesHidden, "知识地图视图不应同时显示笔记卡片");
assert(knowledgeMap.nodes > 10, "知识地图节点未从现有数据生成");
assert(knowledgeMap.edges > 10, "知识地图关系未从现有数据生成");
assert(knowledgeMap.explicitEdges > 0, "人工确认关系未渲染");
await evaluate(`(() => {
  const input = document.querySelector('#knowledgeMapSearch');
  input.value = 'Skill';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await delay(60);
assert(await evaluate("document.querySelectorAll('.knowledge-map-node.search-match').length") > 0, "知识地图搜索未标记匹配节点");
assert(await evaluate("document.querySelectorAll('.knowledge-map-node').length") > await evaluate("document.querySelectorAll('.knowledge-map-node.search-match').length"), "知识地图搜索未保留相邻上下文");
await evaluate("document.querySelector('.knowledge-map-node.search-match').dispatchEvent(new MouseEvent('click', { bubbles: true })); true");
assert(await evaluate("document.querySelector('#knowledgeMapDetail').textContent.trim().length") > 20, "知识地图节点详情未更新");
await evaluate("document.querySelector('[data-view=\"list\"]').click(); true");

const githubOverview = await evaluate(`({
  owned: document.querySelector('#projectOwnedCount').textContent.trim(),
  forks: document.querySelector('#projectForkCount').textContent.trim(),
  commits: document.querySelector('#projectCommitCount').textContent.trim(),
  starred: document.querySelector('#projectStarredCount').textContent.trim(),
  freshness: document.querySelector('#projectFreshness').textContent.trim(),
  freshnessClass: document.querySelector('#projectFreshness').className,
  defaultCards: document.querySelectorAll('.project-card').length
})`);
assert(githubOverview.owned === String(expectedGitHub.owned), `自建项目统计错误：${githubOverview.owned}`);
assert(githubOverview.forks === String(expectedGitHub.forks), `Fork 项目统计错误：${githubOverview.forks}`);
assert(githubOverview.commits === String(expectedGitHub.commits), `本人提交统计错误：${githubOverview.commits}`);
assert(githubOverview.starred === String(expectedGitHub.starred), `Star 统计错误：${githubOverview.starred}`);
assert(githubOverview.freshness && /is-(fresh|current|stale)/.test(githubOverview.freshnessClass), "项目索引缺少可判断的新鲜度状态");
assert(githubOverview.defaultCards === expectedGitHub.owned, "默认应展示全部自建项目");
const maintenance = await evaluate(`({
  visible: !document.querySelector('#projectMaintenanceFocus').hidden,
  items: document.querySelectorAll('.project-maintenance-item').length,
  priorityNames: [...document.querySelectorAll('.project-maintenance-item strong')].map(node => node.textContent.trim()),
  highlightedCards: document.querySelectorAll('.project-card[class*="is-maintenance-"]').length,
  explanation: document.querySelector('#projectMaintenanceSummary').textContent.trim()
})`);
assert(maintenance.visible && maintenance.items > 0, "维护焦点未从公开索引生成");
assert(maintenance.highlightedCards > 0, "维护项目卡片缺少突出状态");
assert(!expectedPriorityProject || maintenance.priorityNames.includes(expectedPriorityProject), "近 30 天提交最多的项目未进入近期优先区");
assert(maintenance.explanation.includes("每 6 小时刷新"), "近期优先区缺少自动刷新说明");

await evaluate("document.querySelector('[data-project-filter=\"pages\"]').click(); true");
assert(await evaluate("document.querySelectorAll('.project-card').length") === expectedGitHub.pages, "Pages 项目筛选未生效");
const pagesTabState = await evaluate(`({
  selected: document.querySelector('[data-project-filter="pages"]').getAttribute('aria-selected'),
  labelledBy: document.querySelector('#projectPanel').getAttribute('aria-labelledby'),
  animated: document.querySelector('#projectGrid').classList.contains('is-entering'),
  targets: [...document.querySelectorAll('.project-open')].map(link => link.href)
})`);
assert(pagesTabState.selected === "true", "Pages 标签未暴露选中状态");
assert(pagesTabState.labelledBy === "projectTabPages", "项目面板未关联当前标签");
assert(pagesTabState.animated, "Pages 标签切换后缺少内容反馈");
assert(pagesTabState.targets.every((url) => /^https:\/\/freecodecampxyg\.github\.io\/[^/]+\/$/i.test(url)), "Pages 打开地址未按仓库名生成");
assert(await evaluate("[...document.querySelectorAll('.project-card > p')].every(node => node.textContent.trim() && !node.textContent.includes('暂未填写'))"), "项目卡片不应显示空介绍");
await evaluate("document.querySelector('[data-project-filter=\"forks\"]').click(); true");
assert(await evaluate("document.querySelectorAll('.project-card').length") === expectedGitHub.forks, "Fork 项目筛选未生效");
await evaluate("document.querySelector('[data-project-filter=\"starred\"]').click(); true");
assert(await evaluate("document.querySelectorAll('.project-card').length") === expectedGitHub.starred, "Star 项目筛选未生效");
await evaluate("document.querySelector('[data-project-filter=\"map\"]').click(); true");
await delay(60);
const projectMapState = await evaluate(`({
  selected: document.querySelector('[data-project-filter="map"]').getAttribute('aria-selected'),
  labelledBy: document.querySelector('#projectPanel').getAttribute('aria-labelledby'),
  visible: document.querySelector('#projectRelationMap').checkVisibility(),
  cardsHidden: !document.querySelector('#projectGrid').checkVisibility(),
  repositories: document.querySelectorAll('.project-map-node[data-project-map-kind="repository"]').length,
  explicitEdges: document.querySelectorAll('.project-map-edge.explicit').length
})`);
assert(projectMapState.selected === "true" && projectMapState.labelledBy === "projectTabMap", "项目关系图标签状态不完整");
assert(projectMapState.visible && projectMapState.cardsHidden, "项目关系图与卡片不应同时显示");
assert(projectMapState.repositories === expectedGitHub.owned, "项目关系图默认范围应为全部自建项目");
assert(projectMapState.explicitEdges > 0, "项目关系图未渲染人工确认关系");
await evaluate(`(() => {
  const input = document.querySelector('#projectMapSearch');
  input.value = 'Python';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
assert(await evaluate("document.querySelectorAll('.project-map-node.search-match').length") > 0, "项目关系图搜索未标记结果");
assert(await evaluate("document.querySelectorAll('.project-map-node.search-context').length") > 0, "项目关系图搜索未保留相邻上下文");
await evaluate("document.querySelector('.project-map-node.search-match').dispatchEvent(new MouseEvent('click', { bubbles: true })); true");
assert(await evaluate("document.querySelector('#projectMapDetail').textContent.trim().length") > 20, "项目关系图节点详情未更新");
await evaluate("document.querySelector('[data-project-filter=\"owned\"]').click(); true");

await evaluate("document.querySelector('[data-category=\"AI/Skill\\ 创建\"]').click(); true");
await delay(50);
assert(await evaluate("document.querySelectorAll('.note-card').length") === 1, "二级分类筛选未生效");

await evaluate("document.querySelector('#filterSummary').click(); true");
await evaluate(`(() => {
  const input = document.querySelector('#searchInput');
  input.value = 'Transformer';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
assert(await evaluate("document.querySelectorAll('.note-card').length") === 1, "全文搜索未生效");

await evaluate("document.querySelector('#filterSummary').click(); document.querySelector('[data-quick-filter=\"attention\"]').click(); true");
assert(await evaluate("document.querySelectorAll('.note-card').length") === 5, "需处理快捷筛选未生效");

await evaluate("document.querySelector('#filterSummary').click(); document.querySelector('#appearanceButton').click(); true");
assert(await evaluate("document.querySelector('#appearanceDialog').open"), "外观设置未通过渐进式披露打开");
await evaluate("document.querySelector('#appearanceDialog').close(); true");

await evaluate("document.querySelector('[data-theme-value=\"command\"]').click(); true");
assert(await evaluate("document.body.dataset.theme") === "command", "主题切换未生效");
assert(await evaluate("localStorage.getItem('starline-note-library-theme-v1')") === "command", "主题未持久化");

await evaluate("document.querySelector('[data-view=\"list\"]').click(); true");
assert(await evaluate("document.querySelector('#notesGrid').classList.contains('is-list')"), "列表视图未生效");

await evaluate(`(() => {
  document.querySelector('#newNoteButton').click();
  document.querySelector('#noteTitle').value = '浏览器烟雾测试笔记';
  document.querySelector('#noteSummary').value = '用于验证本地草稿、分类与数据持久化的测试笔记。';
  document.querySelector('#noteId').value = 'browser-smoke-note';
  document.querySelector('#noteUrl').value = 'notes/browser-smoke.html';
  document.querySelector('#noteCategory').value = 'AI / 基础培训';
  document.querySelector('#noteTags').value = '测试, 浏览器';
  document.querySelector('#noteForm').requestSubmit();
  return true;
})()`);
await delay(100);
const saved = await evaluate(`({
  cards: document.querySelectorAll('.note-card').length,
  mode: document.querySelector('#dataModeText').textContent,
  draft: JSON.parse(localStorage.getItem('starline-note-library-data-v1')).notes.some(note => note.id === 'browser-smoke-note')
})`);
assert(saved.cards === 11, "保存本地草稿后数量未更新");
assert(saved.mode.includes("本地草稿"), "数据源状态未切换为本地草稿");
assert(saved.draft, "本地草稿未持久化");

await evaluate("document.querySelector('.note-card').click(); true");
assert(await evaluate("document.querySelector('#detailDialog').open"), "详情对话框未打开");
await evaluate("document.querySelector('#detailDialog').close(); true");

await command("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true
});
await delay(100);
const mobile = await evaluate(`({
  fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  menuVisible: getComputedStyle(document.querySelector('#openSidebar')).display !== 'none',
  floatingCreate: getComputedStyle(document.querySelector('#newNoteButton')).position === 'fixed',
  headingFits: document.querySelector('.page-heading h1').getBoundingClientRect().right <= innerWidth,
  mainFits: document.querySelector('#main').getBoundingClientRect().right <= innerWidth
})`);
assert(mobile.fits, "390px 视口出现页面级横向溢出");
assert(mobile.menuVisible, "移动端分类入口不可见");
assert(mobile.floatingCreate, "移动端新建入口未转换为悬浮按钮");
assert(mobile.headingFits && mobile.mainFits, "移动端主内容超出可视宽度");
await evaluate("document.querySelector('#openSidebar').click(); true");
await delay(320);
const drawer = await evaluate("({open: document.body.classList.contains('sidebar-open'), left: document.querySelector('#sidebar').getBoundingClientRect().left, right: document.querySelector('#sidebar').getBoundingClientRect().right, viewport: document.documentElement.clientWidth})");
assert(drawer.open, "移动端目录未以抽屉方式打开");
assert(drawer.left >= -1 && drawer.right <= drawer.viewport + 1, `移动端目录抽屉超出可视宽度：${JSON.stringify(drawer)}`);
await evaluate("document.querySelector('#closeSidebar').click(); true");
assert(await evaluate("!document.body.classList.contains('sidebar-open')"), "移动端目录抽屉未关闭");

console.log(JSON.stringify({
  ok: true,
  checks: [
    "data rendering",
    "task-first home hierarchy",
    "homepage README routes",
    "GitHub-first project ordering",
    "project introduction and README reading path",
    "desktop collapsible sidebar and mobile drawer",
    "GitHub owned/fork/commit/star overview",
    "maintenance focus and highlighted projects",
    "GitHub project scope filters",
    "progressive appearance settings",
    "nested category filter",
    "full-text search",
    "attention quick filter",
    "theme persistence",
    "view switch",
    "local draft persistence",
    "detail dialog",
    "390px responsive layout"
  ]
}, null, 2));

socket.close();
