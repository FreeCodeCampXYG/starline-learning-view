const DEBUG_ENDPOINT = "http://127.0.0.1:9333/json";
const githubPayload = await fetch("http://127.0.0.1:8765/data/github-projects.json").then((response) => response.json());
const expectedGitHub = {
  owned: githubPayload.projects.filter((project) => !project.fork).length,
  forks: githubPayload.projects.filter((project) => project.fork).length,
  pages: githubPayload.projects.filter((project) => !project.fork && project.hasPages).length,
  commits: githubPayload.projects.reduce((total, project) => total + (Number.isInteger(project.commitCount) ? project.commitCount : 0), 0),
  starred: githubPayload.starred.length
};

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
  defaultList: document.querySelector('#notesGrid').classList.contains('is-list'),
  exactTotal: document.querySelector('#statTotal').textContent.trim()
})`);
assert(usability.themesHidden, "外观选择不应占据首屏");
assert(usability.smartViews === 4, "快捷入口数量错误");
assert(usability.focusCards === 2, "最近更新与维护提醒未渲染");
assert(usability.defaultList, "文本型笔记应默认使用列表视图");
assert(usability.exactTotal === "10", "统计数字应立即显示真实值");

const githubOverview = await evaluate(`({
  owned: document.querySelector('#projectOwnedCount').textContent.trim(),
  forks: document.querySelector('#projectForkCount').textContent.trim(),
  commits: document.querySelector('#projectCommitCount').textContent.trim(),
  starred: document.querySelector('#projectStarredCount').textContent.trim(),
  defaultCards: document.querySelectorAll('.project-card').length
})`);
assert(githubOverview.owned === String(expectedGitHub.owned), `自建项目统计错误：${githubOverview.owned}`);
assert(githubOverview.forks === String(expectedGitHub.forks), `Fork 项目统计错误：${githubOverview.forks}`);
assert(githubOverview.commits === String(expectedGitHub.commits), `本人提交统计错误：${githubOverview.commits}`);
assert(githubOverview.starred === String(expectedGitHub.starred), `Star 统计错误：${githubOverview.starred}`);
assert(githubOverview.defaultCards === expectedGitHub.owned, "默认应展示全部自建项目");

await evaluate("document.querySelector('[data-project-filter=\"pages\"]').click(); true");
assert(await evaluate("document.querySelectorAll('.project-card').length") === expectedGitHub.pages, "Pages 项目筛选未生效");
await evaluate("document.querySelector('[data-project-filter=\"forks\"]').click(); true");
assert(await evaluate("document.querySelectorAll('.project-card').length") === expectedGitHub.forks, "Fork 项目筛选未生效");
await evaluate("document.querySelector('[data-project-filter=\"starred\"]').click(); true");
assert(await evaluate("document.querySelectorAll('.project-card').length") === expectedGitHub.starred, "Star 项目筛选未生效");
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

console.log(JSON.stringify({
  ok: true,
  checks: [
    "data rendering",
    "task-first home hierarchy",
    "GitHub owned/fork/commit/star overview",
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
