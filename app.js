"use strict";

const STORAGE = {
  data: "starline-note-library-data-v1",
  theme: "starline-note-library-theme-v1",
  view: "starline-note-library-view-v2",
  sidebar: "starline-note-library-sidebar-v1"
};

const THEME_COPY = {
  atelier: "编辑部式留白，让内容成为视觉中心。",
  command: "开发者控制台式高密度，强调状态与效率。",
  atlas: "柔和的知识地图，用色带建立分类方向感。",
  blueprint: "工程蓝图语言，突出结构、版本与维护秩序。",
  spectrum: "现代产品界面，在展示气质与管理效率间取平衡。"
};

const STATUS_LABELS = {
  published: "已发布",
  draft: "草稿",
  archived: "已归档"
};

const LINK_LABELS = {
  healthy: "链接正常",
  unchecked: "待检查",
  broken: "链接异常"
};

const CATEGORY_COLORS = {
  "AI": "#d94c3d",
  "产品与设计": "#80659a",
  "软件工程": "#2d7590",
  "商业与管理": "#a37322"
};

const state = {
  repositoryPayload: null,
  notes: [],
  projectPayload: null,
  projects: [],
  starredProjects: [],
  projectGuides: {},
  relations: [],
  projectFilter: "owned",
  query: "",
  category: "all",
  tags: new Set(),
  status: "all",
  linkStatus: "all",
  quickFilter: "all",
  sort: "updated-desc",
  featuredOnly: false,
  view: ["list", "grid", "map"].includes(readStorage(STORAGE.view)) ? readStorage(STORAGE.view) : "list",
  localMode: false
};

const dom = {};
let projectAnimationTimer = 0;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  cacheDom();
  bindEvents();
  const requestedTheme = new URLSearchParams(location.search).get("theme");
  applyTheme(THEME_COPY[requestedTheme] ? requestedTheme : (readStorage(STORAGE.theme) || "atelier"));
  applyView(state.view);
  restoreSidebarState();

  try {
    const response = await fetch("data/notes.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const errors = validatePayload(payload);
    if (errors.length) throw new Error(errors.join("；"));
    state.repositoryPayload = structuredCloneSafe(payload);

    const localPayload = readLocalPayload();
    if (localPayload) {
      state.notes = localPayload.notes;
      state.localMode = true;
    } else {
      state.notes = structuredCloneSafe(payload.notes);
    }
    try {
      const projectResponse = await fetch("data/github-projects.json", { cache: "no-store" });
      if (projectResponse.ok) {
        const projectPayload = await projectResponse.json();
        const projectErrors = validateProjectPayload(projectPayload);
        if (!projectErrors.length) {
          state.projectPayload = projectPayload;
          state.projects = structuredCloneSafe(projectPayload.projects);
          state.starredProjects = structuredCloneSafe(projectPayload.starred || []);
        }
      }
    } catch { /* 项目索引是辅助数据，失败时不阻断核心笔记目录。 */ }
    try {
      const guideResponse = await fetch("data/project-guides.json", { cache: "no-store" });
      if (guideResponse.ok) {
        const guidePayload = await guideResponse.json();
        const guideErrors = validateProjectGuidesPayload(guidePayload);
        if (!guideErrors.length) state.projectGuides = structuredCloneSafe(guidePayload.projects);
      }
    } catch { /* 项目介绍是辅助数据，失败时保留 GitHub 原始简介和 README 链接。 */ }
    try {
      const relationResponse = await fetch("data/relations.json", { cache: "no-store" });
      if (relationResponse.ok) {
        const relationPayload = await relationResponse.json();
        if (Array.isArray(relationPayload.relations)) state.relations = structuredCloneSafe(relationPayload.relations);
      }
    } catch { /* 关系数据是辅助层，失败时继续提供列表与卡片视图。 */ }
    renderAll();
  } catch (error) {
    renderLoadError(error);
  }
}

function cacheDom() {
  [
    "searchInput", "categoryTree", "categoryCount", "tagCloud", "clearTags",
    "statusFilter", "linkFilter", "sortFilter", "filterSummary", "notesGrid",
    "emptyState", "emptyResetButton", "resultCount", "libraryHeading", "statTotal",
    "statPublished", "statUnchecked", "statCategories", "featuredButton", "dataModeText",
    "themeDescription", "openSidebar", "closeSidebar", "collapseSidebar", "sidebarScrim", "newNoteButton",
    "appearanceButton", "appearanceSidebarButton", "appearanceDialog", "closeAppearance", "continueCard", "attentionCard",
    "navTotal", "navFeatured", "navAttention", "navDraft", "navProjects", "activeFilterRow",
    "detailDialog", "detailContent", "closeDetail", "editorDialog", "closeEditor",
    "cancelEditor", "noteForm", "editorTitle", "noteOriginalId", "noteId", "noteTitle",
    "noteSummary", "noteUrl", "noteRepoUrl", "noteCategory", "noteTags", "noteStatus",
    "noteLinkStatus", "noteMinutes", "noteFeatured", "formError", "importButton",
    "exportButton", "importInput", "resetDraftButton", "toast",
    "projectGrid", "projectEmpty", "projectResultCount", "projectSyncText", "projectFreshness", "projectSpotlight",
    "projectOwnedCount", "projectForkCount", "projectCommitCount", "projectCommitLabel", "projectCommitHint", "projectStarredCount", "commitScope",
    "projectMaintenanceFocus", "projectMaintenanceSummary", "projectMaintenanceList",
    "projectFilterTabs", "projectTabIndicator", "projectPanel",
    "projectRelationMap", "projectMapSearch", "projectMapScope", "projectMapFit",
    "projectMapReset", "projectMapGraph", "projectMapViewport", "projectMapEdges",
    "projectMapNodes", "projectMapEmpty", "projectMapSummary", "projectMapStatus",
    "projectMapDetail", "projectMapVisibleCount", "projectMapNodeList",
    "knowledgeMap", "knowledgeMapSearch", "knowledgeMapScope", "knowledgeMapFit",
    "knowledgeMapPause", "knowledgeMapReset", "knowledgeMapGraph", "knowledgeMapViewport",
    "knowledgeMapEdges", "knowledgeMapEdgeLabels", "knowledgeMapNodes", "knowledgeMapEmpty",
    "knowledgeMapSummary", "knowledgeMapStatus", "knowledgeMapDetail", "knowledgeMapVisibleCount",
    "knowledgeMapNodeList"
  ].forEach((id) => { dom[id] = document.getElementById(id); });
}

