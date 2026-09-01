import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("sync_relations", ROOT / "scripts" / "sync_relations.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class RelationSyncTests(unittest.TestCase):
    def test_tag_and_language_overlap_generates_explainable_relation(self):
        notes = [{"id": "n1", "title": "Prompt 工程", "summary": "构造稳定提示词", "categoryPath": ["AI", "Prompt 工程"], "tags": ["Python", "Prompt"]}]
        projects = [{"name": "prompt-tools", "description": "Python prompt workflow", "languages": ["Python"], "topics": []}]
        relations = MODULE.infer_relations(notes, projects)
        self.assertEqual(len(relations), 1)
        self.assertEqual(relations[0]["origin"], "derived")
        self.assertIn("python", relations[0]["evidence"])

    def test_manual_relations_are_preserved_and_old_derived_replaced(self):
        payload = MODULE.build_payload(
            {"notes": []}, {"projects": []},
            {"relations": [
                {"id": "manual", "sourceType": "note", "sourceId": "n", "targetType": "project", "targetId": "p"},
                {"id": "old", "origin": "derived"},
            ]},
        )
        self.assertEqual([item["id"] for item in payload["relations"]], ["manual"])


if __name__ == "__main__":
    unittest.main()
