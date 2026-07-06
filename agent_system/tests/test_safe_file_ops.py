"""安全なファイル操作のテスト。

- --apply なし(dry-run)では実ファイルを一切変更しない
- --apply 時のみ実編集し、編集前に backups/ へバックアップする
- workspace 外のパスは拒否する
- 機密情報を含む内容は redact してから書き込む
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from core.safe_file_ops import SafeFileOps  # noqa: E402
from core.security import SecurityError  # noqa: E402


class SafeFileOpsTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.workspace = root / "workspace"
        self.backups = root / "backups"
        self.workspace.mkdir()

    def tearDown(self):
        self.tmp.cleanup()


class TestDryRun(SafeFileOpsTestBase):
    def test_write_file_does_not_touch_disk(self):
        ops = SafeFileOps(self.workspace, self.backups, apply=False)
        result = ops.write_file("notes/a.md", "hello")
        self.assertTrue(result.ok)
        self.assertFalse(result.applied)
        self.assertEqual(result.new_content, "hello")
        self.assertFalse((self.workspace / "notes" / "a.md").exists())

    def test_replace_text_does_not_touch_disk(self):
        target = self.workspace / "a.md"
        target.write_text("before", encoding="utf-8")
        ops = SafeFileOps(self.workspace, self.backups, apply=False)
        result = ops.replace_text("a.md", "before", "after")
        self.assertTrue(result.ok)
        self.assertFalse(result.applied)
        self.assertEqual(target.read_text(encoding="utf-8"), "before")  # 変更されない

    def test_chained_tasks_use_pending_overlay(self):
        """dry-run でも前段の書き込み予定を後続タスクが参照できる。"""
        ops = SafeFileOps(self.workspace, self.backups, apply=False)
        ops.write_file("a.md", "hello world")
        result = ops.replace_text("a.md", "world", "dry-run")
        self.assertTrue(result.ok)
        self.assertEqual(result.new_content, "hello dry-run")
        self.assertFalse((self.workspace / "a.md").exists())  # 実ファイルは無いまま


class TestApply(SafeFileOpsTestBase):
    def test_write_file_creates_file(self):
        ops = SafeFileOps(self.workspace, self.backups, apply=True)
        result = ops.write_file("notes/a.md", "hello")
        self.assertTrue(result.applied)
        self.assertEqual(
            (self.workspace / "notes" / "a.md").read_text(encoding="utf-8"), "hello"
        )

    def test_overwrite_creates_backup_first(self):
        target = self.workspace / "a.md"
        target.write_text("original", encoding="utf-8")
        ops = SafeFileOps(self.workspace, self.backups, apply=True)
        result = ops.write_file("a.md", "updated")
        self.assertTrue(result.applied)
        backups = list(self.backups.rglob("a.md"))
        self.assertEqual(len(backups), 1, "バックアップが作成されていません")
        self.assertEqual(backups[0].read_text(encoding="utf-8"), "original")
        self.assertEqual(target.read_text(encoding="utf-8"), "updated")

    def test_append_file(self):
        target = self.workspace / "a.md"
        target.write_text("line1\n", encoding="utf-8")
        ops = SafeFileOps(self.workspace, self.backups, apply=True)
        ops.append_file("a.md", "line2\n")
        self.assertEqual(target.read_text(encoding="utf-8"), "line1\nline2\n")

    def test_sensitive_content_redacted_before_write(self):
        ops = SafeFileOps(self.workspace, self.backups, apply=True)
        result = ops.write_file("a.md", "連絡先: taro@example.com")
        self.assertTrue(result.redacted)
        saved = (self.workspace / "a.md").read_text(encoding="utf-8")
        self.assertNotIn("taro@example.com", saved)
        self.assertIn("[REDACTED]", saved)


class TestBoundary(SafeFileOpsTestBase):
    def test_outside_workspace_rejected(self):
        ops = SafeFileOps(self.workspace, self.backups, apply=True)
        with self.assertRaises(SecurityError):
            ops.write_file("../escape.md", "x")

    def test_forbidden_filename_rejected(self):
        ops = SafeFileOps(self.workspace, self.backups, apply=True)
        with self.assertRaises(SecurityError):
            ops.write_file("secrets.key", "x")

    def test_replace_missing_file_fails_gracefully(self):
        ops = SafeFileOps(self.workspace, self.backups, apply=True)
        result = ops.replace_text("missing.md", "a", "b")
        self.assertFalse(result.ok)
        self.assertIn("存在しません", result.detail)


if __name__ == "__main__":
    unittest.main()
