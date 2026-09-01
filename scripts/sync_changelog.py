#!/usr/bin/env python3
"""根据当前仓库提交历史生成公开变更记录，保留手工维护的系统说明。"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
from pathlib import Path
from typing import Any


COMMIT_SEPARATOR = "\x1e"
FIELD_SEPARATOR = "\x1f"
TYPE_LABELS = {
    "feat": "功能",
    "fix": "修复",
    "refactor": "重构",
    "style": "样式",
    "docs": "文档",
    "test": "测试",
    "chore": "维护",
    "perf": "性能",
    "build": "构建",
    "ci": "自动化",
}


def clean_subject(subject: str) -> tuple[str, str]:
    """清理 Conventional Commits 前缀，并返回标题与分类标签。"""
    match = re.match(r"^(feat|fix|refactor|style|docs|test|chore|perf|build|ci)(?:\([^)]*\))?!?:\s*(.+)$", subject.strip(), re.I)
    if not match:
        return subject.strip() or "仓库更新", "项目更新"
    return match.group(2).strip() or "仓库更新", TYPE_LABELS.get(match.group(1).lower(), "项目更新")


def read_git_commits(repo: Path, limit: int = 60) -> list[dict[str, str]]:
    """读取最近提交的短哈希、日期、标题和正文；失败时抛出可读错误。"""
    command = ["git", "-C", str(repo), "log", f"-{limit}", "--date=iso-strict", f"--format=%H{FIELD_SEPARATOR}%h{FIELD_SEPARATOR}%aI{FIELD_SEPARATOR}%s{FIELD_SEPARATOR}%b{COMMIT_SEPARATOR}"]
    try:
        output = subprocess.check_output(command, text=True, encoding="utf-8", errors="replace")
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(f"无法读取 Git 提交历史：{exc}") from exc
    commits: list[dict[str, str]] = []
    for raw in output.split(COMMIT_SEPARATOR):
        fields = raw.strip().split(FIELD_SEPARATOR, 4)
        if len(fields) < 4:
            continue
        body = fields[4].strip() if len(fields) > 4 else ""
        commits.append({"hash": fields[0], "shortHash": fields[1], "date": fields[2], "subject": fields[3], "body": body})
    return commits


def build_payload(commits: list[dict[str, str]], previous: dict[str, Any] | None = None, generated_at: str | None = None) -> dict[str, Any]:
    """把提交历史转换为 changelog，并保留旧数据中的系统说明。"""
    entries: list[dict[str, Any]] = []
    for commit in commits:
        title, commit_type = clean_subject(commit.get("subject", ""))
        body = commit.get("body", "").strip()
        summary = body.splitlines()[0].strip() if body else f"{title}。该记录由仓库提交自动生成。"
        entries.append({
            "id": f"commit-{commit.get('shortHash') or commit.get('hash', '')[:12]}",
            "date": (commit.get("date") or "")[:10],
            "section": "features",
            "title": title,
            "summary": summary,
            "tags": ["自动记录", commit_type],
            "commit": commit.get("shortHash") or commit.get("hash", "")[:7],
        })
    previous_sections = previous.get("sections", []) if isinstance(previous, dict) else []
    system_entries = [entry for entry in (previous.get("entries", []) if isinstance(previous, dict) else []) if entry.get("section") == "system"]
    for entry in system_entries:
        if entry.get("id") == "system-2026-commit-scope":
            entry["title"] = "提交统计口径：默认分支总提交"
            entry["summary"] = "提交数量按每个公开仓库默认分支统计总提交，不再依赖作者邮箱与 GitHub 账号身份匹配；近 30 天提交用于近期活动排序。"
    sections = previous_sections or [
        {"id": "features", "label": "功能更新", "description": "页面能力、交互与数据管线的每一次向前推进。"},
        {"id": "system", "label": "系统说明", "description": "数据口径、隐私边界、部署方式与维护约定。"},
    ]
    return {
        "schemaVersion": "1.1.0",
        "generatedAt": generated_at or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "git log",
        "sections": sections,
        "entries": entries + system_entries,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate changelog entries from Git history.")
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("data/changelog.json"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    previous: dict[str, Any] = {}
    if args.output.exists():
        previous = json.loads(args.output.read_text(encoding="utf-8"))
    payload = build_payload(read_git_commits(args.repo), previous)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"ok": True, "entries": len(payload["entries"]), "source": payload["source"], "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
