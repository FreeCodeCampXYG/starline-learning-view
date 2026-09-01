"use strict";

const KNOWLEDGE_MAP_KIND_LABELS = {
  domain: "知识领域",
  category: "知识分类",
  note: "学习笔记",
  project: "GitHub 项目",
  tag: "标签"
};

const knowledgeMapState = {
  nodes: [],
  edges: [],
  positions: new Map(),
  selectedId: "",
  matchIds: new Set(),
  query: "",
  frame: 0,
  ticks: 0,
  paused: false,
  pointer: null,
  scale: 1,
  tx: 0,
  ty: 0,
  suppressClick: false
};

function initializeKnowledgeMapEvents() {
  dom.knowledgeMapSearch.addEventListener("input", () => renderKnowledgeMap({ fit: true }));
  dom.knowledgeMapSearch.addEventListener("keydown", handleKnowledgeMapSearchKeydown);
  dom.knowledgeMapScope.addEventListener("change", () => renderKnowledgeMap({ fit: true, reset: true }));
  dom.knowledgeMapFit.addEventListener("click", fitKnowledgeMap);
  dom.knowledgeMapPause.addEventListener("click", toggleKnowledgeMapSimulation);
  dom.knowledgeMapReset.addEventListener("click", resetKnowledgeMapLayout);
  dom.knowledgeMapGraph.addEventListener("pointerdown", beginKnowledgeMapPan);
  dom.knowledgeMapGraph.addEventListener("pointermove", moveKnowledgeMapPointer);
  dom.knowledgeMapGraph.addEventListener("pointerup", endKnowledgeMapPointer);
  dom.knowledgeMapGraph.addEventListener("pointercancel", endKnowledgeMapPointer);
  dom.knowledgeMapGraph.addEventListener("wheel", zoomKnowledgeMap, { passive: false });
  dom.knowledgeMapNodeList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-map-node-id]");
    if (button) focusKnowledgeMapNode(button.dataset.mapNodeId);
  });
  dom.knowledgeMapDetail.addEventListener("click", (event) => {
    const noteButton = event.target.closest("[data-map-open-note]");
    if (noteButton) openDetail(noteButton.dataset.mapOpenNote);
  });
}

function renderKnowledgeMap({ fit = false, reset = false } = {}) {
  if (!dom.knowledgeMap || dom.knowledgeMap.hidden) return;
  stopKnowledgeMapSimulation();
  const graph = buildKnowledgeMapGraph();
  const scope = dom.knowledgeMapScope.value;
  const query = normalizeKnowledgeMapSearch(dom.knowledgeMapSearch.value);
  const scopedNodes = graph.nodes.filter((node) => knowledgeMapNodeInScope(node, scope));
  const scopedIds = new Set(scopedNodes.map((node) => node.id));
  const scopedEdges = graph.edges.filter((edge) => scopedIds.has(edge.source) && scopedIds.has(edge.target));
  const matchIds = query ? findKnowledgeMapMatches(scopedNodes, scopedEdges, query) : new Set();
  const contextIds = new Set(matchIds);
  if (query) {
    scopedEdges.forEach((edge) => {
      if (matchIds.has(edge.source) || matchIds.has(edge.target)) {
        contextIds.add(edge.source);
        contextIds.add(edge.target);
      }
    });
  }
  const visibleNodes = query ? scopedNodes.filter((node) => contextIds.has(node.id)) : scopedNodes;
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = scopedEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));

  knowledgeMapState.nodes = visibleNodes;
  knowledgeMapState.edges = visibleEdges;
  knowledgeMapState.matchIds = matchIds;
  knowledgeMapState.query = query;
  if (!visibleIds.has(knowledgeMapState.selectedId)) knowledgeMapState.selectedId = "";

  const visibleExplicitCount = visibleEdges.filter((edge) => edge.origin === "explicit").length;
  dom.knowledgeMapSummary.textContent = `${visibleNodes.length} 个节点 · ${visibleEdges.length} 条关系 · ${visibleExplicitCount} 条人工确认关系`;
  dom.knowledgeMapVisibleCount.textContent = String(visibleNodes.length);
  const mobileHint = window.matchMedia("(max-width: 720px)").matches
    ? "拖动画布探索，或使用下方节点列表快速定位。"
    : "选择节点可查看关系依据。";
  dom.knowledgeMapStatus.textContent = query
    ? (matchIds.size
      ? `匹配 ${matchIds.size} 个节点，并保留一跳相邻上下文；按 Enter 定位首个结果。`
      : "没有匹配节点，可以缩短关键词或切换探索范围。")
    : `搜索节点、摘要或关系文字；${mobileHint}`;
  dom.knowledgeMapEmpty.hidden = visibleNodes.length > 0;

  initializeKnowledgeMapPositions(visibleNodes, reset);
  buildKnowledgeMapSvg(visibleNodes, visibleEdges);
  renderKnowledgeMapNodeList();
  renderKnowledgeMapDetail();
  applyKnowledgeMapTransform();
  updateKnowledgeMapPositions();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  knowledgeMapState.paused = reduceMotion;
  updateKnowledgeMapPauseButton();
  if (!reduceMotion && visibleNodes.length > 1) startKnowledgeMapSimulation();
  if ((fit || query) && visibleNodes.length) {
    window.requestAnimationFrame(() => {
      fitKnowledgeMap();
      if (!query && window.matchMedia("(max-width: 720px)").matches) focusKnowledgeMapHub();
    });
  }
}

