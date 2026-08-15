"""验证 GitHub 项目索引的数据裁剪与 Pages 地址规则。"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("sync_github_projects", ROOT / "scripts" / "sync_github_projects.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GitHubProjectIndexTests(unittest.TestCase):
    """覆盖公开字段、fork 标识和标准 Pages URL。"""

    def test_build_payload_keeps_public_display_fields(self) -> None:
        repository = {
            "id": 7,
            "name": "course-note",
            "full_name": "Starline/course-note",
            "description": "学习笔记",
            "html_url": "https://github.com/Starline/course-note",
            "has_pages": True,
            "language": "HTML",
            "topics": ["study", "notes"],
            "fork": False,
            "archived": False,
            "stargazers_count": 3,
            "forks_count": 1,
            "default_branch": "main",
            "updated_at": "2026-08-13T00:00:00Z",
            "pushed_at": "2026-08-12T00:00:00Z",
            "private": False,
        }
        payload = MODULE.build_payload(
            [repository],
            "Starline",
            "2026-08-13T01:00:00Z",
            commit_counts={"course-note": 4},
            recent_commit_counts={"course-note": 2},
            last_matched_commit_at={"course-note": "2026-08-12T12:00:00Z"},
            starred_repositories=[repository],
        )

        self.assertEqual(payload["owner"], "Starline")
        self.assertEqual(payload["projects"][0]["pagesUrl"], "https://starline.github.io/course-note/")
        self.assertEqual(payload["projects"][0]["description"], "学习笔记")
        self.assertEqual(payload["projects"][0]["descriptionSource"], "github")
        self.assertNotIn("private", payload["projects"][0])
        self.assertFalse(payload["projects"][0]["fork"])
        self.assertEqual(payload["projects"][0]["commitCount"], 4)
        self.assertEqual(payload["projects"][0]["recentCommitCount"], 2)
        self.assertEqual(payload["projects"][0]["lastMatchedCommitAt"], "2026-08-12T12:00:00Z")
        self.assertEqual(payload["summary"]["matchedDefaultBranchCommits"], 4)
        self.assertEqual(payload["summary"]["recentMatchedDefaultBranchCommits"], 2)
        self.assertEqual(payload["activityWindowDays"], 30)
        self.assertEqual(payload["summary"]["starred"], 1)

    def test_user_site_uses_root_pages_url(self) -> None:
        self.assertEqual(
            MODULE.derived_pages_url("Starline", "starline.github.io"),
            "https://starline.github.io/",
        )

    def test_missing_description_gets_explicit_fallback(self) -> None:
        repository = {
            "id": 8,
            "name": "starline-learning-view",
            "full_name": "FreeCodeCampXYG/starline-learning-view",
            "description": None,
            "html_url": "https://github.com/FreeCodeCampXYG/starline-learning-view",
            "has_pages": True,
            "language": "CSS",
            "fork": False,
            "updated_at": "2026-08-13T00:00:00Z",
        }

        project = MODULE.normalize_repository(repository, "FreeCodeCampXYG")

        self.assertIn("学习笔记网页", project["description"])
        self.assertEqual(project["descriptionSource"], "generated-fallback")

    def test_link_header_returns_commit_count(self) -> None:
        link = '<https://api.github.com/repositories/1/commits?per_page=1&page=7>; rel="last"'
        self.assertEqual(MODULE.last_page_from_link(link), 7)

    def test_recent_activity_returns_count_and_latest_commit_time(self) -> None:
        payload = [{"commit": {"author": {"date": "2026-08-14T03:00:00Z"}}}]
        headers = {"link": '<https://api.github.com/repositories/1/commits?per_page=1&page=4>; rel="last"'}

        with patch.object(MODULE, "github_request_with_headers", return_value=(payload, headers)):
            count, latest_commit_at = MODULE.recent_default_branch_activity(
                "Starline",
                "course-note",
                "2026-07-16T00:00:00Z",
            )

        self.assertEqual(count, 4)
        self.assertEqual(latest_commit_at, "2026-08-14T03:00:00Z")

    def test_hidden_repository_is_excluded_by_name_or_full_name(self) -> None:
        repositories = [
            {"name": "public-note", "full_name": "Starline/public-note"},
            {"name": "old-personal-page", "full_name": "Starline/old-personal-page"},
            {"name": "private-memory", "full_name": "Starline/private-memory"},
        ]
        excluded = MODULE.parse_excluded_repositories(
            "old-personal-page, STARLINE/private-memory\n"
        )

        visible, excluded_count = MODULE.filter_excluded_repositories(repositories, excluded)

        self.assertEqual([repository["name"] for repository in visible], ["public-note"])
        self.assertEqual(excluded_count, 2)


if __name__ == "__main__":
    unittest.main()
