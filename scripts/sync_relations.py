"""根据公开笔记与项目字段生成可解释的派生关系。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9+#.-]{1,}|[\u4e00-\u9fff]{2,}", re.IGNORECASE)
STOPWORDS = {
    "ai", "github", "starline", "project", "项目", "公开", "实践", "系统", "管理", "方法", "工作", "学习", "笔记",
}


def load_json(path: Path) -> dict[str, Any]:
    """以 UTF-8 读取 JSON。"""
    return json.loads(path.read_text(encoding="utf-8"))


def tokens(*values: Any) -> set[str]:
    """提取字段中的中英文关键词，并过滤过于泛化的词。"""
    text = " ".join(str(value or "") for value in values)
    return {token.casefold() for token in TOKEN_RE.findall(text) if token.casefold() not in STOPWORDS}


def note_tokens(note: dict[str, Any]) -> set[str]:
    """整理笔记标题、摘要、分类和标签关键词。"""
    return tokens(note.get("title"), note.get("summary"), " ".join(note.get("categoryPath") or []), " ".join(note.get("tags") or []))


def project_tokens(project: dict[str, Any]) -> set[str]:
    """整理项目名称、摘要、主题和语言关键词。"""
    return tokens(project.get("name"), project.get("description"), " ".join(project.get("topics") or []), " ".join(project.get("languages") or []), project.get("language"))


def relation_id(note_id: str, project_name: str) -> str:
    """生成稳定且不依赖文本摘要的关系 ID。"""
    digest = hashlib.sha1(f"{note_id}:{project_name}".encode("utf-8")).hexdigest()[:10]
    return f"derived-note-project-{digest}"


def infer_relations(notes: list[dict[str, Any]], projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按关键词重合生成笔记到项目的派生关系。"""
    relations: list[dict[str, Any]] = []
    for note in notes:
        note_keys = note_tokens(note)
        if not note_keys:
            continue
        for project in projects:
            name = str(project.get("name") or "").strip()
            if not name:
                continue
            project_keys = project_tokens(project)
            overlap = sorted(note_keys & project_keys)
            # 只接受明确的词汇命中；泛化词已过滤，避免把所有笔记连到同一项目。
            if not overlap:
                continue
            score = sum(3 if key in tokens(note.get("tags"), note.get("categoryPath")) else 1 for key in overlap)
            if score < 3:
                continue
            relations.append({
                "id": relation_id(str(note.get("id") or ""), name),
                "sourceType": "note",
                "sourceId": str(note.get("id") or ""),
                "targetType": "project",
                "targetId": name,
                "relation": "内容与技术栈存在字段关联",
                "origin": "derived",
                "score": score,
                "evidence": overlap[:8],
            })
    return sorted(relations, key=lambda item: (-item["score"], item["sourceId"], item["targetId"]))


def build_payload(notes_payload: dict[str, Any], projects_payload: dict[str, Any], existing_payload: dict[str, Any]) -> dict[str, Any]:
    """保留人工关系并替换本次生成的派生关系。"""
    manual = [relation for relation in existing_payload.get("relations", []) if relation.get("origin") != "derived"]
    derived = infer_relations(notes_payload.get("notes", []), projects_payload.get("projects", []))
    return {
        "schemaVersion": "1.1.0",
        "updatedAt": projects_payload.get("generatedAt") or notes_payload.get("updatedAt") or "",
        "relations": manual + derived,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate explainable derived relations for the learning graph.")
    parser.add_argument("--notes", type=Path, default=Path("data/notes.json"))
    parser.add_argument("--projects", type=Path, default=Path("data/github-projects.json"))
    parser.add_argument("--relations", type=Path, default=Path("data/relations.json"))
    args = parser.parse_args()
    payload = build_payload(load_json(args.notes), load_json(args.projects), load_json(args.relations))
    args.relations.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "manual": sum(item.get("origin") != "derived" for item in payload["relations"]), "derived": sum(item.get("origin") == "derived" for item in payload["relations"]), "output": str(args.relations)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