function buildKnowledgeMapGraph() {
  const nodes = new Map();
  const edges = new Map();
  const notes = getFilteredNotes();
  const ownedProjects = state.projects.filter((project) => !project.fork);

  const addNode = (node) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (edge) => {
    if (!edges.has(edge.id) && edge.source !== edge.target) edges.set(edge.id, edge);
  };

  notes.forEach((note) => {
    const [domain, category = domain] = note.categoryPath;
    const domainId = `domain:${domain}`;
    const categoryId = `category:${note.categoryPath.join("/")}`;
    const noteId = `note:${note.id}`;
    addNode({ id: domainId, sourceId: domain, kind: "domain", label: domain, description: `${domain} 知识领域` });
    addNode({ id: categoryId, sourceId: note.categoryPath.join("/"), kind: "category", label: category, description: note.categoryPath.join(" / ") });
    addNode({ id: noteId, sourceId: note.id, kind: "note", label: note.title, description: note.summary, data: note });
    addEdge({ id: `contains:${domainId}:${categoryId}`, source: domainId, target: categoryId, label: "包含分类", origin: "derived" });
    addEdge({ id: `classifies:${categoryId}:${noteId}`, source: categoryId, target: noteId, label: "归入分类", origin: "derived" });
    note.tags.forEach((tag) => {
      const tagId = `tag:${tag}`;
      addNode({ id: tagId, sourceId: tag, kind: "tag", label: tag, description: `笔记标签：${tag}` });
      addEdge({ id: `tagged:${noteId}:${tagId}`, source: noteId, target: tagId, label: "拥有标签", origin: "derived" });
    });
  });

  ownedProjects.forEach((project) => {
    addNode({
      id: `project:${project.name}`,
      sourceId: project.name,
      kind: "project",
      label: project.name,
      description: project.description,
      data: project
    });
  });

  let explicitCount = 0;
  state.relations.forEach((relation) => {
    const source = `${relation.sourceType}:${relation.sourceId}`;
    const target = `${relation.targetType}:${relation.targetId}`;
    if (!nodes.has(source) || !nodes.has(target)) return;
    explicitCount += 1;
    addEdge({ id: `explicit:${relation.id}`, source, target, label: relation.relation, origin: "explicit" });
  });

  return { nodes: [...nodes.values()], edges: [...edges.values()], explicitCount };
}

function knowledgeMapNodeInScope(node, scope) {
  if (scope === "overview") return ["domain", "category", "note"].includes(node.kind);
  if (scope === "projects") return ["domain", "category", "note", "project"].includes(node.kind);
  if (scope === "tags") return ["domain", "category", "note", "tag"].includes(node.kind);
  return true;
}

