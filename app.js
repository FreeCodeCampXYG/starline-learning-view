"use strict";

const STORAGE = {
  data: "starline-note-library-data-v1",
  theme: "starline-note-library-theme-v1",
  view: "starline-note-library-view-v2"
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
  query: "",
  category: "all",
  tags: new Set(),
  status: "all",
  linkStatus: "all",
  quickFilter: "all",
  sort: "updated-desc",
  featuredOnly: false,
  view: readStorage(STORAGE.view) || "list",
  localMode: false
};

const dom = {};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  cacheDom();
  bindEvents();
  const requestedTheme = new URLSearchParams(location.search).get("theme");
  applyTheme(THEME_COPY[requestedTheme] ? requestedTheme : (readStorage(STORAGE.theme) || "atelier"));
  applyView(state.view === "list" ? "list" : "grid");

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
    "themeDescription", "openSidebar", "closeSidebar", "sidebarScrim", "newNoteButton",
    "appearanceButton", "appearanceSidebarButton", "appearanceDialog", "closeAppearance", "continueCard", "attentionCard",
    "navTotal", "navFeatured", "navAttention", "navDraft", "activeFilterRow",
    "detailDialog", "detailContent", "closeDetail", "editorDialog", "closeEditor",
    "cancelEditor", "noteForm", "editorTitle", "noteOriginalId", "noteId", "noteTitle",
    "noteSummary", "noteUrl", "noteRepoUrl", "noteCategory", "noteTags", "noteStatus",
    "noteLinkStatus", "noteMinutes", "noteFeatured", "formError", "importButton",
    "exportButton", "importInput", "resetDraftButton", "toast"
  ].forEach((id) => { dom[id] = document.getElementById(id); });
}

function bindEvents() {
  dom.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLocaleLowerCase("zh-CN");
    renderLibrary();
  });
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

  dom.openSidebar.addEventListener("click", () => document.body.classList.add("sidebar-open"));
  dom.closeSidebar.addEventListener("click", closeSidebar);
  dom.sidebarScrim.addEventListener("click", closeSidebar);
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
    if (event.key === "Escape") closeSidebar();
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
  renderDataMode();
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
  dom.notesGrid.hidden = notes.length === 0;
  dom.emptyState.hidden = notes.length !== 0;
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
  state.view = view === "list" ? "list" : "grid";
  writeStorage(STORAGE.view, state.view);
  dom.notesGrid.classList.toggle("is-list", state.view === "list");
  document.querySelectorAll("[data-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === state.view)));
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

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
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
