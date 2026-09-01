"use strict";

const PROJECT_MAP_KIND_LABELS = {
  account: "GitHub 账号",
  repository: "公开仓库",
  language: "主要语言",
  upstream: "Fork 上游",
  capability: "项目能力"
};

const projectMapState = {
  nodes: [],
  edges: [],
  positions: new Map(),
  matchIds: new Set(),
  selectedId: "",
  query: "",
  pointer: null,
  scale: 1,
  tx: 0,
  ty: 0,
  effectsFrame: 0
};

function initializeProjectMapEvents() {
  dom.projectMapSearch.addEventListener("input", () => renderProjectMap({ fit: true }));
  dom.projectMapSearch.addEventListener("keydown", handleProjectMapSearchKeydown);
  dom.projectMapScope.addEventListener("change", () => renderProjectMap({ fit: true, reset: true }));
  dom.projectMapFit.addEventListener("click", fitProjectMap);
  dom.projectMapReset.addEventListener("click", resetProjectMapLayout);
  dom.projectMapGraph.addEventListener("pointerdown", beginProjectMapPan);
  dom.projectMapGraph.addEventListener("pointermove", moveProjectMapPointer);
  dom.projectMapGraph.addEventListener("pointerup", endProjectMapPointer);
  dom.projectMapGraph.addEventListener("pointercancel", endProjectMapPointer);
  dom.projectMapGraph.addEventListener("wheel", zoomProjectMap, { passive: false });
  dom.projectMapNodeList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project-map-node-id]");
    if (button) focusProjectMapNode(button.dataset.projectMapNodeId);
  });
}

function renderProjectMap({ fit = false, reset = false } = {}) {
  if (!dom.projectRelationMap || dom.projectRelationMap.hidden || !state.projectPayload) return;
  const scope = dom.projectMapScope.value;
  const graph = buildProjectMapGraph(scope);
  const query = normalizeProjectMapSearch(dom.projectMapSearch.value);
  const matchIds = query ? findProjectMapMatches(graph.nodes, graph.edges, query) : new Set();
  const contextIds = new Set(matchIds);
  if (query) {
    graph.edges.forEach((edge) => {
      if (matchIds.has(edge.source) || matchIds.has(edge.target)) {
        contextIds.add(edge.source);
        contextIds.add(edge.target);
      }
    });
  }
  const nodes = query ? graph.nodes.filter((node) => contextIds.has(node.id)) : graph.nodes;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  projectMapState.nodes = nodes;
  projectMapState.edges = edges;
  projectMapState.matchIds = matchIds;
  projectMapState.query = query;
  if (!nodeIds.has(projectMapState.selectedId)) projectMapState.selectedId = "";

  const repositoryCount = nodes.filter((node) => node.kind === "repository").length;
  const explicitCount = edges.filter((edge) => edge.origin === "explicit").length;
  dom.projectResultCount.textContent = String(repositoryCount);
  dom.projectMapVisibleCount.textContent = String(nodes.length);
  dom.projectMapSummary.textContent = `${repositoryCount} 个项目 · ${nodes.length} 个节点 · ${edges.length} 条关系 · ${explicitCount} 条人工确认关系`;
  dom.projectMapStatus.textContent = projectMapStatusCopy(query, matchIds.size);
  dom.projectMapEmpty.hidden = nodes.length > 0;

  initializeProjectMapPositions(nodes, reset);
  buildProjectMapSvg(nodes, edges);
  renderProjectMapNodeList();
  renderProjectMapDetail();
  applyProjectMapTransform();
  updateProjectMapPositions();
  updateProjectMapEdgeFocus();
  startProjectMapEffects();
  if ((fit || query) && nodes.length) {
    window.requestAnimationFrame(() => {
      fitProjectMap();
      if (!query && window.matchMedia("(max-width: 720px)").matches) focusProjectMapHub();
    });
  }
}

