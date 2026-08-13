"""验证 GitHub 项目索引的数据裁剪与 Pages 地址规则。"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


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
            starred_repositories=[repository],
        )

        self.assertEqual(payload["owner"], "Starline")
        self.assertEqual(payload["projects"][0]["pagesUrl"], "https://starline.github.io/course-note/")
        self.assertNotIn("private", payload["projects"][0])
        self.assertFalse(payload["projects"][0]["fork"])
        self.assertEqual(payload["projects"][0]["commitCount"], 4)
        self.assertEqual(payload["summary"]["matchedDefaultBranchCommits"], 4)
        self.assertEqual(payload["summary"]["starred"], 1)

    def test_user_site_uses_root_pages_url(self) -> None:
        self.assertEqual(
            MODULE.derived_pages_url("Starline", "starline.github.io"),
            "https://starline.github.io/",
        )

    def test_link_header_returns_commit_count(self) -> None:
        link = '<https://api.github.com/repositories/1/commits?per_page=1&page=7>; rel="last"'
        self.assertEqual(MODULE.last_page_from_link(link), 7)


if __name__ == "__main__":
    unittest.main()
