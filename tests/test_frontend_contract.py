"""验证 GitHub 项目画像的 DOM、筛选入口与部署契约。"""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendContractTests(unittest.TestCase):
    """覆盖页面入口、真实索引汇总和定时部署配置。"""

    def test_github_profile_controls_are_wired(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        for element_id in (
            "projectOwnedCount",
            "projectForkCount",
            "projectCommitCount",
            "projectStarredCount",
            "projectGrid",
            "commitScope",
            "navProjects",
        ):
            self.assertIn(f'id="{element_id}"', html)
            self.assertIn(f'"{element_id}"', script)
        for project_filter in ("owned", "pages", "forks", "starred"):
            self.assertIn(f'data-project-filter="{project_filter}"', html)

    def test_knowledge_map_is_wired_to_existing_sources(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        app_script = (ROOT / "app.js").read_text(encoding="utf-8")
        map_script = (ROOT / "knowledge-map.js").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(encoding="utf-8")
        relations = json.loads((ROOT / "data" / "relations.json").read_text(encoding="utf-8"))

        self.assertIn('data-view="map"', html)
        self.assertIn('id="knowledgeMapGraph"', html)
        self.assertIn('src="knowledge-map.js"', html)
        self.assertIn('fetch("data/relations.json"', app_script)
        self.assertIn("function buildKnowledgeMapGraph()", map_script)
        self.assertIn("getFilteredNotes()", map_script)
        self.assertIn("state.projects.filter", map_script)
        self.assertIn("knowledge-map.js", workflow)
        self.assertIn("data/relations.json", workflow)
        self.assertGreater(len(relations["relations"]), 0)

    def test_explicit_relation_endpoints_exist(self) -> None:
        notes = json.loads((ROOT / "data" / "notes.json").read_text(encoding="utf-8"))["notes"]
        projects = json.loads((ROOT / "data" / "github-projects.json").read_text(encoding="utf-8"))["projects"]
        relations = json.loads((ROOT / "data" / "relations.json").read_text(encoding="utf-8"))["relations"]
        known = {
            "note": {note["id"] for note in notes},
            "project": {project["name"] for project in projects if not project["fork"]},
        }
        relation_ids: set[str] = set()
        for relation in relations:
            self.assertNotIn(relation["id"], relation_ids)
            relation_ids.add(relation["id"])
            self.assertIn(relation["sourceId"], known[relation["sourceType"]])
            self.assertIn(relation["targetId"], known[relation["targetType"]])
            self.assertTrue(relation["relation"].strip())

    def test_generated_summary_matches_project_arrays(self) -> None:
        payload = json.loads((ROOT / "data" / "github-projects.json").read_text(encoding="utf-8"))
        projects = payload["projects"]
        summary = payload["summary"]
        self.assertEqual(summary["repositories"], len(projects))
        self.assertEqual(summary["owned"], sum(not project["fork"] for project in projects))
        self.assertEqual(summary["forked"], sum(project["fork"] for project in projects))
        self.assertEqual(summary["starred"], len(payload["starred"]))
        self.assertEqual(
            summary["matchedDefaultBranchCommits"],
            sum(project["commitCount"] for project in projects if isinstance(project["commitCount"], int)),
        )

    def test_workflow_refreshes_daily_without_committing(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(encoding="utf-8")
        self.assertIn('cron: "20 2 * * *"', workflow)
        self.assertIn("sync_github_projects.py", workflow)
        self.assertIn("vars.HIDDEN_GITHUB_REPOSITORIES", workflow)
        self.assertIn("cp data/github-projects.json _site/data/", workflow)
        self.assertNotIn("git commit", workflow)
        self.assertNotIn("contents: write", workflow)

    def test_generated_index_records_exclusions_without_publishing_names(self) -> None:
        payload = json.loads((ROOT / "data" / "github-projects.json").read_text(encoding="utf-8"))
        self.assertIsInstance(payload["summary"].get("excludedRepositories"), int)
        self.assertNotIn("excludedRepositoryNames", payload)

    def test_project_index_failure_does_not_block_notes(self) -> None:
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("项目索引是辅助数据，失败时不阻断核心笔记目录", script)
        self.assertLess(script.index('fetch("data/notes.json"'), script.index('fetch("data/github-projects.json"'))


if __name__ == "__main__":
    unittest.main()