function buildProjectMapGraph(scope) {
  const nodes = new Map();
  const edges = new Map();
  const owner = state.projectPayload?.owner || "GitHub";
  const accountId = `account:${owner.toLocaleLowerCase("en-US")}`;
  const addNode = (node) => { if (!nodes.has(node.id)) nodes.set(node.id, node); };
  const addEdge = (edge) => {
    if (edge.source !== edge.target && !edges.has(edge.id)) edges.set(edge.id, edge);
  };

  addNode({ id: accountId, kind: "account", label: owner, description: "当前公开索引所属的 GitHub 账号。", sourceType: "actions" });
  const selected = projectMapRepositoriesForScope(scope);
  selected.forEach(({ project, subtype }) => {
    const fullName = project.fullName || `${owner}/${project.name}`;
    const repositoryId = projectMapRepositoryId(fullName);
    const relation = subtype === "owned" ? "自建" : (subtype === "fork" ? "Fork" : "Star");
    addNode({
      id: repositoryId,
      kind: "repository",
      subtype,
      label: project.name,
      fullName,
      description: projectDescription(project, subtype === "starred"),
      url: safeHref(project.repoUrl),
      pagesUrl: subtype === "starred" ? "" : deriveProjectPagesUrl(project, owner),
      language: project.language || "",
      sourceType: "actions"
    });
    addEdge({ id: `account:${subtype}:${repositoryId}`, source: accountId, target: repositoryId, label: relation, origin: "derived" });

    if (project.language) {
      const languageId = `language:${project.language.toLocaleLowerCase("en-US")}`;
      addNode({ id: languageId, kind: "language", label: project.language, description: "GitHub 识别的仓库主要语言。", sourceType: "github-field" });
      addEdge({ id: `language:${repositoryId}:${languageId}`, source: repositoryId, target: languageId, label: "主要语言", origin: "derived" });
    }
    if (project.hasPages && subtype !== "starred") {
      const pagesId = "capability:github-pages";
      addNode({ id: pagesId, kind: "capability", label: "GitHub Pages", description: "该仓库已启用 GitHub Pages。", sourceType: "github-field" });
      addEdge({ id: `pages:${repositoryId}`, source: repositoryId, target: pagesId, label: "已部署", origin: "derived" });
    }
    if (project.upstream?.fullName) {
      const upstreamId = `upstream:${project.upstream.fullName.toLocaleLowerCase("en-US")}`;
      addNode({
        id: upstreamId,
        kind: "upstream",
        label: project.upstream.fullName,
        description: "GitHub 返回的 Fork 上游仓库。",
        url: safeHref(project.upstream.repoUrl),
        sourceType: "github-field"
      });
      addEdge({ id: `upstream:${repositoryId}:${upstreamId}`, source: repositoryId, target: upstreamId, label: "Fork 自", origin: "derived" });
    }
  });

  const projectByName = new Map(state.projects.map((project) => [project.name, project]));
  state.relations.filter((relation) => relation.sourceType === "project" && relation.targetType === "project").forEach((relation) => {
    const sourceProject = projectByName.get(relation.sourceId);
    const targetProject = projectByName.get(relation.targetId);
    if (!sourceProject || !targetProject) return;
    const source = projectMapRepositoryId(sourceProject.fullName);
    const target = projectMapRepositoryId(targetProject.fullName);
    if (!nodes.has(source) || !nodes.has(target)) return;
    addEdge({ id: `explicit:${relation.id}`, source, target, label: relation.relation, origin: "explicit" });
  });

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function projectMapRepositoriesForScope(scope) {
  if (scope === "owned") return state.projects.filter((project) => !project.fork).map((project) => ({ project, subtype: "owned" }));
  if (scope === "forks") return state.projects.filter((project) => project.fork).map((project) => ({ project, subtype: "fork" }));
  if (scope === "starred") return state.starredProjects.map((project) => ({ project, subtype: "starred" }));
  const repositories = new Map();
  state.projects.forEach((project) => repositories.set(project.fullName.toLocaleLowerCase("en-US"), { project, subtype: project.fork ? "fork" : "owned" }));
  state.starredProjects.forEach((project) => {
    const key = project.fullName.toLocaleLowerCase("en-US");
    if (!repositories.has(key)) repositories.set(key, { project, subtype: "starred" });
  });
  return [...repositories.values()];
}

function projectMapRepositoryId(fullName) {
  return `repository:${String(fullName || "").toLocaleLowerCase("en-US")}`;
}

function normalizeProjectMapSearch(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function findProjectMapMatches(nodes, edges, query) {
  const matches = new Set();
  nodes.forEach((node) => {
    const corpus = [node.label, node.fullName, node.description, node.language, node.subtype, PROJECT_MAP_KIND_LABELS[node.kind]]
      .filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    if (corpus.includes(query)) matches.add(node.id);
  });
  edges.forEach((edge) => {
    if (edge.label.toLocaleLowerCase("zh-CN").includes(query)) {
      matches.add(edge.source);
      matches.add(edge.target);
    }
  });
  return matches;
}

function projectMapStatusCopy(query, matchCount) {
  if (query) return matchCount
    ? `匹配 ${matchCount} 个节点，并保留一跳相邻关系；按 Enter 定位首个结果。`
    : "没有匹配节点，可以缩短关键词或切换探索范围。";
  const generatedAt = state.projectPayload?.generatedAt;
  const time = generatedAt ? formatTimestampDate(generatedAt) : "最近一次 Actions";
  const mobileHint = window.matchMedia("(max-width: 720px)").matches ? "拖动画布或使用下方节点列表探索。" : "选择节点查看字段来源。";
  return `关系来自 ${time} 生成的公开索引；${mobileHint}`;
}

function handleProjectMapSearchKeydown(event) {
  if (event.key === "Escape" && event.currentTarget.value) {
    event.currentTarget.value = "";
    renderProjectMap({ fit: true });
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  const firstMatch = projectMapState.matchIds.values().next().value;
  if (firstMatch) focusProjectMapNode(firstMatch);
}

function initializeProjectMapPositions(nodes, reset = false) {
  if (reset) projectMapState.positions = new Map();
  const groups = new Map();
  nodes.forEach((node) => {
    const group = node.kind === "repository" ? `repository:${node.subtype}` : node.kind;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(node);
  });
  const orbits = {
    account: [0, 0],
    capability: [110, 65],
    language: [175, 100],
    "repository:owned": [300, 180],
    "repository:fork": [315, 195],
    "repository:starred": [375, 225],
    upstream: [430, 245]
  };
  groups.forEach((groupNodes, groupName) => {
    const [radiusX, radiusY] = orbits[groupName] || [340, 205];
    groupNodes.slice().sort((first, second) => first.label.localeCompare(second.label, "zh-CN")).forEach((node, index) => {
      if (projectMapState.positions.has(node.id)) return;
      if (groupName === "account") {
        projectMapState.positions.set(node.id, { x: 480, y: 280 });
        return;
      }
      const offset = projectMapHash(node.id) % 23;
      const angle = ((index + (offset / 23)) / Math.max(1, groupNodes.length)) * Math.PI * 2 - (Math.PI / 2);
      projectMapState.positions.set(node.id, { x: 480 + Math.cos(angle) * radiusX, y: 280 + Math.sin(angle) * radiusY });
    });
  });
}

function projectMapHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function buildProjectMapSvg(nodes, edges) {
  const namespace = "http://www.w3.org/2000/svg";
  dom.projectMapEdges.replaceChildren();
  dom.projectMapNodes.replaceChildren();
  edges.forEach((edge) => {
    const line = document.createElementNS(namespace, "line");
    line.classList.add("project-map-edge", edge.origin);
    line.classList.toggle("structural", ["自建", "Fork", "Star"].includes(edge.label));
    line.dataset.edgeId = edge.id;
    const related = projectMapState.query && (projectMapState.matchIds.has(edge.source) || projectMapState.matchIds.has(edge.target));
    line.classList.toggle("search-related", Boolean(related));
    line.classList.toggle("search-context", Boolean(projectMapState.query && !related));
    const title = document.createElementNS(namespace, "title");
    title.textContent = `${edge.label} · ${edge.origin === "explicit" ? "人工确认" : "索引字段"}`;
    line.append(title);
    dom.projectMapEdges.append(line);
  });
  nodes.forEach((node) => {
    const group = document.createElementNS(namespace, "g");
    group.classList.add("project-map-node");
    group.classList.toggle("search-match", projectMapState.matchIds.has(node.id));
    group.classList.toggle("search-context", Boolean(projectMapState.query && !projectMapState.matchIds.has(node.id)));
    group.dataset.projectMapNodeId = node.id;
    group.dataset.projectMapKind = node.kind;
    group.style.setProperty("--float-delay", `${(node.id.length * 41) % 1800}ms`);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `${node.label}，${PROJECT_MAP_KIND_LABELS[node.kind]}节点`);
    const title = document.createElementNS(namespace, "title");
    title.textContent = node.label;
    const hitArea = document.createElementNS(namespace, "circle");
    hitArea.classList.add("project-map-node-hit-area");
    hitArea.setAttribute("r", "30");
    const shape = projectMapNodeShape(node.kind);
    shape.classList.add("project-map-node-shape");
    const nodeColor = PROJECT_MAP_COLORS[node.kind] || "#64748b";
    shape.setAttribute("fill", nodeColor);
    shape.setAttribute("fill-opacity", "0.16");
    shape.setAttribute("stroke", nodeColor);
    shape.setAttribute("stroke-width", "1.7");
    shape.style.setProperty("fill", nodeColor, "important");
    shape.style.setProperty("fill-opacity", "0.16", "important");
    shape.style.setProperty("stroke", nodeColor, "important");
    const label = document.createElementNS(namespace, "text");
    label.classList.add("project-map-node-label");
    label.setAttribute("y", "33");
    label.textContent = truncateProjectMapLabel(node.label, node.kind === "repository" ? 13 : 16);
    group.append(title, hitArea, shape, label);
    group.addEventListener("pointerdown", beginProjectMapNodeDrag);
    group.addEventListener("click", () => selectProjectMapNode(node.id));
    group.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      selectProjectMapNode(node.id);
    });
    dom.projectMapNodes.append(group);
  });
}