function normalizeKnowledgeMapSearch(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function findKnowledgeMapMatches(nodes, edges, query) {
  const matches = new Set();
  nodes.forEach((node) => {
    const corpus = [node.label, node.description, node.kind, node.sourceId]
      .filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    if (corpus.includes(query)) matches.add(node.id);
  });
  edges.forEach((edge) => {
    if ([edge.label, edge.origin].join(" ").toLocaleLowerCase("zh-CN").includes(query)) {
      matches.add(edge.source);
      matches.add(edge.target);
    }
  });
  return matches;
}

function handleKnowledgeMapSearchKeydown(event) {
  if (event.key === "Escape" && event.currentTarget.value) {
    event.currentTarget.value = "";
    renderKnowledgeMap({ fit: true });
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  const firstMatch = knowledgeMapState.matchIds.values().next().value;
  if (firstMatch) focusKnowledgeMapNode(firstMatch);
}

function initializeKnowledgeMapPositions(nodes, reset = false) {
  const count = Math.max(nodes.length, 1);
  nodes.forEach((node, index) => {
    if (!reset && knowledgeMapState.positions.has(node.id)) return;
    const hash = [...node.id].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 7);
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + (hash % 23) / 50;
    const radius = Math.sqrt((index + 0.6) / count);
    knowledgeMapState.positions.set(node.id, {
      x: 480 + Math.cos(angle) * 390 * radius,
      y: 265 + Math.sin(angle) * 215 * radius,
      vx: 0,
      vy: 0,
      fixed: false
    });
  });
}

function knowledgeMapNodeCollisionWidth(node) {
  const length = [...String(node.label || "")].length;
  return Math.max(54, Math.min(104, Math.min(length, 8) * 11 + 16));
}

function buildKnowledgeMapSvg(nodes, edges) {
  dom.knowledgeMapEdges.replaceChildren();
  dom.knowledgeMapEdgeLabels.replaceChildren();
  dom.knowledgeMapNodes.replaceChildren();
  const ns = "http://www.w3.org/2000/svg";
  edges.forEach((edge) => {
    const line = document.createElementNS(ns, "line");
    line.classList.add("knowledge-map-edge", edge.origin);
    line.dataset.edgeId = edge.id;
    const related = knowledgeMapState.query && (knowledgeMapState.matchIds.has(edge.source) || knowledgeMapState.matchIds.has(edge.target));
    line.classList.toggle("search-related", Boolean(related));
    line.classList.toggle("search-context", Boolean(knowledgeMapState.query && !related));
    const title = document.createElementNS(ns, "title");
    title.textContent = `${edge.label} · ${edge.origin === "explicit" ? "人工确认" : "字段推导"}`;
    line.append(title);
    dom.knowledgeMapEdges.append(line);

    if (edge.origin === "explicit") {
      const label = document.createElementNS(ns, "text");
      label.classList.add("knowledge-map-edge-label");
      label.dataset.edgeId = edge.id;
      label.textContent = truncateKnowledgeMapLabel(edge.label, 11);
      dom.knowledgeMapEdgeLabels.append(label);
    }
  });

  nodes.forEach((node) => {
    const group = document.createElementNS(ns, "g");
    group.classList.add("knowledge-map-node");
    group.classList.toggle("search-match", knowledgeMapState.matchIds.has(node.id));
    group.classList.toggle("search-context", Boolean(knowledgeMapState.query && !knowledgeMapState.matchIds.has(node.id)));
    group.dataset.nodeId = node.id;
    group.dataset.mapKind = node.kind;
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `${node.label}，${KNOWLEDGE_MAP_KIND_LABELS[node.kind]}节点`);
    const title = document.createElementNS(ns, "title");
    title.textContent = node.label;
    const hitArea = document.createElementNS(ns, "circle");
    hitArea.classList.add("knowledge-map-node-hit-area");
    hitArea.setAttribute("r", "30");
    const shape = knowledgeMapNodeShape(node.kind);
    shape.classList.add("knowledge-map-node-shape");
    const nodeColor = KNOWLEDGE_MAP_COLORS[node.kind] || "#64748b";
    shape.setAttribute("fill", nodeColor);
    shape.setAttribute("fill-opacity", "0.16");
    shape.setAttribute("stroke", nodeColor);
    shape.setAttribute("stroke-width", "1.7");
    shape.style.setProperty("fill", nodeColor, "important");
    shape.style.setProperty("fill-opacity", "0.16", "important");
    shape.style.setProperty("stroke", nodeColor, "important");
    const label = document.createElementNS(ns, "text");
    label.classList.add("knowledge-map-node-label");
    label.setAttribute("y", "34");
    label.textContent = truncateKnowledgeMapLabel(node.label, node.kind === "note" ? 9 : 12);
    group.append(title, hitArea, shape, label);
    group.addEventListener("pointerdown", beginKnowledgeMapNodeDrag);
    group.addEventListener("keydown", handleKnowledgeMapNodeKeydown);
    group.addEventListener("click", () => {
      if (!knowledgeMapState.suppressClick) selectKnowledgeMapNode(node.id);
    });
    dom.knowledgeMapNodes.append(group);
  });
}