function bindEvents() {
  dom.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLocaleLowerCase("zh-CN");
    renderLibrary();
    renderProjects();
  });

  document.querySelectorAll("[data-project-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activateProjectFilter(button.dataset.projectFilter);
    });
  });
  document.querySelectorAll(".smart-nav-link").forEach((link) => {
    link.addEventListener("click", () => closeSidebar());
  });
  document.querySelectorAll("[data-readme-action]").forEach((button) => {
    button.addEventListener("click", () => openReadmeDestination(button.dataset.readmeAction));
  });
  dom.projectFilterTabs.addEventListener("keydown", handleProjectTabKeydown);
  window.addEventListener("resize", positionProjectTabIndicator);
  initializeProjectMapEvents();
  dom.statusFilter.addEventListener("change", (event) => {
    state.status = event.target.value;
    state.quickFilter = "all";
    renderQuickFilters();
    renderLibrary();
  });
  dom.linkFilter.addEventListener("change", (event) => {
    state.linkStatus = event.target.value;
    state.quickFilter = "all";
    renderQuickFilters();
    renderLibrary();
  });
  dom.sortFilter.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderLibrary();
  });

  dom.categoryTree.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    clearFilters(false);
    state.category = button.dataset.category;
    renderCategoryTree();
    renderLibrary();
    closeSidebar();
  });

  dom.tagCloud.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tag]");
    if (!button) return;
    const tag = button.dataset.tag;
    if (state.tags.has(tag)) state.tags.delete(tag);
    else state.tags.add(tag);
    renderTagCloud();
    renderLibrary();
  });

  dom.clearTags.addEventListener("click", () => {
    state.tags.clear();
    renderTagCloud();
    renderLibrary();
  });

  dom.featuredButton.addEventListener("click", () => {
    state.featuredOnly = !state.featuredOnly;
    if (state.featuredOnly) state.quickFilter = "all";
    dom.featuredButton.classList.toggle("is-active", state.featuredOnly);
    dom.featuredButton.setAttribute("aria-pressed", String(state.featuredOnly));
    renderLibrary();
    renderSmartNav();
  });

  document.querySelectorAll("[data-smart-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.smartView;
      clearFilters(false);
      if (view === "featured") state.featuredOnly = true;
      if (view === "attention" || view === "draft") state.quickFilter = view;
      renderAll();
      closeSidebar();
    });
  });

  document.querySelectorAll("[data-quick-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.quickFilter = button.dataset.quickFilter;
      state.status = "all";
      state.linkStatus = "all";
      state.featuredOnly = false;
      dom.statusFilter.value = "all";
      dom.linkFilter.value = "all";
      dom.featuredButton.classList.remove("is-active");
      renderQuickFilters();
      renderSmartNav();
      renderLibrary();
    });
  });

  dom.filterSummary.addEventListener("click", clearFilters);
  dom.emptyResetButton.addEventListener("click", clearFilters);

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => applyView(button.dataset.view));
  });
  initializeKnowledgeMapEvents();

  document.querySelectorAll("[data-theme-value]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.themeValue);
      window.setTimeout(() => dom.appearanceDialog.close(), 120);
    });
  });

  dom.appearanceButton.addEventListener("click", () => dom.appearanceDialog.showModal());
  dom.appearanceSidebarButton.addEventListener("click", () => {
    closeSidebar();
    dom.appearanceDialog.showModal();
  });
  dom.closeAppearance.addEventListener("click", () => dom.appearanceDialog.close());

  dom.notesGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-note-id]");
    if (card) openDetail(card.dataset.noteId);
  });
  dom.notesGrid.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-note-id]");
    if (!card || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openDetail(card.dataset.noteId);
  });

  dom.detailContent.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-note]");
    if (!editButton) return;
    dom.detailDialog.close();
    openEditor(editButton.dataset.editNote);
  });

  dom.openSidebar.addEventListener("click", toggleSidebar);
  dom.collapseSidebar.addEventListener("click", collapseSidebar);
  dom.closeSidebar.addEventListener("click", () => closeSidebar({ restoreFocus: true }));
  dom.sidebarScrim.addEventListener("click", () => closeSidebar({ restoreFocus: true }));
  window.addEventListener("resize", handleSidebarResize);
  dom.newNoteButton.addEventListener("click", () => openEditor());
  dom.closeDetail.addEventListener("click", () => dom.detailDialog.close());
  dom.closeEditor.addEventListener("click", closeEditor);
  dom.cancelEditor.addEventListener("click", closeEditor);
  dom.noteForm.addEventListener("submit", saveNoteFromForm);
  dom.importButton.addEventListener("click", () => dom.importInput.click());
  dom.importInput.addEventListener("change", importJson);
  dom.exportButton.addEventListener("click", exportJson);
  dom.resetDraftButton.addEventListener("click", resetToRepositoryData);
  dom.continueCard.addEventListener("click", (event) => {
    const button = event.target.closest("[data-continue-note]");
    if (button) openDetail(button.dataset.continueNote);
  });
  dom.attentionCard.addEventListener("click", () => {
    clearFilters(false);
    state.quickFilter = "attention";
    renderAll();
  });
  dom.attentionCard.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    dom.attentionCard.click();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      dom.searchInput.focus();
    }
    if (event.key === "Escape") closeSidebar({ restoreFocus: true });
  });
}

function renderAll() {
  renderStats();
  renderSmartNav();
  renderQuickFilters();
  renderFocusRow();
  renderCategoryTree();
  renderTagCloud();
  renderLibrary();
  renderProjects();
  renderDataMode();
}

function activateProjectFilter(filter) {
  if (!["owned", "pages", "forks", "starred", "map"].includes(filter)) return;
  const changed = state.projectFilter !== filter;
  state.projectFilter = filter;
  renderProjects({ animate: changed });
}

function handleProjectTabKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...dom.projectFilterTabs.querySelectorAll("[data-project-filter]")];
  const currentIndex = tabs.indexOf(document.activeElement);
  if (currentIndex < 0) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  tabs[nextIndex].focus();
  activateProjectFilter(tabs[nextIndex].dataset.projectFilter);
}

function positionProjectTabIndicator() {
  if (!dom.projectFilterTabs || !dom.projectTabIndicator) return;
  const activeTab = dom.projectFilterTabs.querySelector("[data-project-filter].is-active");
  if (!activeTab) return;
  dom.projectFilterTabs.style.setProperty("--project-tab-left", `${activeTab.offsetLeft}px`);
  dom.projectFilterTabs.style.setProperty("--project-tab-width", `${activeTab.offsetWidth}px`);
}

function renderProjects({ animate = false } = {}) {
  document.querySelectorAll("[data-project-filter]").forEach((button) => {
    const active = button.dataset.projectFilter === state.projectFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    if (active) dom.projectPanel.setAttribute("aria-labelledby", button.id);
  });
  window.requestAnimationFrame(positionProjectTabIndicator);

  const mapActive = state.projectFilter === "map";
  renderProjectSpotlight();
  dom.projectGrid.hidden = mapActive;
  dom.projectEmpty.hidden = true;
  dom.projectRelationMap.hidden = !mapActive;
  dom.commitScope.hidden = mapActive;
  if (mapActive) {
    dom.projectResultCount.textContent = String(state.projects.length + state.starredProjects.length);
    if (state.projectPayload) {
      window.requestAnimationFrame(() => renderProjectMap({ fit: true }));
    } else {
      dom.projectMapSummary.textContent = "公开项目索引暂未载入";
      dom.projectMapStatus.textContent = "请稍后刷新；笔记目录和现有项目卡片仍可正常使用。";
      dom.projectMapEmpty.hidden = false;
      dom.projectMapVisibleCount.textContent = "0";
      dom.projectMapEdges.replaceChildren();
      dom.projectMapNodes.replaceChildren();
    }
    renderProjectProfileSummary();
    return;
  }

  const source = state.projectFilter === "starred" ? state.starredProjects : state.projects;
  const projects = source.filter((project) => {
    const haystack = [project.name, project.description, project.language, ...(project.topics || [])]
      .filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    return (!state.query || haystack.includes(state.query))
      && (state.projectFilter === "starred"
        || (state.projectFilter === "owned" && !project.fork)
        || (state.projectFilter === "pages" && !project.fork && project.hasPages)
        || (state.projectFilter === "forks" && project.fork));
  });

  dom.projectResultCount.textContent = String(projects.length);
  dom.projectGrid.innerHTML = projects.map((project, index) => renderProjectCard(project, state.projectFilter === "starred", index)).join("");
  dom.projectGrid.hidden = projects.length === 0;
  dom.projectEmpty.hidden = projects.length !== 0;
  if (animate && projects.length) {
    dom.projectGrid.classList.remove("is-entering");
    void dom.projectGrid.offsetWidth;
    dom.projectGrid.classList.add("is-entering");
    window.clearTimeout(projectAnimationTimer);
    projectAnimationTimer = window.setTimeout(() => dom.projectGrid.classList.remove("is-entering"), 560);
  }
  renderProjectProfileSummary();
}

