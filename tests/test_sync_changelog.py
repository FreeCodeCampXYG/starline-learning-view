"""验证 Git 提交到变更记录的自动生成规则。"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("sync_changelog", ROOT / "scripts" / "sync_changelog.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ChangelogSyncTests(unittest.TestCase):
    """覆盖提交标题清理、系统说明保留与自动记录字段。"""

    def test_conventional_commit_is_normalized(self) -> None:
        title, label = MODULE.clean_subject("feat(ui): 新增通知中心")
        self.assertEqual(title, "新增通知中心")
        self.assertEqual(label, "功能")

    def test_build_payload_uses_commit_hash_and_keeps_system_entries(self) -> None:
        payload = MODULE.build_payload(
            [{"hash": "abcdef1234567890", "shortHash": "abcdef1", "date": "2026-09-01T10:00:00+08:00", "subject": "fix: 修复搜索", "body": "补充空状态反馈"}],
            {"sections": [], "entries": [{"id": "system-x", "section": "system", "title": "系统边界", "summary": "保留", "date": "2026-08-01"}]},
            generated_at="2026-09-01T02:00:00Z",
        )
        self.assertEqual(payload["source"], "git log")
        self.assertEqual(payload["entries"][0]["commit"], "abcdef1")
        self.assertEqual(payload["entries"][0]["title"], "修复搜索")
        self.assertEqual(payload["entries"][-1]["id"], "system-x")


if __name__ == "__main__":
    unittest.main()
