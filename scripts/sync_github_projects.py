#!/usr/bin/env python3
"""读取 GitHub 公开仓库并生成前端可安全展示的项目索引。"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


API_ROOT = "https://api.github.com"


def github_request_with_headers(url: str, token: str | None = None) -> tuple[Any, dict[str, str]]:
    """调用 GitHub REST API，同时返回分页统计所需的响应头。"""
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "starline-learning-view",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response), {key.casefold(): value for key, value in response.headers.items()}
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"GitHub API 请求失败：HTTP {exc.code} {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"GitHub API 无法访问：{exc.reason}") from exc


def github_request(url: str, token: str | None = None) -> Any:
    """调用 GitHub REST API并返回 JSON 数据。"""
    payload, _ = github_request_with_headers(url, token)
    return payload


def list_public_repositories(owner: str, token: str | None = None) -> list[dict[str, Any]]:
    """分页读取指定账号的全部公开仓库。"""
    repositories: list[dict[str, Any]] = []
    for page in range(1, 101):
        query = urllib.parse.urlencode({
            "type": "owner",
            "sort": "updated",
            "direction": "desc",
            "per_page": 100,
            "page": page,
        })
        payload = github_request(f"{API_ROOT}/users/{urllib.parse.quote(owner)}/repos?{query}", token)
        if not isinstance(payload, list):
            raise RuntimeError("GitHub API 返回的仓库数据不是数组")
        repositories.extend(payload)
        if len(payload) < 100:
            break
    return repositories


def list_starred_repositories(owner: str, token: str | None = None) -> list[dict[str, Any]]:
    """分页读取账号公开可见的 Star 仓库。"""
    repositories: list[dict[str, Any]] = []
    for page in range(1, 101):
        query = urllib.parse.urlencode({"per_page": 100, "page": page, "sort": "updated", "direction": "desc"})
        payload = github_request(f"{API_ROOT}/users/{urllib.parse.quote(owner)}/starred?{query}", token)
        if not isinstance(payload, list):
            raise RuntimeError("GitHub API 返回的 Star 数据不是数组")
        repositories.extend(payload)
        if len(payload) < 100:
            break
    return repositories


def last_page_from_link(link_header: str) -> int | None:
    """从 GitHub Link 响应头中提取最后一页页码。"""
    for part in link_header.split(","):
        if 'rel="last"' not in part:
            continue
        match = urllib.parse.urlparse(part.split(";", 1)[0].strip().strip("<>"))
        page_values = urllib.parse.parse_qs(match.query).get("page")
        if page_values and page_values[0].isdigit():
            return int(page_values[0])
    return None


def default_branch_commit_count(owner: str, repository_name: str, token: str | None = None) -> int | None:
    """统计账号身份在仓库默认分支上的匹配提交；失败返回未知。"""
    query = urllib.parse.urlencode({"author": owner, "per_page": 1})
    url = f"{API_ROOT}/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repository_name)}/commits?{query}"
    try:
        payload, headers = github_request_with_headers(url, token)
    except RuntimeError as exc:
        if "HTTP 409" in str(exc):
            return 0
        return None
    if not isinstance(payload, list):
        return None
    last_page = last_page_from_link(headers.get("link", ""))
    return last_page if last_page is not None else len(payload)


def fork_upstream(repository: dict[str, Any], token: str | None = None) -> dict[str, str] | None:
    """读取 Fork 的直接上游仓库；API 失败时保留未知状态。"""
    if not repository.get("fork"):
        return None
    full_name = str(repository.get("full_name") or "")
    if not full_name:
        return None
    try:
        detail = github_request(f"{API_ROOT}/repos/{full_name}", token)
    except RuntimeError:
        return None
    parent = detail.get("parent") if isinstance(detail, dict) else None
    if not isinstance(parent, dict):
        return None
    return {
        "fullName": str(parent.get("full_name") or ""),
        "repoUrl": str(parent.get("html_url") or ""),
    }


def derived_pages_url(owner: str, repository_name: str) -> str:
    """按 GitHub Pages 的标准仓库地址生成可访问 URL。"""
    if repository_name.casefold() == f"{owner}.github.io".casefold():
        return f"https://{owner.casefold()}.github.io/"
    return f"https://{owner.casefold()}.github.io/{repository_name}/"


def fallback_description(repository: dict[str, Any]) -> str:
    """为未填写 Description 的仓库生成有事实依据的简短介绍。"""
    name = str(repository.get("name") or "").strip()
    if name.casefold() == "starline-learning-view":
        return "集中管理学习笔记网页与 GitHub Pages 项目的静态知识库导航。"
    language = str(repository.get("language") or "").strip()
    if repository.get("fork"):
        return "从上游同步的 Fork 项目，可前往源码仓库查看来源与完整说明。"
    if repository.get("has_pages"):
        return f"已通过 GitHub Pages 发布的 {language or 'Web'} 项目，可直接在线查看。"
    return f"{language or '公开'}项目，详细功能说明可在源码仓库中继续补充。"


def normalize_repository(
    repository: dict[str, Any],
    owner: str,
    *,
    commit_count: int | None = None,
    upstream: dict[str, str] | None = None,
) -> dict[str, Any]:
    """裁剪 GitHub 响应，只保留公开网页所需且稳定的字段。"""
    name = str(repository.get("name") or "").strip()
    has_pages = bool(repository.get("has_pages"))
    topics = repository.get("topics") if isinstance(repository.get("topics"), list) else []
    return {
        "id": int(repository.get("id") or 0),
        "name": name,
        "fullName": str(repository.get("full_name") or f"{owner}/{name}"),
        "description": str(repository.get("description") or "").strip() or fallback_description(repository),
        "descriptionSource": "github" if str(repository.get("description") or "").strip() else "generated-fallback",
        "repoUrl": str(repository.get("html_url") or f"https://github.com/{owner}/{name}"),
        "pagesUrl": derived_pages_url(owner, name) if has_pages else None,
        "hasPages": has_pages,
        "homepage": str(repository.get("homepage") or "").strip() or None,
        "language": str(repository.get("language") or "").strip() or None,
        "topics": [str(topic) for topic in topics if str(topic).strip()][:12],
        "fork": bool(repository.get("fork")),
        "archived": bool(repository.get("archived")),
        "stars": int(repository.get("stargazers_count") or 0),
        "forks": int(repository.get("forks_count") or 0),
        "defaultBranch": str(repository.get("default_branch") or "main"),
        "commitCount": commit_count,
        "commitScope": "GitHub 账号身份匹配的默认分支提交",
        "upstream": upstream,
        "updatedAt": str(repository.get("updated_at") or ""),
        "pushedAt": str(repository.get("pushed_at") or ""),
    }


def normalize_starred(repository: dict[str, Any]) -> dict[str, Any]:
    """裁剪 Star 仓库，仅保留公开展示字段。"""
    topics = repository.get("topics") if isinstance(repository.get("topics"), list) else []
    return {
        "id": int(repository.get("id") or 0),
        "name": str(repository.get("name") or ""),
        "fullName": str(repository.get("full_name") or ""),
        "description": str(repository.get("description") or "").strip() or "已收藏的开源项目，可前往源码仓库查看完整介绍与使用方式。",
        "descriptionSource": "github" if str(repository.get("description") or "").strip() else "generated-fallback",
        "repoUrl": str(repository.get("html_url") or ""),
        "homepage": str(repository.get("homepage") or "").strip() or None,
        "language": str(repository.get("language") or "").strip() or None,
        "topics": [str(topic) for topic in topics if str(topic).strip()][:12],
        "stars": int(repository.get("stargazers_count") or 0),
        "forks": int(repository.get("forks_count") or 0),
        "updatedAt": str(repository.get("updated_at") or ""),
    }


def build_payload(
    repositories: list[dict[str, Any]],
    owner: str,
    generated_at: str | None = None,
    *,
    commit_counts: dict[str, int | None] | None = None,
    upstreams: dict[str, dict[str, str] | None] | None = None,
    starred_repositories: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """构造可被前端直接读取的稳定项目索引。"""
    commit_counts = commit_counts or {}
    upstreams = upstreams or {}
    projects = [normalize_repository(
        repository,
        owner,
        commit_count=commit_counts.get(str(repository.get("name") or "")),
        upstream=upstreams.get(str(repository.get("name") or "")),
    ) for repository in repositories]
    projects.sort(key=lambda item: (item["updatedAt"], item["name"].casefold()), reverse=True)
    starred = [normalize_starred(repository) for repository in (starred_repositories or [])]
    starred.sort(key=lambda item: (item["updatedAt"], item["fullName"].casefold()), reverse=True)
    known_commit_total = sum(project["commitCount"] for project in projects if isinstance(project["commitCount"], int))
    unknown_commit_repositories = sum(project["commitCount"] is None for project in projects)
    return {
        "schemaVersion": "1.0.0",
        "owner": owner,
        "generatedAt": generated_at or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": f"https://api.github.com/users/{owner}/repos",
        "commitScope": "按 GitHub 账号身份匹配每个公开仓库默认分支上的提交；不含其他分支、未推送提交或未绑定身份的邮箱提交。",
        "summary": {
            "repositories": len(projects),
            "owned": sum(not project["fork"] for project in projects),
            "forked": sum(project["fork"] for project in projects),
            "pages": sum(project["hasPages"] for project in projects),
            "matchedDefaultBranchCommits": known_commit_total,
            "unknownCommitRepositories": unknown_commit_repositories,
            "starred": len(starred),
        },
        "projects": projects,
        "starred": starred,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a public GitHub project index for the static site.")
    parser.add_argument("--owner", required=True, help="GitHub user or organization name.")
    parser.add_argument("--output", type=Path, default=Path("data/github-projects.json"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    repositories = list_public_repositories(args.owner, token)
    commit_counts = {
        str(repository.get("name") or ""): default_branch_commit_count(args.owner, str(repository.get("name") or ""), token)
        for repository in repositories
    }
    upstreams = {
        str(repository.get("name") or ""): fork_upstream(repository, token)
        for repository in repositories if repository.get("fork")
    }
    starred_repositories = list_starred_repositories(args.owner, token)
    payload = build_payload(
        repositories,
        args.owner,
        commit_counts=commit_counts,
        upstreams=upstreams,
        starred_repositories=starred_repositories,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "owner": args.owner,
        "projects": len(payload["projects"]),
        **payload["summary"],
        "output": str(args.output),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