const KNOWLEDGE_MAP_COLORS = {
  domain: "#2563eb",
  category: "#64748b",
  note: "#3b82f6",
  project: "#2563eb",
  tag: "#ea580c"
};

function truncateKnowledgeMapLabel(value, limit) {
  const characters = [...String(value || "")];
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : characters.join("");
}

function knowledgeMapNodeShape(kind) {
  const ns = "http://www.w3.org/2000/svg";
  if (kind === "project") {
    const rectangle = document.createElementNS(ns, "rect");
    rectangle.setAttribute("x", "-20"); rectangle.setAttribute("y", "-20");
    rectangle.setAttribute("width", "40"); rectangle.setAttribute("height", "40"); rectangle.setAttribute("rx", "7");
    return rectangle;
  }
  if (kind === "domain" || kind === "tag") {
    const polygon = document.createElementNS(ns, "polygon");
    polygon.setAttribute("points", kind === "domain" ? "-22,-13 0,-25 22,-13 22,13 0,25 -22,13" : "0,-20 20,0 0,20 -20,0");
    return polygon;
  }
  const circle = document.createElementNS(ns, "circle");
  circle.setAttribute("r", kind === "note" ? "19" : "16");
  return circle;
}

function updateKnowledgeMapPositions() {
  const positions = knowledgeMapState.positions;
  dom.knowledgeMapEdges.querySelectorAll(".knowledge-map-edge").forEach((line, index) => {
    const edge = knowledgeMapState.edges[index];
    const source = positions.get(edge?.source);
    const target = positions.get(edge?.target);
    if (!source || !target) return;
    line.setAttribute("x1", source.x); line.setAttribute("y1", source.y);
    line.setAttribute("x2", target.x); line.setAttribute("y2", target.y);
  });
  dom.knowledgeMapEdgeLabels.querySelectorAll(".knowledge-map-edge-label").forEach((label) => {
    const edge = knowledgeMapState.edges.find((item) => item.id === label.dataset.edgeId);
    const source = positions.get(edge?.source); const target = positions.get(edge?.target);
    if (!source || !target) return;
    label.setAttribute("x", (source.x + target.x) / 2);
    label.setAttribute("y", ((source.y + target.y) / 2) - 5);
  });
  dom.knowledgeMapNodes.querySelectorAll(".knowledge-map-node").forEach((group) => {
    const point = positions.get(group.dataset.nodeId);
    if (point) group.setAttribute("transform", `translate(${point.x} ${point.y})`);
  });
}

function startKnowledgeMapSimulation() {
  if (knowledgeMapState.frame || knowledgeMapState.paused) return;
  knowledgeMapState.ticks = 0;
  const tick = () => {
    knowledgeMapState.frame = 0;
    if (knowledgeMapState.paused) return;
    simulateKnowledgeMapStep();
    updateKnowledgeMapPositions();
    knowledgeMapState.ticks += 1;
    if (knowledgeMapState.ticks < 360) knowledgeMapState.frame = requestAnimationFrame(tick);
  };
  knowledgeMapState.frame = requestAnimationFrame(tick);
}

function stopKnowledgeMapSimulation() {
  if (knowledgeMapState.frame) cancelAnimationFrame(knowledgeMapState.frame);
  knowledgeMapState.frame = 0;
}

