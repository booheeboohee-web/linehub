"""ループの停止条件のテスト。

- 同一タスクが 3 回連続で失敗したら必ず停止し、人間確認 (NEEDS_HUMAN) を要求する
- 停止時に STATE.md へ失敗履歴と Pending Human Review が記録される
- plan.json が無い場合も NEEDS_HUMAN で停止する
- 全タスク成功時は DONE で終了する
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from agents.orchestrator import Orchestrator  # noqa: E402
from agents.verifier import Verifier  # noqa: E402
from agents.worker import Worker  # noqa: E402
from core.loop import AgentLoop, Phase  # noqa: E402
from core.safe_file_ops import SafeFileOps  # noqa: E402
from core.state_manager import StateManager  # noqa: E402


class LoopTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.workspace = root / "workspace"
        self.backups = root / "backups"
        self.workspace.mkdir()
        self.state_file = root / "STATE.md"
        self.plan_file = self.workspace / "plan.json"

    def tearDown(self):
        self.tmp.cleanup()

    def build_loop(self, apply: bool = False) -> AgentLoop:
        state = StateManager(self.state_file)
        file_ops = SafeFileOps(self.workspace, self.backups, apply=apply)
        return AgentLoop(
            orchestrator=Orchestrator(self.plan_file),
            worker=Worker(file_ops),
            verifier=Verifier(self.workspace, state),
            state=state,
            max_iterations=100,
        )

    def write_plan(self, tasks: list[dict], goal: str = "テスト") -> None:
        self.plan_file.write_text(
            json.dumps({"goal": goal, "tasks": tasks}, ensure_ascii=False),
            encoding="utf-8",
        )


class TestFailureLimit(LoopTestBase):
    def test_stops_after_three_consecutive_failures(self):
        # verify.contains が絶対に満たされないタスク → 常に検証失敗
        self.write_plan(
            [
                {
                    "action": "write_file",
                    "path": "a.md",
                    "content": "hello",
                    "verify": {"contains": ["この文字列は成果物に無い"]},
                }
            ]
        )
        loop = self.build_loop()
        final = loop.run()

        self.assertIs(final, Phase.NEEDS_HUMAN)
        saved = self.state_file.read_text(encoding="utf-8")
        # 失敗が 3 回記録されている
        self.assertEqual(saved.count("reason:"), 3)
        # 人間確認待ちが記録されている
        self.assertIn("人間確認が必要", saved)
        self.assertIn("3 回連続で失敗", saved)

    def test_lessons_distilled_on_failure(self):
        self.write_plan(
            [
                {
                    "action": "write_file",
                    "path": "a.md",
                    "content": "hello",
                    "verify": {"contains": ["絶対に無い文字列"]},
                }
            ]
        )
        loop = self.build_loop()
        loop.run()
        saved = self.state_file.read_text(encoding="utf-8")
        self.assertIn("content_mismatch", saved)  # Distill された教訓


class TestMissingPlan(LoopTestBase):
    def test_missing_plan_stops_with_needs_human(self):
        loop = self.build_loop()  # plan.json を作らない
        final = loop.run()
        self.assertIs(final, Phase.NEEDS_HUMAN)
        saved = self.state_file.read_text(encoding="utf-8")
        self.assertIn("人間確認が必要", saved)


class TestPaidFeatureGate(LoopTestBase):
    """課金が必要な処理は自動実行されず、人間の承認待ちとして記録される。"""

    def test_paid_feature_request_is_not_executed_and_needs_approval(self):
        self.write_plan(
            [
                {
                    "action": "paid_feature_request",
                    "note": "外部モデル呼び出し(archive/api_based の復元)を行いたい",
                },
                {
                    "action": "write_file",
                    "path": "a.md",
                    "content": "通常タスクは続行できる",
                    "verify": {"contains": ["続行できる"]},
                },
            ]
        )
        loop = self.build_loop(apply=True)
        final = loop.run()

        # 課金申請でループ全体は止まらず、通常タスクは完了する
        self.assertIs(final, Phase.DONE)
        # 課金が必要な処理そのものは何も実行されていない(ファイル生成なし等)
        self.assertEqual(
            {p.name for p in self.workspace.rglob("*") if p.is_file()},
            {"plan.json", "a.md"},
        )
        # 人間の承認待ちとして STATE.md に記録されている
        saved = self.state_file.read_text(encoding="utf-8")
        self.assertIn("課金が必要なため人間の承認が必要", saved)
        self.assertIn("未実行", saved)


class TestSuccessPath(LoopTestBase):
    def test_all_tasks_pass_returns_done(self):
        self.write_plan(
            [
                {
                    "action": "write_file",
                    "path": "a.md",
                    "content": "# タイトル\n本文",
                    "verify": {"contains": ["# タイトル"]},
                },
                {"action": "human_review", "note": "a.md を目視確認"},
            ]
        )
        loop = self.build_loop()
        final = loop.run()
        self.assertIs(final, Phase.DONE)
        # dry-run なので実ファイルは作られていない
        self.assertFalse((self.workspace / "a.md").exists())
        # human_review は人間確認待ちとして記録される
        saved = self.state_file.read_text(encoding="utf-8")
        self.assertIn("人間確認が必要", saved)


if __name__ == "__main__":
    unittest.main()
