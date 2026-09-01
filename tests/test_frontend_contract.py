"""验证 GitHub 项目画像的 DOM、筛选入口与部署契约。"""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendContractTests(unittest.TestCase):
    """覆盖页面入口、真实索引汇总和定时部署配置。"""

    def test_mit_license_and_repository_governance_are_present(self) -> None:
        """许可证、版权主体和协作模板应保持可追溯。"""
        license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(encoding="utf-8")

        self.assertTrue(license_text.startswith("MIT License"))
        self.assertIn("Copyright (c) 2026 StarLine (GitHub: FreeCodeCampXYG)", license_text)
        self.assertIn("Permission is hereby granted, free of charge", license_text)
        self.assertIn("[MIT License](LICENSE)", readme)
        self.assertIn("Copyright © 2026 StarLine", readme)
        self.assertIn("第三方内容", readme)
        self.assertIn('<a href="LICENSE">MIT License</a>', html)
        self.assertIn("project-map.js LICENSE _site/", workflow)
        for relative_path in (
            ".github/ISSUE_TEMPLATE/bug_report.yml",
            ".github/ISSUE_TEMPLATE/feature_request.yml",
            ".github/ISSUE_TEMPLATE/config.yml",
            ".github/PULL_REQUEST_TEMPLATE.md",
        ):
            self.assertTrue((ROOT / relative_path).is_file(), relative_path)

    def test_github_profile_controls_are_wired(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        for element_id in (
            "projectOwnedCount",
            "projectForkCount",
            "projectCommitCount",
            "projectCommitLabel",
            "projectCommitHint",
            "projectStarredCount",
            "projectFreshness",
            "projectGrid",
            "commitScope",
            "navProjects",
        ):
            self.assertIn(f'id="{element_id}"', html)
            self.assertIn(f'"{element_id}"', script)
        for project_filter in ("owned", "pages", "forks", "starred", "issues", "pulls", "map"):
            self.assertIn(f'data-project-filter="{project_filter}"', html)
        self.assertLess(html.index('<section class="project-section"'), html.index('<section class="library-section"'))
        self.assertIn('id="collapseSidebar"', html)
        self.assertIn('id="openSidebarLabel"', html)
        self.assertIn('id="sidebarScroll"', html)
        self.assertIn('id="actionMenu"', html)
        self.assertIn("function toggleSidebar", script)
        self.assertIn("function closeActionMenu", script)
        self.assertIn("sidebar-collapsed", script)
        self.assertIn("body.sidebar-collapsed .app-shell", styles)
        self.assertIn(".action-menu:not([open]) > .action-menu-panel", styles)
        self.assertIn("scrollbar-gutter: stable", styles)

    def test_home_readme_and_maintenance_guides_are_visible(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "styles.css").read_text(encoding="utf-8")

        self.assertIn('id="readmeHeading"', html)
        for element_id in ("projectMaintenanceFocus", "projectMaintenanceSummary", "projectMaintenanceList"):
            self.assertIn(f'id="{element_id}"', html)
            self.assertIn(f'"{element_id}"', script)
        for destination in ("notes", "knowledge-map", "project-map"):
            self.assertIn(f'data-readme-action="{destination}"', html)
        self.assertIn("https://freecodecampxyg.github.io/starline-learning-view/", html)
        self.assertIn('href="data/notes.json"', html)
        self.assertIn('href="data/github-projects.json"', html)
        self.assertIn("function getProjectMaintenanceState", script)
        self.assertIn(".readme-strip", styles)
        self.assertIn(".project-card.is-maintenance-active", styles)

    def test_project_intro_and_readme_guides_are_published(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(encoding="utf-8")
        guides = json.loads((ROOT / "data" / "project-guides.json").read_text(encoding="utf-8"))

        self.assertIn('id="projectSpotlight"', html)
        self.assertIn('"projectSpotlight"', script)
        self.assertIn('fetch("data/project-guides.json"', script)
        self.assertIn("function validateProjectGuidesPayload", script)
        self.assertIn("#readme", script)
        self.assertIn("project-guides.json", workflow)
        guide = guides["projects"]["starline-learning-view"]
        self.assertGreaterEqual(len(guide["capabilities"]), 3)
        self.assertGreaterEqual(len(guide["readmeGuide"]), 4)
        self.assertTrue(all(item["url"].startswith("https://github.com/") for item in guide["readmeGuide"]))

    def test_project_map_uses_public_index_without_client_credentials(self) -> None:
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        app_script = (ROOT / "app.js").read_text(encoding="utf-8")
        map_script = (ROOT / "project-map.js").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(encoding="utf-8")

        for element_id in ("projectRelationMap", "projectMapGraph", "projectMapScope", "projectMapDetail"):
            self.assertIn(f'id="{element_id}"', html)
            self.assertIn(f'"{element_id}"', app_script)
        self.assertIn('src="project-map.js"', html)
        self.assertIn("function buildProjectMapGraph(scope)", map_script)
        self.assertIn("state.projects", map_script)
        self.assertIn("state.starredProjects", map_script)
        self.assertIn("project.upstream", map_script)
        self.assertIn("project-map.js", workflow)
        self.assertNotIn("api.github.com", map_script)
        self.assertNotIn("Authorization", map_script)

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

    def test_workflow_refreshes_every_six_hours_without_committing(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(encoding="utf-8")
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        sync_script = (ROOT / "scripts" / "sync_github_projects.py").read_text(encoding="utf-8")
        self.assertIn('cron: "17 */6 * * *"', workflow)
        self.assertIn("sync_github_projects.py", workflow)
        self.assertIn("recent_default_branch_activity", sync_script)
        self.assertIn('"recentCommitCount"', sync_script)
        self.assertIn("function getProjectDataFreshness", script)
        self.assertIn("recentCommitCount", script)
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

    def test_changelog_is_present_and_valid(self) -> None:
        """变更记录 JSON 和页面契约应完整。"""
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(encoding="utf-8")
        changelog = json.loads((ROOT / "data" / "changelog.json").read_text(encoding="utf-8"))

        # HTML 包含时间线区块
        self.assertIn('id="changelogHeading"', html)
        self.assertIn('id="changelogStatus"', html)
        self.assertIn('id="changelogTabFeatures"', html)
        self.assertIn('id="changelogTabSystem"', html)
        self.assertIn('id="timeline"', html)
        self.assertIn('id="timelineEmpty"', html)
        # 脚本包含 changelog 渲染函数
        self.assertIn("function renderChangelog()", script)
        self.assertIn("function validateChangelogPayload", script)
        self.assertIn("function renderTimelineItem", script)
        self.assertIn("function activateChangelogSection", script)
        # 工作流包含 changelog
        self.assertIn("changelog.json", workflow)
        # 数据完整性
        self.assertIn("schemaVersion", changelog)
        self.assertGreaterEqual(len(changelog["sections"]), 2)
        self.assertGreaterEqual(len(changelog["entries"]), 10)
        section_ids = {section["id"] for section in changelog["sections"]}
        for entry in changelog["entries"]:
            self.assertIn(entry["section"], section_ids)
            self.assertIn("id", entry)
            self.assertIn("date", entry)
            self.assertIn("title", entry)
            self.assertIn("summary", entry)

    def test_index_contains_new_fields(self) -> None:
        """新索引应包含 license、languages、openIssues 等字段。"""
        payload = json.loads((ROOT / "data" / "github-projects.json").read_text(encoding="utf-8"))
        self.assertIn("languages", payload["summary"])
        self.assertIn("licenses", payload["summary"])
        for project in payload["projects"]:
            self.assertIn("license", project)
            self.assertIn("languages", project)
            self.assertIn("openIssues", project)
            self.assertIn("createdAt", project)
            self.assertIn("sizeKb", project)
            self.assertIn("watchers", project)
            self.assertIn("recentReleaseAt", project)
            self.assertIn("disabled", project)

    def test_global_search_and_activity_metrics_are_wired(self) -> None:
        """搜索反馈、清空入口和近期活动统计必须由同一份公开索引驱动。"""
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "app.js").read_text(encoding="utf-8")
        for element_id in ("clearSearch", "searchMeta", "projectIssueCount", "projectPullRequestCount"):
            self.assertIn(f'id="{element_id}"', html)
        self.assertIn("renderSearchMeta", script)
        self.assertIn("projectMatchesQuery", script)
        self.assertIn("openPullRequests", script)
        self.assertIn("projectWorkItems", html)
        self.assertIn("renderProjectWorkItems", script)


if __name__ == "__main__":
    unittest.main()