function simulateKnowledgeMapStep() {
  const nodes = knowledgeMapState.nodes;
  const positions = knowledgeMapState.positions;
  const collisionWidths = nodes.map(knowledgeMapNodeCollisionWidth);
  for (let index = 0; index < nodes.length; index += 1) {
    const first = positions.get(nodes[index].id);
    if (!first || first.fixed) continue;
    for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
      const second = positions.get(nodes[otherIndex].id);
      if (!second) continue;
      let dx = first.x - second.x; let dy = first.y - second.y;
      const distanceSquared = Math.max((dx * dx) + (dy * dy), 120);
      const distance = Math.sqrt(distanceSquared);
      const force = Math.min(2.1, 3400 / distanceSquared);
      dx /= distance; dy /= distance;
      first.vx += dx * force; first.vy += dy * force;
      if (!second.fixed) { second.vx -= dx * force; second.vy -= dy * force; }
      const minX = (collisionWidths[index] + collisionWidths[otherIndex]) / 2;
      const minY = 58;
      const overlapX = minX - Math.abs(first.x - second.x);
      const overlapY = minY - Math.abs(first.y - second.y);
      if (overlapX > 0 && overlapY > 0) {
        const separateOnX = (overlapX / minX) < (overlapY / minY);
        const direction = separateOnX ? (first.x >= second.x ? 1 : -1) : (first.y >= second.y ? 1 : -1);
        const collision = Math.min(3.2, (separateOnX ? overlapX : overlapY) * 0.08);
        if (separateOnX) {
          first.vx += direction * collision;
          if (!second.fixed) second.vx -= direction * collision;
        } else {
          first.vy += direction * collision;
          if (!second.fixed) second.vy -= direction * collision;
        }
      }
    }
    first.vx += (480 - first.x) * 0.0006;
    first.vy += (270 - first.y) * 0.0006;
  }
  knowledgeMapState.edges.forEach((edge) => {
    const source = positions.get(edge.source); const target = positions.get(edge.target);
    if (!source || !target) return;
    const dx = target.x - source.x; const dy = target.y - source.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const desired = edge.origin === "explicit" ? 145 : 105;
    const force = (distance - desired) * (edge.origin === "explicit" ? 0.0024 : 0.0032);
    if (!source.fixed) { source.vx += (dx / distance) * force; source.vy += (dy / distance) * force; }
    if (!target.fixed) { target.vx -= (dx / distance) * force; target.vy -= (dy / distance) * force; }
  });
  nodes.forEach((node) => {
    const point = positions.get(node.id);
    if (!point || point.fixed) return;
    point.vx *= 0.84; point.vy *= 0.84;
    const halfWidth = collisionWidths[index] / 2;
    point.x = Math.max(halfWidth + 8, Math.min(952 - halfWidth, point.x + point.vx));
    point.y = Math.max(35, Math.min(515, point.y + point.vy));
  });
}

function beginKnowledgeMapNodeDrag(event) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const id = event.currentTarget.dataset.nodeId;
  const point = knowledgeMapState.positions.get(id);
  if (!point) return;
  point.fixed = true;
  knowledgeMapState.pointer = { type: "node", id, moved: false };
  event.currentTarget.setPointerCapture(event.pointerId);
  dom.knowledgeMapGraph.classList.add("dragging-node");
}

function beginKnowledgeMapPan(event) {
  if (event.button !== 0 || event.target.closest(".knowledge-map-node")) return;
  knowledgeMapState.pointer = { type: "pan", x: event.clientX, y: event.clientY, tx: knowledgeMapState.tx, ty: knowledgeMapState.ty };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add("panning");
}

function moveKnowledgeMapPointer(event) {
  const pointer = knowledgeMapState.pointer;
  if (!pointer) return;
  if (pointer.type === "node") {
    const point = knowledgeMapState.positions.get(pointer.id);
    const next = knowledgeMapPoint(event);
    if (point) {
      point.x = next.x; point.y = next.y; point.vx = 0; point.vy = 0;
      pointer.moved = true;
    }
    updateKnowledgeMapPositions();
    return;
  }
  const rectangle = dom.knowledgeMapGraph.getBoundingClientRect();
  knowledgeMapState.tx = pointer.tx + ((event.clientX - pointer.x) / rectangle.width) * 960;
  knowledgeMapState.ty = pointer.ty + ((event.clientY - pointer.y) / rectangle.height) * 560;
  applyKnowledgeMapTransform();
}