const PROJECT_MAP_COLORS = {
  account: "#2563eb",
  repository: "#64748b",
  language: "#3b82f6",
  upstream: "#ea580c",
  capability: "#16a34a"
};

function projectMapNodeShape(kind) {
  const namespace = "http://www.w3.org/2000/svg";
  if (kind === "repository") {
    const rectangle = document.createElementNS(namespace, "rect");
    rectangle.setAttribute("x", "-19"); rectangle.setAttribute("y", "-19");
    rectangle.setAttribute("width", "38"); rectangle.setAttribute("height", "38"); rectangle.setAttribute("rx", "7");
    return rectangle;
  }
  if (kind === "account" || kind === "upstream") {
    const polygon = document.createElementNS(namespace, "polygon");
    polygon.setAttribute("points", kind === "account" ? "-22,-13 0,-25 22,-13 22,13 0,25 -22,13" : "0,-20 20,0 0,20 -20,0");
    return polygon;
  }
  const circle = document.createElementNS(namespace, "circle");
  circle.setAttribute("r", kind === "capability" ? "18" : "16");
  return circle;
}

function truncateProjectMapLabel(value, limit) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function updateProjectMapPositions() {
  dom.projectMapEdges.querySelectorAll(".project-map-edge").forEach((line, index) => {
    const edge = projectMapState.edges[index];
    const source = projectMapState.positions.get(edge?.source);
    const target = projectMapState.positions.get(edge?.target);
    if (!source || !target) return;
    line.setAttribute("x1", source.x); line.setAttribute("y1", source.y);
    line.setAttribute("x2", target.x); line.setAttribute("y2", target.y);
  });
  dom.projectMapNodes.querySelectorAll(".project-map-node").forEach((group) => {
    const point = projectMapState.positions.get(group.dataset.projectMapNodeId);
    if (point) group.setAttribute("transform", `translate(${point.x} ${point.y})`);
  });
}