function renderProjectSpotlight() {
  if (!dom.projectSpotlight) return;
  const project = state.projects.find((item) => item.name === "starline-learning-view");
  const guide = state.projectGuides["starline-learning-view"];
  const searchable = [project?.name, project?.description, guide?.title, guide?.intro, guide?.audience]
    .filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
  const visible = state.projectFilter === "owned" && project && guide && (!state.query || searchable.includes(state.query));
  dom.projectSpotlight.hidden = !visible;
  if (!visible) {
    dom.projectSpotlight.replaceChildren();
    return;
  }

  const repoUrl = safeHref(project.repoUrl);
  const pagesUrl = deriveProjectPagesUrl(project, state.projectPayload?.owner);
  const capabilityList = (guide.capabilities || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const readmeList = (guide.readmeGuide || []).map((item) => `<li><a href="${escapeAttr(safeHref(item.url))}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span><span aria-hidden="true">↗</span></a></li>`).join("");
  dom.projectSpotlight.innerHTML = `<div class="project-spotlight-main">
    <div class="project-spotlight-kicker"><span class="eyebrow">${escapeHtml(guide.label || "项目介绍")}</span><code>${escapeHtml(project.fullName)}</code></div>
    <h3 id="projectSpotlightTitle">${escapeHtml(guide.title || project.name)}</h3>
    <p class="project-spotlight-intro">${escapeHtml(guide.intro || project.description || "")}</p>
    <p class="project-spotlight-audience"><strong>适合谁：</strong>${escapeHtml(guide.audience || "希望追溯公开项目并整理学习内容的读者。")}</p>
    <ul class="project-spotlight-capabilities">${capabilityList}</ul>
    <div class="project-spotlight-actions">
      ${pagesUrl ? `<a class="button button-primary" href="${escapeAttr(pagesUrl)}" target="_blank" rel="noopener noreferrer">打开在线页面 ↗</a>` : ""}
      ${repoUrl ? `<a class="button button-secondary" href="${escapeAttr(`${repoUrl}#readme`)}" target="_blank" rel="noopener noreferrer">打开 README ↗</a>` : ""}
    </div>
  </div><div class="project-readme-guide">
    <div><span class="eyebrow">README PATH / 阅读顺序</span><h4>按这个顺序了解项目</h4><p>README 是项目的使用说明和维护入口，先看概览，再看数据与部署。</p></div>
    <ol>${readmeList}</ol>
  </div>`;
}

function renderProjectProfileSummary() {
  if (state.projectPayload) {
    const generatedAt = new Date(state.projectPayload.generatedAt);
    const time = Number.isNaN(generatedAt.getTime()) ? state.projectPayload.generatedAt : new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(generatedAt);
    const summary = state.projectPayload.summary || {};
    const freshness = getProjectDataFreshness(state.projectPayload.generatedAt);
    dom.projectSyncText.textContent = `${state.projectPayload.owner} · ${summary.repositories ?? state.projects.length} 个公开仓库 · 索引更新于 ${time}`;
    dom.projectFreshness.className = `project-freshness is-${freshness.level}`;
    dom.projectFreshness.textContent = freshness.label;
    dom.projectFreshness.title = freshness.detail;
    dom.projectOwnedCount.textContent = String(summary.owned ?? state.projects.filter((project) => !project.fork).length);
    dom.projectForkCount.textContent = String(summary.forked ?? state.projects.filter((project) => project.fork).length);
    const hasRecentCommitTotal = Number.isInteger(summary.recentMatchedDefaultBranchCommits);
    dom.projectCommitCount.textContent = String(hasRecentCommitTotal ? summary.recentMatchedDefaultBranchCommits : (summary.matchedDefaultBranchCommits ?? "—"));
    dom.projectCommitLabel.textContent = hasRecentCommitTotal ? "近期提交" : "本人提交";
    dom.projectCommitHint.textContent = hasRecentCommitTotal ? `近 ${Number(state.projectPayload.activityWindowDays) || 30} 天匹配` : "默认分支匹配";
    dom.projectStarredCount.textContent = String(summary.starred ?? state.starredProjects.length);
    const activityWindowDays = Number(state.projectPayload.activityWindowDays) || 30;
    const commitScope = state.projectPayload.commitScope || "提交数按 GitHub 账号身份匹配每个公开仓库默认分支统计。";
    dom.commitScope.textContent = `${commitScope} 近期优先区按近 ${activityWindowDays} 天提交和最近推送自动计算。`;
    dom.navProjects.textContent = String(summary.repositories ?? state.projects.length);
    renderProjectMaintenanceFocus();
  } else {
    dom.projectSyncText.textContent = "项目索引暂未载入；笔记目录仍可正常使用。";
    dom.projectFreshness.className = "project-freshness is-unknown";
    dom.projectFreshness.textContent = "索引未载入";
    dom.projectFreshness.title = "项目索引加载失败；不会影响本地笔记目录。";
    [dom.projectOwnedCount, dom.projectForkCount, dom.projectCommitCount, dom.projectStarredCount].forEach((element) => { element.textContent = "—"; });
    dom.navProjects.textContent = "—";
    dom.projectMaintenanceFocus.hidden = true;
  }
}

function getProjectDataFreshness(value, now = Date.now()) {
  const generatedTime = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(generatedTime)) return { level: "unknown", label: "时间未知", detail: "索引没有可识别的生成时间。" };
  const ageHours = Math.max(0, (now - generatedTime) / 3600000);
  if (ageHours <= 1.5) return { level: "fresh", label: "刚刚自动刷新", detail: "索引在 90 分钟内生成。" };
  if (ageHours <= 8) return { level: "fresh", label: `${Math.floor(ageHours)} 小时前刷新`, detail: "索引处于每 6 小时自动刷新周期内。" };
  if (ageHours <= 18) return { level: "current", label: `${Math.floor(ageHours)} 小时前刷新`, detail: "可能存在 GitHub Actions 排队延迟，但仍属于当天索引。" };
  return { level: "stale", label: "同步可能延迟", detail: `索引已约 ${Math.floor(ageHours)} 小时未刷新，请检查 GitHub Actions。` };
}