function endKnowledgeMapPointer() {
  const pointer = knowledgeMapState.pointer;
  knowledgeMapState.suppressClick = Boolean(pointer?.type === "node" && pointer.moved);
  if (pointer?.type === "node") {
    const point = knowledgeMapState.positions.get(pointer.id);
    if (point) point.fixed = false;
    if (!knowledgeMapState.paused) startKnowledgeMapSimulation();
  }
  knowledgeMapState.pointer = null;
  dom.knowledgeMapGraph.classList.remove("dragging-node", "panning");
  window.setTimeout(() => { knowledgeMapState.suppressClick = false; }, 0);
}

function knowledgeMapPoint(event) {
  const rectangle = dom.knowledgeMapGraph.getBoundingClientRect();
  const x = ((event.clientX - rectangle.left) / rectangle.width) * 960;
  const y = ((event.clientY - rectangle.top) / rectangle.height) * 560;
  return { x: (x - knowledgeMapState.tx) / knowledgeMapState.scale, y: (y - knowledgeMapState.ty) / knowledgeMapState.scale };
}

function zoomKnowledgeMap(event) {
  event.preventDefault();
  const before = knowledgeMapPoint(event);
  const factor = event.deltaY < 0 ? 1.12 : 0.89;
  knowledgeMapState.scale = Math.max(0.35, Math.min(3, knowledgeMapState.scale * factor));
  const rectangle = dom.knowledgeMapGraph.getBoundingClientRect();
  const svgX = ((event.clientX - rectangle.left) / rectangle.width) * 960;
  const svgY = ((event.clientY - rectangle.top) / rectangle.height) * 560;
  knowledgeMapState.tx = svgX - before.x * knowledgeMapState.scale;
  knowledgeMapState.ty = svgY - before.y * knowledgeMapState.scale;
  applyKnowledgeMapTransform();
}

function applyKnowledgeMapTransform() {
  dom.knowledgeMapViewport.setAttribute("transform", `translate(${knowledgeMapState.tx} ${knowledgeMapState.ty}) scale(${knowledgeMapState.scale})`);
}

function fitKnowledgeMap() {
  const points = knowledgeMapState.nodes.map((node) => knowledgeMapState.positions.get(node.id)).filter(Boolean);
  if (!points.length) return;
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 65; const maxX = Math.max(...xs) + 65;
  const minY = Math.min(...ys) - 60; const maxY = Math.max(...ys) + 60;
  knowledgeMapState.scale = Math.max(0.35, Math.min(1.7, Math.min(900 / Math.max(1, maxX - minX), 500 / Math.max(1, maxY - minY))));
  knowledgeMapState.tx = 480 - ((minX + maxX) / 2) * knowledgeMapState.scale;
  knowledgeMapState.ty = 280 - ((minY + maxY) / 2) * knowledgeMapState.scale;
  applyKnowledgeMapTransform();
}

function focusKnowledgeMapHub() {
  if (!knowledgeMapState.nodes.length) return;
  const degree = new Map(knowledgeMapState.nodes.map((node) => [node.id, 0]));
  knowledgeMapState.edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  });
  const hub = knowledgeMapState.nodes
    .slice()
    .sort((first, second) => (degree.get(second.id) || 0) - (degree.get(first.id) || 0))[0];
  const point = knowledgeMapState.positions.get(hub?.id);
  if (!point) return;
  knowledgeMapState.scale = 2.7;
  knowledgeMapState.tx = 480 - point.x * knowledgeMapState.scale;
  knowledgeMapState.ty = 280 - point.y * knowledgeMapState.scale;
  applyKnowledgeMapTransform();
}

function resetKnowledgeMapLayout() {
  initializeKnowledgeMapPositions(knowledgeMapState.nodes, true);
  knowledgeMapState.scale = 1; knowledgeMapState.tx = 0; knowledgeMapState.ty = 0;
  applyKnowledgeMapTransform(); updateKnowledgeMapPositions();
  knowledgeMapState.paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  updateKnowledgeMapPauseButton();
  if (!knowledgeMapState.paused) startKnowledgeMapSimulation();
  if (window.matchMedia("(max-width: 720px)").matches) window.requestAnimationFrame(focusKnowledgeMapHub);
}

