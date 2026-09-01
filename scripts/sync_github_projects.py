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


def parse_excluded_repositories(value: str) -> frozenset[str]:
    """解析逗号或换行分隔的隐藏仓库名，不保留空项。"""
    normalized = value.replace("\r", "\n").replace(",", "\n").replace(";", "\n")
    return frozenset(item.strip().casefold() for item in normalized.splitlines() if item.strip())


def filter_excluded_repositories(
    repositories: list[dict[str, Any]],
    excluded: frozenset[str],
) -> tuple[list[dict[str, Any]], int]:
    """按仓库名或 owner/name 排除不应进入公开索引的项目。"""
    visible: list[dict[str, Any]] = []
    excluded_count = 0
    for repository in repositories:
        name = str(repository.get("name") or "").strip().casefold()
        full_name = str(repository.get("full_name") or "").strip().casefold()
        if name in excluded or full_name in excluded:
            excluded_count += 1
            continue
        visible.append(repository)
    return visible, excluded_count


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
    except OSError as exc:
        raise RuntimeError(f"GitHub API 网络连接中断：{exc}") from exc


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
    """统计仓库默认分支的提交总数；失败返回未知。"""
    query = urllib.parse.urlencode({"per_page": 1})
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


def recent_default_branch_activity(
    owner: str,
    repository_name: str,
    since: str,
    token: str | None = None,
) -> tuple[int | None, str | None]:
    """统计时间窗口内默认分支提交，并返回最近一次提交时间。"""
    query = urllib.parse.urlencode({"since": since, "per_page": 1})
    url = f"{API_ROOT}/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repository_name)}/commits?{query}"
    try:
        payload, headers = github_request_with_headers(url, token)
    except RuntimeError as exc:
        if "HTTP 409" in str(exc):
            return 0, None
        return None, None
    if not isinstance(payload, list):
        return None, None
    last_page = last_page_from_link(headers.get("link", ""))
    commit_count = last_page if last_page is not None else len(payload)
    latest_commit_at = None
    if payload and isinstance(payload[0], dict):
        commit = payload[0].get("commit")
        if isinstance(commit, dict):
            author = commit.get("author")
            committer = commit.get("committer")
            if isinstance(author, dict):
                latest_commit_at = str(author.get("date") or "").strip() or None
            if latest_commit_at is None and isinstance(committer, dict):
                latest_commit_at = str(committer.get("date") or "").strip() or None
    return commit_count, latest_commit_at


def fork_upstream(repository: dict[str, Any], token: str | None = None) -> dict[str, str] | None:
    """读取 Fork 的直接上游仓库；API 失败时保留未知状态。"""
    if not repository.get("fork"):
        return None
    full_name = str(repository.get("full_name") or "")
    if not full_name:
        return None
    try:
        detail = github_request(f"{API_ROOT}/repos/{full_name}", token)
    except (RuntimeError, OSError):
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


def normalize_license(repository: dict[str, Any]) -> dict[str, str] | None:
    """提取仓库许可证名称与 SPDX 标识；无许可证返回 None。"""
    license_info = repository.get("license")
    if not isinstance(license_info, dict):
        return None
    name = str(license_info.get("name") or "").strip()
    spdx = str(license_info.get("spdx_id") or "").strip()
    if not name and not spdx:
        return None
    return {
        "name": name,
        "spdxId": spdx if spdx and spdx != "NOASSERTION" else (name or ""),
    }