function openReadmeDestination(destination) {
  if (destination === "notes") {
    document.querySelector("#libraryHeading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (destination === "knowledge-map") {
    document.querySelector('[data-view="map"]')?.click();
    window.setTimeout(() => document.querySelector("#knowledgeMapTitle")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return;
  }
  if (destination === "project-map") {
    activateProjectFilter("map");
    window.setTimeout(() => document.querySelector("#projectRelationMapTitle")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }
}

function getProjectMaintenanceState(project, now = Date.now()) {
  const commitCount = Number.isInteger(project?.commitCount) ? project.commitCount : null;
  const recentCommitCount = Number.isInteger(project?.recentCommitCount) ? project.recentCommitCount : null;
  const activityWindowDays = Number(state.projectPayload?.activityWindowDays) || 30;
  const activityTimes = [project?.lastMatchedCommitAt, project?.pushedAt, project?.updatedAt]
    .map((value) => value ? new Date(value).getTime() : Number.NaN)
    .filter(Number.isFinite);
  const activityTime = activityTimes.length ? Math.max(...activityTimes) : Number.NaN;
  const daysSinceActivity = Number.isFinite(activityTime) ? Math.max(0, Math.floor((now - activityTime) / 86400000)) : null;
  const highPriority = (recentCommitCount !== null && recentCommitCount >= 3) || (recentCommitCount !== null && recentCommitCount >= 1 && daysSinceActivity !== null && daysSinceActivity <= 7);
  const recent = (recentCommitCount !== null && recentCommitCount >= 1) || (daysSinceActivity !== null && daysSinceActivity <= activityWindowDays);
  const level = highPriority ? "active" : (recent ? "recent" : "");
  const label = highPriority ? "近期高频" : (recent ? "近期维护" : "");
  const detail = recentCommitCount !== null && recentCommitCount > 0
    ? `近 ${activityWindowDays} 天本人 ${recentCommitCount} 次提交`
    : (recent && daysSinceActivity !== null ? `${daysSinceActivity === 0 ? "今天" : `${daysSinceActivity} 天前`}推送` : "");
  const priorityScore = (recentCommitCount || 0) * 20 + (daysSinceActivity === null ? 0 : Math.max(0, activityWindowDays - daysSinceActivity));
  return { active: highPriority, recent, level, label, detail, daysSinceActivity, commitCount, recentCommitCount, priorityScore };
}

function renderProjectMaintenanceFocus() {
  if (!dom.projectMaintenanceFocus) return;
  const projects = state.projects
    .filter((project) => !project.fork && !project.archived)
    .map((project) => ({ project, maintenance: getProjectMaintenanceState(project) }))
    .filter(({ maintenance }) => maintenance.level)
    .sort((a, b) => {
      const scoreDelta = b.maintenance.priorityScore - a.maintenance.priorityScore;
      if (scoreDelta) return scoreDelta;
      return compareDateDesc(a.project.pushedAt || a.project.updatedAt, b.project.pushedAt || b.project.updatedAt);
    });

  if (!state.projectPayload || !projects.length) {
    dom.projectMaintenanceFocus.hidden = true;
    return;
  }

  const activityWindowDays = Number(state.projectPayload.activityWindowDays) || 30;
  const recentCommitTotal = state.projectPayload.summary?.recentMatchedDefaultBranchCommits;
  const recentCommitCopy = Number.isInteger(recentCommitTotal) ? ` · 本人提交 ${recentCommitTotal} 次` : "";
  dom.projectMaintenanceSummary.textContent = `自动筛出 ${projects.length} 个 · 近 ${activityWindowDays} 天${recentCommitCopy}；按近期提交与推送排序，每 6 小时刷新。`;
  dom.projectMaintenanceList.innerHTML = projects.slice(0, 4).map(({ project, maintenance }) => {
    const repoUrl = safeHref(project.repoUrl);
    const pagesUrl = deriveProjectPagesUrl(project, state.projectPayload?.owner);
    const primaryUrl = pagesUrl || repoUrl;
    return `<a class="project-maintenance-item is-${maintenance.level}" href="${escapeAttr(primaryUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(`${project.name} · ${maintenance.label} · ${maintenance.detail}`)}">
      <span class="maintenance-item-mark" aria-hidden="true"></span>
      <span class="maintenance-item-copy"><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(maintenance.label)} · ${escapeHtml(maintenance.detail)}</small></span>
      <span class="maintenance-item-arrow" aria-hidden="true">↗</span>
    </a>`;
  }).join("");
  dom.projectMaintenanceFocus.hidden = false;
}

function renderProjectCard(project, starred = false, index = 0) {
  const repoUrl = safeHref(project.repoUrl);
  const pagesUrl = deriveProjectPagesUrl(project, state.projectPayload?.owner);
  const homepage = project.homepage ? safeHref(project.homepage) : "";
  const primaryUrl = pagesUrl || homepage || repoUrl;
  const maintenance = getProjectMaintenanceState(project);
  const description = projectDescription(project, starred);
  const pagesTarget = pagesUrl ? pagesUrl.replace(/^https?:\/\//i, "") : "";
  const badges = (starred
    ? [project.language, `${Number(project.stars) || 0} Stars`, "我的收藏"]
    : [project.language, project.hasPages ? "GitHub Pages" : "源码仓库", project.fork ? "Fork" : "自建"]).filter(Boolean);
  const commitCopy = starred ? `社区 ${Number(project.stars) || 0} Stars` : (Number.isInteger(project.commitCount) ? `本人 ${project.commitCount} 次提交` : "本人提交数未知");
  const upstream = project.upstream?.repoUrl ? `<span class="project-upstream">上游：<a href="${escapeAttr(safeHref(project.upstream.repoUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(project.upstream.fullName || "查看来源")}</a></span>` : "";
  const maintenanceLine = maintenance.level ? `<div class="project-maintenance-line is-${maintenance.level}"><span class="maintenance-dot" aria-hidden="true"></span><strong>${escapeHtml(maintenance.label)}</strong><small>${escapeHtml(maintenance.detail)}</small></div>` : "";
  return `<article class="project-card${maintenance.level ? ` is-maintenance-${maintenance.level}` : ""}" style="--project-card-index:${Math.min(index, 8)}">
    <div class="project-card-top"><span class="project-repo-mark" aria-hidden="true">⌘</span><span>${escapeHtml(project.fullName)}</span></div>
    <h3>${escapeHtml(project.name)}</h3>
    ${maintenanceLine}
    <p>${escapeHtml(description)}</p>
    ${pagesTarget ? `<div class="project-pages-target" title="${escapeAttr(pagesUrl)}"><span>Pages</span><code>${escapeHtml(pagesTarget)}</code></div>` : ""}
    <div class="project-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div>
    ${upstream}
    <footer><span>${escapeHtml(commitCopy)} · 更新 ${formatTimestampDate(project.updatedAt)}</span><div>
      ${repoUrl ? `<a href="${escapeAttr(`${repoUrl}#readme`)}" target="_blank" rel="noopener noreferrer">README</a>` : ""}
      ${repoUrl ? `<a href="${escapeAttr(repoUrl)}" target="_blank" rel="noopener noreferrer">源码</a>` : ""}
      ${primaryUrl && primaryUrl !== repoUrl ? `<a class="project-open" href="${escapeAttr(primaryUrl)}" target="_blank" rel="noopener noreferrer">${pagesUrl ? "打开网站" : "访问主页"} ↗</a>` : ""}
    </div></footer>
  </article>`;
}

function deriveProjectPagesUrl(project, fallbackOwner = "") {
  if (!project?.hasPages) return "";
  const [fullNameOwner, fullNameRepository] = String(project.fullName || "").split("/");
  const owner = (fullNameOwner || fallbackOwner || "").trim();
  const repository = (fullNameRepository || project.name || "").trim();
  if (!owner || !repository) return "";
  const host = `${owner.toLocaleLowerCase("en-US")}.github.io`;
  const path = repository.toLocaleLowerCase("en-US") === host ? "/" : `/${encodeURIComponent(repository)}/`;
  return `https://${host}${path}`;
}

function projectDescription(project, starred = false) {
  const guide = state.projectGuides[project?.name];
  if (guide?.intro) return guide.intro;
  if (project.description?.trim()) return project.description.trim();
  if (String(project.name).toLocaleLowerCase("en-US") === "starline-learning-view") {
    return "集中管理学习笔记网页与 GitHub Pages 项目的静态知识库导航。";
  }
  if (starred) return "已收藏的开源项目，可前往源码仓库查看完整介绍与使用方式。";
  if (project.fork) return "从上游同步的 Fork 项目，可前往源码仓库查看来源与完整说明。";
  if (project.hasPages) return `已通过 GitHub Pages 发布的 ${project.language || "Web"} 项目，可直接在线查看。`;
  return `${project.language || "公开"}项目，详细功能说明可在源码仓库中继续补充。`;
}

function renderStats() {
  const primaryCategories = new Set(state.notes.map((note) => note.categoryPath[0]));
  const attentionCount = state.notes.filter((note) => note.status === "draft" || note.linkStatus !== "healthy").length;
  animateNumber(dom.statTotal, state.notes.length);
  animateNumber(dom.statPublished, state.notes.filter((note) => note.status === "published").length);
  animateNumber(dom.statUnchecked, attentionCount);
  animateNumber(dom.statCategories, primaryCategories.size);
  dom.navTotal.textContent = String(state.notes.length);
  dom.navFeatured.textContent = String(state.notes.filter((note) => note.featured).length);
  dom.navAttention.textContent = String(attentionCount);
  dom.navDraft.textContent = String(state.notes.filter((note) => note.status === "draft").length);
}

function renderSmartNav() {
  document.querySelectorAll("[data-smart-view]").forEach((button) => {
    const view = button.dataset.smartView;
    const active = (view === "all" && state.quickFilter === "all" && !state.featuredOnly && state.category === "all")
      || (view === "featured" && state.featuredOnly)
      || (view === state.quickFilter && ["attention", "draft"].includes(view));
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  dom.featuredButton.classList.toggle("is-active", state.featuredOnly);
  dom.featuredButton.setAttribute("aria-pressed", String(state.featuredOnly));
}

function renderQuickFilters() {
  document.querySelectorAll("[data-quick-filter]").forEach((button) => {
    const active = button.dataset.quickFilter === state.quickFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderFocusRow() {
  const continueNote = [...state.notes]
    .filter((note) => note.status === "published")
    .sort((a, b) => compareDateDesc(a.updatedAt, b.updatedAt))[0];
  const brokenCount = state.notes.filter((note) => note.linkStatus === "broken").length;
  const uncheckedCount = state.notes.filter((note) => note.linkStatus === "unchecked").length;
  const draftCount = state.notes.filter((note) => note.status === "draft").length;
  const attentionCount = state.notes.filter((note) => note.status === "draft" || note.linkStatus !== "healthy").length;

  dom.continueCard.innerHTML = continueNote ? `<div class="focus-card-copy"><span class="focus-label">最近更新</span><h2>${escapeHtml(continueNote.title)}</h2><p>${escapeHtml(continueNote.categoryPath.join(" · "))} · ${formatDate(continueNote.updatedAt)} · ${Number(continueNote.readingMinutes) || 10} 分钟</p></div><button class="focus-card-action" type="button" data-continue-note="${escapeAttr(continueNote.id)}">查看笔记 <span aria-hidden="true">→</span></button>` : "";
  dom.attentionCard.innerHTML = `<div class="attention-icon" aria-hidden="true">!</div><div><span class="focus-label">维护提醒</span><h2>${attentionCount} 项需要处理</h2><p>${brokenCount} 个异常链接 · ${uncheckedCount} 个待检查 · ${draftCount} 篇草稿</p></div><span class="attention-arrow" aria-hidden="true">→</span>`;
}

function renderCategoryTree() {
  const tree = buildCategoryTree(state.notes);
  dom.categoryCount.textContent = String(tree.size);
  let html = "";

  for (const [primary, entry] of tree) {
    const primaryActive = state.category === primary ? " is-active" : "";
    html += `<div class="category-group">
      <button class="category-row${primaryActive}" type="button" data-category="${escapeAttr(primary)}"><span>${escapeHtml(primary)}</span><b>${entry.count}</b></button>`;
    if (entry.children.size) {
      html += `<div class="subcategory-list">`;
      for (const [secondary, count] of entry.children) {
        const path = `${primary}/${secondary}`;
        const childActive = state.category === path ? " is-active" : "";
        html += `<button class="subcategory-row${childActive}" type="button" data-category="${escapeAttr(path)}"><span>${escapeHtml(secondary)}</span><b>${count}</b></button>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  dom.categoryTree.innerHTML = html;
}

function renderTagCloud() {
  const counts = new Map();
  state.notes.forEach((note) => note.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).slice(0, 14);
  dom.tagCloud.innerHTML = tags.map(([tag, count]) => {
    const active = state.tags.has(tag) ? " is-active" : "";
    return `<button class="tag-chip${active}" type="button" data-tag="${escapeAttr(tag)}" aria-pressed="${state.tags.has(tag)}">${escapeHtml(tag)} · ${count}</button>`;
  }).join("");
  dom.clearTags.hidden = state.tags.size === 0;
}

function renderLibrary() {
  const notes = getFilteredNotes();
  dom.resultCount.textContent = String(notes.length);
  dom.libraryHeading.textContent = getLibraryTitle();
  dom.notesGrid.innerHTML = notes.map(renderNoteCard).join("");
  dom.notesGrid.hidden = state.view === "map" || notes.length === 0;
  dom.knowledgeMap.hidden = state.view !== "map";
  dom.emptyState.hidden = state.view === "map" || notes.length !== 0;
  if (state.view === "map") renderKnowledgeMap();
  renderFilterSummary();
}

function getLibraryTitle() {
  if (state.featuredOnly) return "精选内容";
  if (state.quickFilter === "attention") return "需要处理";
  if (state.quickFilter === "draft") return "本地草稿";
  if (state.quickFilter === "published") return "已发布笔记";
  return state.category === "all" ? "全部学习笔记" : state.category.replace("/", " · ");
}

function renderNoteCard(note) {
  const color = CATEGORY_COLORS[note.categoryPath[0]] || "var(--accent)";
  const visibleTags = note.tags.slice(0, 3);
  const extraTags = note.tags.length - visibleTags.length;
  const metaDate = formatDate(note.updatedAt);
  return `<article class="note-card${note.featured ? " is-featured" : ""}" tabindex="0" role="button" aria-label="查看笔记：${escapeAttr(note.title)}" data-note-id="${escapeAttr(note.id)}" style="--category-color:${escapeAttr(color)}">
    <div class="card-kicker">
      <span class="category-path">${escapeHtml(note.categoryPath.join(" / "))}</span>
      <span class="featured-mark">◆ 精选</span>
    </div>
    <h3>${escapeHtml(note.title)}</h3>
    <p class="summary">${escapeHtml(note.summary)}</p>
    <div class="note-tags">${visibleTags.map((tag) => `<span class="note-tag">${escapeHtml(tag)}</span>`).join("")}${extraTags > 0 ? `<span class="note-tag">+${extraTags}</span>` : ""}</div>
    <footer class="card-footer">
      <div class="note-meta"><span>更新 ${metaDate}</span><span>约 ${Number(note.readingMinutes) || 10} 分钟阅读</span></div>
      <div class="status-row"><span class="status-pill ${escapeAttr(note.status)}">${STATUS_LABELS[note.status]}</span><span class="status-pill ${escapeAttr(note.linkStatus)}">${LINK_LABELS[note.linkStatus]}</span></div>
    </footer>
  </article>`;
}

function renderFilterSummary() {
  const labels = [];
  if (state.query) labels.push(`“${state.query}”`);
  if (state.category !== "all") labels.push(state.category.replace("/", " · "));
  if (state.tags.size) labels.push([...state.tags].join("、"));
  if (state.status !== "all") labels.push(STATUS_LABELS[state.status]);
  if (state.linkStatus !== "all") labels.push(LINK_LABELS[state.linkStatus]);
  if (state.featuredOnly) labels.push("精选");
  if (state.quickFilter === "attention") labels.push("需要处理");
  if (state.quickFilter === "draft") labels.push("草稿");
  if (state.quickFilter === "published") labels.push("已发布");
  const active = labels.length > 0;
  dom.filterSummary.classList.toggle("is-active", active);
  dom.filterSummary.querySelector("span").textContent = active ? `${labels.length} 项筛选：${labels.join(" · ")}` : "未启用筛选";
  dom.activeFilterRow.hidden = !active;
  dom.activeFilterRow.innerHTML = active ? `<span>当前：${labels.map(escapeHtml).join(" · ")}</span><button type="button" data-clear-active-filters>清除全部</button>` : "";
  const clearButton = dom.activeFilterRow.querySelector("[data-clear-active-filters]");
  if (clearButton) clearButton.addEventListener("click", clearFilters);
}

function renderDataMode() {
  dom.dataModeText.textContent = state.localMode ? "本地草稿目录" : "仓库目录";
  dom.resetDraftButton.hidden = !state.localMode;
}

function renderLoadError(error) {
  const isFileProtocol = location.protocol === "file:";
  dom.notesGrid.hidden = true;
  dom.emptyState.hidden = false;
  dom.emptyState.innerHTML = `<div aria-hidden="true">!</div><h3>目录数据未载入</h3><p>${isFileProtocol ? "浏览器阻止了本地 HTML 读取 JSON。请在此目录运行 python -m http.server 8000 后访问 http://localhost:8000。" : `请检查 data/notes.json：${escapeHtml(error.message)}`}</p><button class="button button-secondary" type="button" id="errorImportButton">导入 JSON 继续</button>`;
  document.getElementById("errorImportButton").addEventListener("click", () => dom.importInput.click());
  showToast("数据载入失败，已显示恢复方法");
}

function getFilteredNotes() {
  const filtered = state.notes.filter((note) => {
    const haystack = [note.title, note.summary, ...note.categoryPath, ...note.tags].join(" ").toLocaleLowerCase("zh-CN");
    const categoryPath = note.categoryPath.join("/");
    return (!state.query || haystack.includes(state.query))
      && (state.category === "all" || categoryPath === state.category || categoryPath.startsWith(`${state.category}/`))
      && ([...state.tags].every((tag) => note.tags.includes(tag)))
      && (state.status === "all" || note.status === state.status)
      && (state.linkStatus === "all" || note.linkStatus === state.linkStatus)
      && (state.quickFilter === "all"
        || (state.quickFilter === "published" && note.status === "published")
        || (state.quickFilter === "draft" && note.status === "draft")
        || (state.quickFilter === "attention" && (note.status === "draft" || note.linkStatus !== "healthy")))
      && (!state.featuredOnly || note.featured);
  });

  return filtered.sort((a, b) => {
    if (state.sort === "title-asc") return a.title.localeCompare(b.title, "zh-CN");
    if (state.sort === "published-desc") return compareDateDesc(a.publishedAt, b.publishedAt);
    if (state.sort === "reading-asc") return (Number(a.readingMinutes) || 0) - (Number(b.readingMinutes) || 0);
    return compareDateDesc(a.updatedAt, b.updatedAt);
  });
}

function openDetail(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return;
  const safeUrl = safeHref(note.url);
  const safeRepoUrl = note.repoUrl ? safeHref(note.repoUrl) : "";
  dom.detailContent.innerHTML = `<section class="detail-hero">
    <span class="category-path">${escapeHtml(note.categoryPath.join(" / "))}</span>
    <h2 id="detailTitle">${escapeHtml(note.title)}</h2>
    <p>${escapeHtml(note.summary)}</p>
    <div class="note-tags">${note.tags.map((tag) => `<span class="note-tag">${escapeHtml(tag)}</span>`).join("")}</div>
  </section>
  <section class="detail-body">
    <div class="detail-block"><h3>内容状态</h3><div class="status-row" style="justify-content:flex-start"><span class="status-pill ${escapeAttr(note.status)}">${STATUS_LABELS[note.status]}</span><span class="status-pill ${escapeAttr(note.linkStatus)}">${LINK_LABELS[note.linkStatus]}</span></div></div>
    <div class="detail-block"><h3>目录信息</h3><dl class="detail-facts"><div><dt>更新日期</dt><dd>${formatDate(note.updatedAt)}</dd></div><div><dt>发布日期</dt><dd>${note.publishedAt ? formatDate(note.publishedAt) : "—"}</dd></div><div><dt>阅读时长</dt><dd>${Number(note.readingMinutes) || 10} 分钟</dd></div><div><dt>稳定 ID</dt><dd>${escapeHtml(note.id)}</dd></div></dl></div>
  </section>
  <footer class="detail-actions">
    ${safeUrl ? `<a class="button button-primary" href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer">打开笔记 ↗</a>` : ""}
    ${safeRepoUrl ? `<a class="button button-secondary" href="${escapeAttr(safeRepoUrl)}" target="_blank" rel="noopener noreferrer">查看仓库 ↗</a>` : ""}
    <button class="button button-quiet" type="button" data-edit-note="${escapeAttr(note.id)}">编辑本地副本</button>
  </footer>`;
  dom.detailDialog.showModal();
}

function openEditor(noteId = "") {
  dom.noteForm.reset();
  dom.formError.textContent = "";
  const note = state.notes.find((item) => item.id === noteId);
  dom.editorTitle.textContent = note ? "编辑笔记" : "新建笔记";
  dom.noteOriginalId.value = note?.id || "";
  dom.noteId.value = note?.id || "";
  dom.noteTitle.value = note?.title || "";
  dom.noteSummary.value = note?.summary || "";
  dom.noteUrl.value = note?.url || "";
  dom.noteRepoUrl.value = note?.repoUrl || "";
  dom.noteCategory.value = note?.categoryPath.join(" / ") || "AI / 基础培训";
  dom.noteTags.value = note?.tags.join(", ") || "";
  dom.noteStatus.value = note?.status || "draft";
  dom.noteLinkStatus.value = note?.linkStatus || "unchecked";
  dom.noteMinutes.value = note?.readingMinutes || 10;
  dom.noteFeatured.checked = Boolean(note?.featured);
  dom.editorDialog.showModal();
  window.setTimeout(() => dom.noteTitle.focus(), 50);
}

function closeEditor() {
  dom.editorDialog.close();
  dom.formError.textContent = "";
}

function saveNoteFromForm(event) {
  event.preventDefault();
  if (!dom.noteForm.reportValidity()) return;
  const title = dom.noteTitle.value.trim();
  const id = (dom.noteId.value.trim() || slugify(title) || `note-${Date.now()}`).toLowerCase();
  const originalId = dom.noteOriginalId.value;
  const categoryPath = dom.noteCategory.value.split(/\s*[/＞>]\s*/).map((part) => part.trim()).filter(Boolean);
  const tags = [...new Set(dom.noteTags.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))];
  const url = dom.noteUrl.value.trim();
  const repoUrl = dom.noteRepoUrl.value.trim();

  const errors = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) errors.push("稳定 ID 只能包含小写字母、数字和短横线");
  if (state.notes.some((note) => note.id === id && note.id !== originalId)) errors.push("稳定 ID 已存在");
  if (categoryPath.length < 1 || categoryPath.length > 3) errors.push("分类路径必须为 1–3 层");
  if (!safeHref(url)) errors.push("页面 URL 只允许 http、https 或安全相对地址");
  if (repoUrl && !safeHref(repoUrl)) errors.push("仓库 URL 格式无效");
  if (errors.length) {
    dom.formError.textContent = errors.join("；");
    return;
  }

  const existing = state.notes.find((note) => note.id === originalId);
  const note = {
    id,
    title,
    summary: dom.noteSummary.value.trim(),
    url,
    categoryPath,
    tags,
    status: dom.noteStatus.value,
    linkStatus: dom.noteLinkStatus.value,
    updatedAt: todayIso(),
    readingMinutes: Number(dom.noteMinutes.value) || 10,
    featured: dom.noteFeatured.checked
  };
  if (repoUrl) note.repoUrl = repoUrl;
  if (existing?.publishedAt) note.publishedAt = existing.publishedAt;
  else if (note.status === "published") note.publishedAt = todayIso();

  if (existing) {
    state.notes = state.notes.map((item) => item.id === originalId ? note : item);
  } else {
    state.notes = [note, ...state.notes];
  }
  persistLocalPayload();
  closeEditor();
  renderAll();
  showToast(existing ? "笔记已保存到本机草稿" : "新笔记已加入本机草稿");
}

async function importJson(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const errors = validatePayload(payload);
    if (errors.length) throw new Error(errors.slice(0, 4).join("；"));
    state.notes = structuredCloneSafe(payload.notes);
    state.localMode = true;
    persistLocalPayload();
    clearFilters();
    renderAll();
    showToast(`已导入 ${state.notes.length} 篇笔记到本机草稿`);
  } catch (error) {
    showToast(`导入失败：${error.message}`);
  }
}

function exportJson() {
  if (!state.notes.length) {
    showToast("当前没有可导出的笔记");
    return;
  }
  const payload = {
    schemaVersion: "1.0.0",
    updatedAt: todayIso(),
    notes: state.notes
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `notes-${todayIso()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("JSON 已导出；审核后可通过 Git / PR 更新仓库");
}

function resetToRepositoryData() {
  if (!state.repositoryPayload) {
    showToast("仓库版本尚未载入");
    return;
  }
  const confirmed = window.confirm("恢复仓库版本会清除当前浏览器中的本地草稿。建议先导出 JSON 备份。确定继续吗？");
  if (!confirmed) return;
  removeStorage(STORAGE.data);
  state.notes = structuredCloneSafe(state.repositoryPayload.notes);
  state.localMode = false;
  clearFilters();
  renderAll();
  showToast("已恢复为仓库中的正式目录");
}

function clearFilters(shouldRender = true) {
  state.query = "";
  state.category = "all";
  state.tags.clear();
  state.status = "all";
  state.linkStatus = "all";
  state.quickFilter = "all";
  state.featuredOnly = false;
  dom.searchInput.value = "";
  dom.statusFilter.value = "all";
  dom.linkFilter.value = "all";
  dom.featuredButton.classList.remove("is-active");
  dom.featuredButton.setAttribute("aria-pressed", "false");
  if (shouldRender) {
    renderCategoryTree();
    renderTagCloud();
    renderQuickFilters();
    renderSmartNav();
    renderLibrary();
  }
}

function applyTheme(theme) {
  if (!THEME_COPY[theme]) theme = "atelier";
  document.body.dataset.theme = theme;
  writeStorage(STORAGE.theme, theme);
  dom.themeDescription.textContent = THEME_COPY[theme];
  document.querySelectorAll("[data-theme-value]").forEach((button) => {
    const active = button.dataset.themeValue === theme;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function applyView(view) {
  state.view = ["list", "grid", "map"].includes(view) ? view : "list";
  writeStorage(STORAGE.view, state.view);
  dom.notesGrid.classList.toggle("is-list", state.view === "list");
  dom.notesGrid.hidden = state.view === "map" || getFilteredNotes().length === 0;
  dom.knowledgeMap.hidden = state.view !== "map";
  dom.emptyState.hidden = state.view === "map" || getFilteredNotes().length !== 0;
  document.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === state.view)));
  if (state.view === "map") window.requestAnimationFrame(() => renderKnowledgeMap({ fit: true }));
}

function buildCategoryTree(notes) {
  const tree = new Map();
  for (const note of notes) {
    const [primary, secondary] = note.categoryPath;
    if (!tree.has(primary)) tree.set(primary, { count: 0, children: new Map() });
    const entry = tree.get(primary);
    entry.count += 1;
    if (secondary) entry.children.set(secondary, (entry.children.get(secondary) || 0) + 1);
  }
  return new Map([...tree.entries()].sort((a, b) => {
    if (a[0] === "AI") return -1;
    if (b[0] === "AI") return 1;
    return a[0].localeCompare(b[0], "zh-CN");
  }));
}

function validatePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.notes)) return ["根对象必须包含 notes 数组"];
  const ids = new Set();
  payload.notes.forEach((note, index) => {
    const prefix = `notes[${index}]`;
    if (!note || typeof note !== "object") {
      errors.push(`${prefix} 必须是对象`);
      return;
    }
    ["id", "title", "summary", "url", "categoryPath", "tags", "status", "linkStatus", "updatedAt"].forEach((key) => {
      if (!(key in note)) errors.push(`${prefix} 缺少 ${key}`);
    });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(note.id || "")) errors.push(`${prefix}.id 无效`);
    if (ids.has(note.id)) errors.push(`${prefix}.id 重复`);
    ids.add(note.id);
    if (!safeHref(note.url || "")) errors.push(`${prefix}.url 无效`);
    if (!Array.isArray(note.categoryPath) || note.categoryPath.length < 1 || note.categoryPath.length > 3 || note.categoryPath.some((item) => typeof item !== "string" || !item.trim())) errors.push(`${prefix}.categoryPath 无效`);
    if (!Array.isArray(note.tags) || note.tags.some((tag) => typeof tag !== "string")) errors.push(`${prefix}.tags 无效`);
    if (!Object.hasOwn(STATUS_LABELS, note.status)) errors.push(`${prefix}.status 无效`);
    if (!Object.hasOwn(LINK_LABELS, note.linkStatus)) errors.push(`${prefix}.linkStatus 无效`);
  });
  return errors;
}

function validateProjectPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.projects)) return ["项目索引必须包含 projects 数组"];
  const errors = [];
  payload.projects.forEach((project, index) => {
    if (!project || typeof project !== "object") {
      errors.push(`projects[${index}] 必须是对象`);
      return;
    }
    ["name", "fullName", "repoUrl", "hasPages", "fork", "commitCount", "updatedAt"].forEach((key) => {
      if (!(key in project)) errors.push(`projects[${index}] 缺少 ${key}`);
    });
    if (!safeHref(project.repoUrl || "")) errors.push(`projects[${index}].repoUrl 无效`);
    if (project.pagesUrl && !safeHref(project.pagesUrl)) errors.push(`projects[${index}].pagesUrl 无效`);
    if (project.hasPages) {
      const expectedPagesUrl = deriveProjectPagesUrl(project, payload.owner);
      if (!expectedPagesUrl) errors.push(`projects[${index}] 无法生成 Pages 地址`);
      if (project.pagesUrl !== expectedPagesUrl) errors.push(`projects[${index}].pagesUrl 必须与仓库名对应`);
    }
  });
  if (!Array.isArray(payload.starred)) errors.push("项目索引缺少 starred 数组");
  return errors;
}

function validateProjectGuidesPayload(payload) {
  if (!payload || typeof payload !== "object" || !payload.projects || typeof payload.projects !== "object") return ["项目介绍必须包含 projects 对象"];
  const errors = [];
  Object.entries(payload.projects).forEach(([name, guide]) => {
    const prefix = `projects.${name}`;
    if (!guide || typeof guide !== "object") {
      errors.push(`${prefix} 必须是对象`);
      return;
    }
    ["intro", "audience", "readmeGuide"].forEach((key) => {
      if (!(key in guide)) errors.push(`${prefix} 缺少 ${key}`);
    });
    if (typeof guide.intro !== "string" || !guide.intro.trim()) errors.push(`${prefix}.intro 无效`);
    if (typeof guide.audience !== "string" || !guide.audience.trim()) errors.push(`${prefix}.audience 无效`);
    if (!Array.isArray(guide.capabilities) || guide.capabilities.some((item) => typeof item !== "string" || !item.trim())) errors.push(`${prefix}.capabilities 无效`);
    if (!Array.isArray(guide.readmeGuide) || guide.readmeGuide.length < 1) {
      errors.push(`${prefix}.readmeGuide 无效`);
      return;
    }
    guide.readmeGuide.forEach((item, index) => {
      if (!item || typeof item !== "object" || !item.label || !item.detail || !safeHref(item.url || "")) errors.push(`${prefix}.readmeGuide[${index}] 无效`);
    });
  });
  return errors;
}

function safeHref(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const trimmed = value.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return "";
  return trimmed;
}

function slugify(value) {
  return value.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function persistLocalPayload() {
  const payload = { schemaVersion: "1.0.0", updatedAt: todayIso(), notes: state.notes };
  try {
    localStorage.setItem(STORAGE.data, JSON.stringify(payload));
    state.localMode = true;
  } catch {
    showToast("浏览器未允许保存本地草稿，请立即导出 JSON");
  }
}

function readLocalPayload() {
  const raw = readStorage(STORAGE.data);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    return validatePayload(payload).length ? null : payload;
  } catch {
    return null;
  }
}

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 无痕模式下保持当前会话可用 */ }
}

function removeStorage(key) {
  try { localStorage.removeItem(key); } catch { /* 无本地存储时无需处理 */ }
}

function isDrawerSidebar() {
  return window.matchMedia("(max-width: 960px)").matches;
}

function syncSidebarControls() {
  const drawerOpen = document.body.classList.contains("sidebar-open");
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  const expanded = isDrawerSidebar() ? drawerOpen : !collapsed;
  dom.openSidebar.setAttribute("aria-expanded", String(expanded));
  dom.openSidebar.setAttribute("aria-label", expanded ? "收起分类导航" : "打开分类导航");
  dom.collapseSidebar.setAttribute("aria-label", isDrawerSidebar() ? "关闭分类导航" : "收起分类导航");
  dom.collapseSidebar.title = isDrawerSidebar() ? "关闭分类导航" : "收起分类导航";
}

function restoreSidebarState() {
  if (isDrawerSidebar()) {
    document.body.classList.remove("sidebar-open");
  } else {
    document.body.classList.toggle("sidebar-collapsed", readStorage(STORAGE.sidebar) === "collapsed");
  }
  syncSidebarControls();
}

function toggleSidebar() {
  if (isDrawerSidebar()) {
    const shouldOpen = !document.body.classList.contains("sidebar-open");
    document.body.classList.toggle("sidebar-open", shouldOpen);
    syncSidebarControls();
    if (shouldOpen) window.setTimeout(() => dom.closeSidebar.focus(), 20);
    return;
  }
  const shouldCollapse = !document.body.classList.contains("sidebar-collapsed");
  document.body.classList.toggle("sidebar-collapsed", shouldCollapse);
  writeStorage(STORAGE.sidebar, shouldCollapse ? "collapsed" : "expanded");
  syncSidebarControls();
}

function collapseSidebar() {
  if (isDrawerSidebar()) {
    closeSidebar({ restoreFocus: true });
    return;
  }
  document.body.classList.add("sidebar-collapsed");
  writeStorage(STORAGE.sidebar, "collapsed");
  syncSidebarControls();
  dom.openSidebar.focus();
}

function closeSidebar({ restoreFocus = false } = {}) {
  document.body.classList.remove("sidebar-open");
  syncSidebarControls();
  if (restoreFocus) dom.openSidebar.focus();
}

function handleSidebarResize() {
  if (!isDrawerSidebar()) document.body.classList.remove("sidebar-open");
  syncSidebarControls();
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => dom.toast.classList.remove("is-visible"), 3200);
}

function animateNumber(element, target) {
  element.textContent = String(target);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatTimestampDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function compareDateDesc(a, b) {
  return String(b || "").localeCompare(String(a || ""));
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function structuredCloneSafe(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