function updateProjectMapEdgeFocus() {
  dom.projectMapEdges.querySelectorAll(".project-map-edge").forEach((line, index) => {
    const edge = projectMapState.edges[index];
    const connected = Boolean(projectMapState.selectedId) && (edge?.source === projectMapState.selectedId || edge?.target === projectMapState.selectedId);
    line.classList.toggle("is-connected", connected);
  });
}

function startProjectMapEffects() {
  if (projectMapState.effectsFrame || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = dom.projectMapEffects;
  if (!canvas) return;
  const draw = (timestamp) => {
    projectMapState.effectsFrame = 0;
    if (dom.projectRelationMap.hidden) return;
    drawProjectMapEffects(canvas, timestamp);
    projectMapState.effectsFrame = requestAnimationFrame(draw);
  };
  projectMapState.effectsFrame = requestAnimationFrame(draw);
}

function drawProjectMapEffects(canvas, timestamp) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  const highlighted = projectMapState.edges.filter((edge) => edge.origin === "explicit" || (projectMapState.selectedId && (edge.source === projectMapState.selectedId || edge.target === projectMapState.selectedId)));
  highlighted.forEach((edge, index) => {
    const source = projectMapState.positions.get(edge.source);
    const target = projectMapState.positions.get(edge.target);
    if (!source || !target) return;
    const from = projectMapCanvasPoint(source, rect);
    const to = projectMapCanvasPoint(target, rect);
    const progress = ((timestamp / 2600) + index * .31) % 1;
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress;
    context.beginPath();
    context.fillStyle = edge.origin === "explicit" ? "rgba(37, 99, 235, .95)" : "rgba(22, 163, 74, .86)";
    context.arc(x, y, 3.2, 0, Math.PI * 2);
    context.fill();
  });
}