def normalize_repository(
    repository: dict[str, Any],
    owner: str,
    *,
    commit_count: int | None = None,
    recent_commit_count: int | None = None,
    last_matched_commit_at: str | None = None,
    upstream: dict[str, str] | None = None,
    recent_release_at: str | None = None,
    open_issues: int | None = None,
    open_pull_requests: int | None = None,
    watchers: int | None = None,
    issues: list[dict[str, Any]] | None = None,
    pull_requests: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """裁剪 GitHub 响应，只保留公开网页所需且稳定的字段。"""
    name = str(repository.get("name") or "").strip()
    has_pages = bool(repository.get("has_pages"))
    topics = repository.get("topics") if isinstance(repository.get("topics"), list) else []
    description_raw = str(repository.get("description") or "").strip()
    language = str(repository.get("language") or "").strip() or None
    return {
        "id": int(repository.get("id") or 0),
        "name": name,
        "fullName": str(repository.get("full_name") or f"{owner}/{name}"),
        "description": description_raw or fallback_description(repository),
        "descriptionSource": "github" if description_raw else "generated-fallback",
        "repoUrl": str(repository.get("html_url") or f"https://github.com/{owner}/{name}"),
        "pagesUrl": derived_pages_url(owner, name) if has_pages else None,
        "hasPages": has_pages,
        "homepage": str(repository.get("homepage") or "").strip() or None,
        "language": language,
        "languages": [language] if language else [],
        "topics": [str(topic) for topic in topics if str(topic).strip()][:12],
        "license": normalize_license(repository),
        "fork": bool(repository.get("fork")),
        "archived": bool(repository.get("archived")),
        "disabled": bool(repository.get("disabled")),
        "stars": int(repository.get("stargazers_count") or 0),
        "forks": int(repository.get("forks_count") or 0),
        "watchers": watchers if isinstance(watchers, int) else int(repository.get("subscribers_count") or 0),
        "openIssues": open_issues if isinstance(open_issues, int) else int(repository.get("open_issues_count") or 0),
        "openPullRequests": open_pull_requests if isinstance(open_pull_requests, int) else None,
        "issues": issues or [],
        "pullRequests": pull_requests or [],
        "defaultBranch": str(repository.get("default_branch") or "main"),
        "sizeKb": int(repository.get("size") or 0),
        "createdAt": str(repository.get("created_at") or ""),
        "commitCount": commit_count,
        "recentCommitCount": recent_commit_count,
        "lastMatchedCommitAt": last_matched_commit_at,
        "recentReleaseAt": recent_release_at,
        "commitScope": "仓库默认分支提交总数",
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
        "license": normalize_license(repository),
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
    recent_commit_counts: dict[str, int | None] | None = None,
    last_matched_commit_at: dict[str, str | None] | None = None,
    upstreams: dict[str, dict[str, str] | None] | None = None,
    open_issues: dict[str, int | None] | None = None,
    open_pull_requests: dict[str, int | None] | None = None,
    issues_by_repository: dict[str, list[dict[str, Any]]] | None = None,
    pull_requests_by_repository: dict[str, list[dict[str, Any]]] | None = None,
    starred_repositories: list[dict[str, Any]] | None = None,
    excluded_repositories: int = 0,
    activity_window_days: int = 30,
) -> dict[str, Any]:
    """构造可被前端直接读取的稳定项目索引。"""
    commit_counts = commit_counts or {}
    recent_commit_counts = recent_commit_counts or {}
    last_matched_commit_at = last_matched_commit_at or {}
    upstreams = upstreams or {}
    open_issues = open_issues or {}
    open_pull_requests = open_pull_requests or {}
    issues_by_repository = issues_by_repository or {}
    pull_requests_by_repository = pull_requests_by_repository or {}
    projects = [normalize_repository(
        repository,
        owner,
        commit_count=commit_counts.get(str(repository.get("name") or "")),
        recent_commit_count=recent_commit_counts.get(str(repository.get("name") or "")),
        last_matched_commit_at=last_matched_commit_at.get(str(repository.get("name") or "")),
        upstream=upstreams.get(str(repository.get("name") or "")),
        open_issues=open_issues.get(str(repository.get("name") or "")),
        open_pull_requests=open_pull_requests.get(str(repository.get("name") or "")),
        issues=issues_by_repository.get(str(repository.get("name") or "")),
        pull_requests=pull_requests_by_repository.get(str(repository.get("name") or "")),
    ) for repository in repositories]
    projects.sort(key=lambda item: (item["updatedAt"], item["name"].casefold()), reverse=True)
    starred = [normalize_starred(repository) for repository in (starred_repositories or [])]
    starred.sort(key=lambda item: (item["updatedAt"], item["fullName"].casefold()), reverse=True)
    known_commit_total = sum(project["commitCount"] for project in projects if isinstance(project["commitCount"], int))
    recent_commit_total = sum(project["recentCommitCount"] for project in projects if isinstance(project["recentCommitCount"], int))
    unknown_commit_repositories = sum(project["commitCount"] is None for project in projects)
    languages = [language for project in projects if (language := project.get("language"))]
    licenses = [license_info for project in projects if (license_info := project.get("license"))]
    return {
        "schemaVersion": "1.1.0",
        "owner": owner,
        "generatedAt": generated_at or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": f"https://api.github.com/users/{owner}/repos",
        "commitScope": "按每个公开仓库默认分支统计提交总数；不含其他分支或未推送提交。",
        "activityWindowDays": activity_window_days,
        "summary": {
            "repositories": len(projects),
            "owned": sum(not project["fork"] for project in projects),
            "forked": sum(project["fork"] for project in projects),
            "pages": sum(project["hasPages"] for project in projects),
            "matchedDefaultBranchCommits": known_commit_total,
            "recentMatchedDefaultBranchCommits": recent_commit_total,
            "unknownCommitRepositories": unknown_commit_repositories,
            "stars": sum(project["stars"] for project in projects),
            "forks": sum(project["forks"] for project in projects),
            "watchers": sum(project["watchers"] for project in projects),
            "openIssues": sum(project["openIssues"] for project in projects),
            "openPullRequests": sum(project["openPullRequests"] for project in projects if isinstance(project["openPullRequests"], int)),
            "languages": sorted({language for language in languages if language}),
            "licenses": sorted({license_info["name"] for license_info in licenses if license_info.get("name")}),
            "starred": len(starred),
            "excludedRepositories": excluded_repositories,
        },
        "projects": projects,
        "starred": starred,
    }


def recent_release_at(owner: str, repository_name: str, token: str | None = None) -> str | None:
    """读取仓库最近一次 Release 的发布时间；无 Release 或失败返回 None。"""
    query = urllib.parse.urlencode({"per_page": 1})
    url = f"{API_ROOT}/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repository_name)}/releases?{query}"
    try:
        payload = github_request(url, token)
    except RuntimeError:
        return None
    if not isinstance(payload, list) or not payload:
        return None
    latest = payload[0]
    if not isinstance(latest, dict):
        return None
    return str(latest.get("published_at") or "") or None


def open_pull_request_count(owner: str, repository_name: str, token: str | None = None) -> int | None:
    """统计开放 PR；失败时返回未知，避免把抓取失败伪装成零。"""
    query = urllib.parse.urlencode({"state": "open", "per_page": 1})
    url = f"{API_ROOT}/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repository_name)}/pulls?{query}"
    try:
        payload, headers = github_request_with_headers(url, token)
    except (RuntimeError, OSError):
        return None
    if not isinstance(payload, list):
        return None
    last_page = last_page_from_link(headers.get("link", ""))
    return last_page if last_page is not None else len(payload)


def list_open_work_items(owner: str, repository_name: str, token: str | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """读取仓库最近开放的 Issue 与 PR，供前端监测；失败时返回空列表。"""
    query = urllib.parse.urlencode({"state": "open", "sort": "updated", "direction": "desc", "per_page": 100})
    url = f"{API_ROOT}/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repository_name)}/issues?{query}"
    try:
        payload = github_request(url, token)
    except RuntimeError:
        return [], []
    if not isinstance(payload, list):
        return [], []
    issues: list[dict[str, Any]] = []
    pull_requests: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        target = pull_requests if isinstance(item.get("pull_request"), dict) else issues
        labels = item.get("labels") if isinstance(item.get("labels"), list) else []
        user = item.get("user") if isinstance(item.get("user"), dict) else {}
        target.append({
            "number": int(item.get("number") or 0),
            "title": str(item.get("title") or "").strip(),
            "url": str(item.get("html_url") or ""),
            "updatedAt": str(item.get("updated_at") or ""),
            "createdAt": str(item.get("created_at") or ""),
            "author": str(user.get("login") or ""),
            "labels": [str(label.get("name") or "") for label in labels if isinstance(label, dict) and str(label.get("name") or "").strip()][:6],
            "draft": bool(item.get("draft")),
        })
    return issues, pull_requests


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a public GitHub project index for the static site.")
    parser.add_argument("--owner", required=True, help="GitHub user or organization name.")
    parser.add_argument("--output", type=Path, default=Path("data/github-projects.json"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    excluded = parse_excluded_repositories(os.environ.get("HIDDEN_GITHUB_REPOSITORIES", ""))
    repositories, excluded_count = filter_excluded_repositories(
        list_public_repositories(args.owner, token),
        excluded,
    )
    commit_counts = {
        str(repository.get("name") or ""): default_branch_commit_count(args.owner, str(repository.get("name") or ""), token)
        for repository in repositories
    }
    activity_window_days = 30
    activity_since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=activity_window_days)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    recent_activity = {
        str(repository.get("name") or ""): recent_default_branch_activity(
            args.owner,
            str(repository.get("name") or ""),
            activity_since,
            token,
        )
        for repository in repositories
    }
    recent_commit_counts = {name: activity[0] for name, activity in recent_activity.items()}
    last_matched_commit_at = {name: activity[1] for name, activity in recent_activity.items()}
    upstreams = {
        str(repository.get("name") or ""): fork_upstream(repository, token)
        for repository in repositories if repository.get("fork")
    }
    # 只为自建项目读取最近 Release，避免对 Fork / Star 仓库产生额外请求。
    recent_releases = {
        str(repository.get("name") or ""): recent_release_at(args.owner, str(repository.get("name") or ""), token)
        for repository in repositories if not repository.get("fork")
    }
    # GitHub 的 open_issues_count 包含 PR；单独读取开放 PR 后相减，才是页面应展示的开放 Issue。
    open_pull_requests = {
        str(repository.get("name") or ""): open_pull_request_count(args.owner, str(repository.get("name") or ""), token)
        for repository in repositories
    }
    open_issues = {
        str(repository.get("name") or ""): max(0, int(repository.get("open_issues_count") or 0) - pull_count)
        if isinstance(pull_count, int) else None
        for repository in repositories
        if (pull_count := open_pull_requests.get(str(repository.get("name") or ""))) is not None
    }
    work_items = {
        str(repository.get("name") or ""): list_open_work_items(args.owner, str(repository.get("name") or ""), token)
        for repository in repositories
    }
    issues_by_repository = {name: items[0] for name, items in work_items.items()}
    pull_requests_by_repository = {name: items[1] for name, items in work_items.items()}
    starred_repositories, _ = filter_excluded_repositories(
        list_starred_repositories(args.owner, token),
        excluded,
    )
    payload = build_payload(
        repositories,
        args.owner,
        commit_counts=commit_counts,
        recent_commit_counts=recent_commit_counts,
        last_matched_commit_at=last_matched_commit_at,
        upstreams=upstreams,
        open_issues=open_issues,
        open_pull_requests=open_pull_requests,
        issues_by_repository=issues_by_repository,
        pull_requests_by_repository=pull_requests_by_repository,
        starred_repositories=starred_repositories,
        excluded_repositories=excluded_count,
        activity_window_days=activity_window_days,
    )
    # 把最近 Release 时间写回项目对象。
    for project in payload["projects"]:
        if not project["fork"]:
            project["recentReleaseAt"] = recent_releases.get(project["name"])
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