function toggleKnowledgeMapSimulation() {
  knowledgeMapState.paused = !knowledgeMapState.paused;
  if (knowledgeMapState.paused) stopKnowledgeMapSimulation(); else startKnowledgeMapSimulation();
  updateKnowledgeMapPauseButton();
}

function updateKnowledgeMapPauseButton() {
  dom.knowledgeMapPause.setAttribute("aria-pressed", String(knowledgeMapState.paused));
  dom.knowledgeMapPause.textContent = knowledgeMapState.paused ? "继续" : "暂停";
}

function handleKnowledgeMapNodeKeydown(event) {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  selectKnowledgeMapNode(event.currentTarget.dataset.nodeId);
}

function selectKnowledgeMapNode(id) {
  knowledgeMapState.selectedId = id;
  dom.knowledgeMapNodes.querySelectorAll(".knowledge-map-node").forEach((node) => node.classList.toggle("selected", node.dataset.nodeId === id));
  dom.knowledgeMapNodeList.querySelectorAll("[data-map-node-id]").forEach((button) => button.classList.toggle("is-active", button.dataset.mapNodeId === id));
  renderKnowledgeMapDetail();
}

function focusKnowledgeMapNode(id) {
  const point = knowledgeMapState.positions.get(id);
  if (!point) return;
  selectKnowledgeMapNode(id);
  knowledgeMapState.scale = Math.max(knowledgeMapState.scale, 1.15);
  knowledgeMapState.tx = 480 - point.x * knowledgeMapState.scale;
  knowledgeMapState.ty = 280 - point.y * knowledgeMapState.scale;
  applyKnowledgeMapTransform();
  dom.knowledgeMapNodes.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.focus();
}

function renderKnowledgeMapNodeList() {
  dom.knowledgeMapNodeList.innerHTML = knowledgeMapState.nodes
    .slice().sort((first, second) => first.kind.localeCompare(second.kind) || first.label.localeCompare(second.label, "zh-CN"))
    .map((node) => `<button type="button" role="listitem" data-map-node-id="${escapeAttr(node.id)}"><span>${escapeHtml(node.label)}</span><small>${KNOWLEDGE_MAP_KIND_LABELS[node.kind]}</small></button>`)
    .join("");
}

function renderKnowledgeMapDetail() {
  const node = knowledgeMapState.nodes.find((item) => item.id === knowledgeMapState.selectedId);
  if (!node) {
    dom.knowledgeMapDetail.textContent = "选择图中节点，查看它与笔记、项目、分类或标签之间的关系。";
    return;
  }
  const relations = knowledgeMapState.edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) => {
      const neighborId = edge.source === node.id ? edge.target : edge.source;
      const neighbor = knowledgeMapState.nodes.find((item) => item.id === neighborId);
      return neighbor ? `<li><button type="button" data-map-node-id="${escapeAttr(neighbor.id)}">${escapeHtml(neighbor.label)}</button><span>${escapeHtml(edge.label)} · ${edge.origin === "explicit" ? "人工确认" : "字段推导"}</span></li>` : "";
    }).join("");
  const action = node.kind === "note"
    ? `<button class="map-detail-action" type="button" data-map-open-note="${escapeAttr(node.sourceId)}">查看笔记详情</button>`
    : (node.kind === "project" && safeHref(node.data?.repoUrl)
      ? `<a class="map-detail-action" href="${escapeAttr(safeHref(node.data.repoUrl))}" target="_blank" rel="noopener noreferrer">打开项目源码 ↗</a>`
      : "");
  dom.knowledgeMapDetail.innerHTML = `<span class="map-detail-kind">${KNOWLEDGE_MAP_KIND_LABELS[node.kind]}</span><strong>${escapeHtml(node.label)}</strong><p>${escapeHtml(node.description || "暂无补充说明")}</p>${action}<h5>相邻关系 · ${relations ? relations.split("<li>").length - 1 : 0}</h5><ul>${relations || "<li><span>当前范围内没有相邻节点。</span></li>"}</ul>`;
  dom.knowledgeMapDetail.querySelectorAll("[data-map-node-id]").forEach((button) => button.addEventListener("click", () => focusKnowledgeMapNode(button.dataset.mapNodeId)));
}