function projectMapCanvasPoint(point, rect) {
  return {
    x: ((point.x * projectMapState.scale) + projectMapState.tx) / 960 * rect.width,
    y: ((point.y * projectMapState.scale) + projectMapState.ty) / 560 * rect.height
  };
}

function beginProjectMapNodeDrag(event) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const id = event.currentTarget.dataset.projectMapNodeId;
  selectProjectMapNode(id);
  projectMapState.pointer = { type: "node", id };
  dom.projectMapGraph.setPointerCapture(event.pointerId);
  dom.projectMapGraph.classList.add("dragging-node");
}

function beginProjectMapPan(event) {
  if (event.button !== 0 || event.target.closest(".project-map-node")) return;
  projectMapState.pointer = { type: "pan", x: event.clientX, y: event.clientY, tx: projectMapState.tx, ty: projectMapState.ty };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add("panning");
}

function moveProjectMapPointer(event) {
  if (!projectMapState.pointer) return;
  if (projectMapState.pointer.type === "node") {
    const point = projectMapPoint(event);
    projectMapState.positions.set(projectMapState.pointer.id, point);
    updateProjectMapPositions();
    return;
  }
  const rectangle = dom.projectMapGraph.getBoundingClientRect();
  projectMapState.tx = projectMapState.pointer.tx + ((event.clientX - projectMapState.pointer.x) / rectangle.width) * 960;
  projectMapState.ty = projectMapState.pointer.ty + ((event.clientY - projectMapState.pointer.y) / rectangle.height) * 560;
  applyProjectMapTransform();
}

function endProjectMapPointer() {
  projectMapState.pointer = null;
  dom.projectMapGraph.classList.remove("dragging-node", "panning");
}

function projectMapPoint(event) {
  const rectangle = dom.projectMapGraph.getBoundingClientRect();
  const x = ((event.clientX - rectangle.left) / rectangle.width) * 960;
  const y = ((event.clientY - rectangle.top) / rectangle.height) * 560;
  return { x: (x - projectMapState.tx) / projectMapState.scale, y: (y - projectMapState.ty) / projectMapState.scale };
}

function zoomProjectMap(event) {
  event.preventDefault();
  const before = projectMapPoint(event);
  projectMapState.scale = Math.max(.35, Math.min(3.2, projectMapState.scale * (event.deltaY < 0 ? 1.12 : .89)));
  const rectangle = dom.projectMapGraph.getBoundingClientRect();
  const svgX = ((event.clientX - rectangle.left) / rectangle.width) * 960;
  const svgY = ((event.clientY - rectangle.top) / rectangle.height) * 560;
  projectMapState.tx = svgX - before.x * projectMapState.scale;
  projectMapState.ty = svgY - before.y * projectMapState.scale;
  applyProjectMapTransform();
}

function applyProjectMapTransform() {
  dom.projectMapViewport.setAttribute("transform", `translate(${projectMapState.tx} ${projectMapState.ty}) scale(${projectMapState.scale})`);
}

function fitProjectMap() {
  const points = projectMapState.nodes.map((node) => projectMapState.positions.get(node.id)).filter(Boolean);
  if (!points.length) return;
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 60; const maxX = Math.max(...xs) + 60;
  const minY = Math.min(...ys) - 55; const maxY = Math.max(...ys) + 55;
  projectMapState.scale = Math.max(.35, Math.min(1.8, Math.min(900 / Math.max(1, maxX - minX), 500 / Math.max(1, maxY - minY))));
  projectMapState.tx = 480 - ((minX + maxX) / 2) * projectMapState.scale;
  projectMapState.ty = 280 - ((minY + maxY) / 2) * projectMapState.scale;
  applyProjectMapTransform();
}

function resetProjectMapLayout() {
  initializeProjectMapPositions(projectMapState.nodes, true);
  projectMapState.scale = 1; projectMapState.tx = 0; projectMapState.ty = 0;
  updateProjectMapPositions();
  fitProjectMap();
  if (window.matchMedia("(max-width: 720px)").matches) window.requestAnimationFrame(focusProjectMapHub);
}

function focusProjectMapHub() {
  const hub = projectMapState.nodes.find((node) => node.kind === "account") || projectMapState.nodes[0];
  const point = projectMapState.positions.get(hub?.id);
  if (!point) return;
  projectMapState.scale = 2.35;
  projectMapState.tx = 480 - point.x * projectMapState.scale;
  projectMapState.ty = 280 - point.y * projectMapState.scale;
  applyProjectMapTransform();
}

function selectProjectMapNode(id) {
  projectMapState.selectedId = id;
  dom.projectMapNodes.querySelectorAll(".project-map-node").forEach((node) => node.classList.toggle("selected", node.dataset.projectMapNodeId === id));
  dom.projectMapNodeList.querySelectorAll("[data-project-map-node-id]").forEach((button) => button.classList.toggle("is-active", button.dataset.projectMapNodeId === id));
  updateProjectMapEdgeFocus();
  renderProjectMapDetail();
}

function focusProjectMapNode(id) {
  const point = projectMapState.positions.get(id);
  if (!point) return;
  selectProjectMapNode(id);
  projectMapState.scale = Math.max(projectMapState.scale, 1.25);
  projectMapState.tx = 480 - point.x * projectMapState.scale;
  projectMapState.ty = 280 - point.y * projectMapState.scale;
  applyProjectMapTransform();
  dom.projectMapNodes.querySelector(`[data-project-map-node-id="${CSS.escape(id)}"]`)?.focus();
}

function renderProjectMapNodeList() {
  dom.projectMapNodeList.innerHTML = projectMapState.nodes.slice()
    .sort((first, second) => first.kind.localeCompare(second.kind) || first.label.localeCompare(second.label, "zh-CN"))
    .map((node) => `<button type="button" role="listitem" data-project-map-node-id="${escapeAttr(node.id)}"><span>${escapeHtml(node.label)}</span><small>${escapeHtml(PROJECT_MAP_KIND_LABELS[node.kind])}</small></button>`)
    .join("");
}

function renderProjectMapDetail() {
  const node = projectMapState.nodes.find((item) => item.id === projectMapState.selectedId);
  if (!node) {
    dom.projectMapDetail.innerHTML = "选择节点，查看仓库、技术栈、Pages、Fork 上游或人工确认关系。";
    return;
  }
  const related = projectMapState.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const relations = related.map((edge) => {
    const neighborId = edge.source === node.id ? edge.target : edge.source;
    const neighbor = projectMapState.nodes.find((item) => item.id === neighborId);
    if (!neighbor) return "";
    return `<li><button type="button" data-project-map-node-id="${escapeAttr(neighbor.id)}">${escapeHtml(neighbor.label)}</button><span>${escapeHtml(edge.label)} · ${edge.origin === "explicit" ? "人工确认" : "索引字段"}</span></li>`;
  }).join("");
  const link = node.url ? `<a href="${escapeAttr(node.url)}" target="_blank" rel="noopener noreferrer">打开 GitHub ↗</a>` : "";
  const pages = node.pagesUrl ? `<a href="${escapeAttr(node.pagesUrl)}" target="_blank" rel="noopener noreferrer">打开 Pages ↗</a>` : "";
  dom.projectMapDetail.innerHTML = `<span class="map-detail-kind">${escapeHtml(PROJECT_MAP_KIND_LABELS[node.kind])}</span>
    <h5>${escapeHtml(node.label)}</h5>
    ${node.fullName ? `<small>${escapeHtml(node.fullName)}</small>` : ""}
    <p>${escapeHtml(node.description || "该节点来自公开项目索引。")}</p>
    <strong>相关关系 · ${related.length}</strong>
    <ul>${relations || "<li><span>当前没有相邻关系</span></li>"}</ul>
    <div class="project-map-detail-actions">${link}${pages}</div>`;
  dom.projectMapDetail.querySelectorAll("[data-project-map-node-id]").forEach((button) => button.addEventListener("click", () => focusProjectMapNode(button.dataset.projectMapNodeId)));
}
