"""Orchestrator: タスク計画の読み込み・検証と失敗分析(完全ローカル)。

外部の何かを呼び出すことはない。役割は 3 つ:
- plan:        workspace/plan.json(人間が編集)を読み込み、スキーマ検証する
- investigate: 検証失敗のフィードバックをルールベースで分類し、対処方針を返す
- distill:     分析結果から STATE.md に残す教訓を 1 行に整形する
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

SUPPORTED_ACTIONS = {
    "write_file",
    "append_file",
    "replace_text",
    "human_review",
    "paid_feature_request",
}

# アクションごとの必須フィールド
_REQUIRED_FIELDS: dict[str, list[str]] = {
    "write_file": ["path", "content"],
    "append_file": ["path", "content"],
    "replace_text": ["path", "old", "new"],
    "human_review": ["note"],
    # 課金が必要な処理の申請。自動実行はされず、人間の承認待ちとして記録される
    "paid_feature_request": ["note"],
}


class PlanError(Exception):
    """plan.json の不備。人間による修正が必要。"""


@dataclass
class Investigation:
    category: str
    advice: str


class Orchestrator:
    """統括: 計画の検証と進行管理を担うローカルクラス。"""

    def __init__(self, plan_path: Path):
        self.plan_path = Path(plan_path)

    def plan(self) -> tuple[str, list[dict]]:
        """plan.json を読み込み、(goal, tasks) を返す。

        計画は人間が作成・編集する。ファイルが無い/不正な場合は
        PlanError を送出し、ループは人間確認待ちで停止する。
        """
        if not self.plan_path.exists():
            raise PlanError(
                f"タスク計画 {self.plan_path} がありません。"
                "workspace/plan.example.json を参考に作成してください。"
            )
        try:
            data = json.loads(self.plan_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise PlanError(f"plan.json の JSON 解析に失敗しました: {e}") from e

        goal = data.get("goal", "")
        tasks = data.get("tasks", [])
        if not isinstance(goal, str) or not goal.strip():
            raise PlanError("plan.json に goal(文字列)が必要です")
        if not isinstance(tasks, list) or not tasks:
            raise PlanError("plan.json に tasks(1 件以上の配列)が必要です")

        for i, task in enumerate(tasks):
            self._validate_task(i, task)

        logger.info("計画を読み込みました: goal='%s', %d タスク", goal, len(tasks))
        return goal, tasks

    @staticmethod
    def _validate_task(index: int, task: object) -> None:
        if not isinstance(task, dict):
            raise PlanError(f"tasks[{index}] はオブジェクトである必要があります")
        action = task.get("action")
        if action not in SUPPORTED_ACTIONS:
            raise PlanError(
                f"tasks[{index}].action '{action}' は未対応です"
                f"(対応: {sorted(SUPPORTED_ACTIONS)})"
            )
        for field in _REQUIRED_FIELDS[action]:
            if field not in task:
                raise PlanError(f"tasks[{index}] ({action}) に '{field}' が必要です")

    # ---- 失敗分析(ルールベース) ------------------------------------

    def investigate(self, task: dict, feedback: str) -> Investigation:
        """Verifier のフィードバックを分類し、対処方針を返す。"""
        if "存在しません" in feedback or "見つかりません" in feedback:
            return Investigation(
                category="missing_target",
                advice="対象パス・置換対象の文字列が正しいか plan.json を確認する",
            )
        if "含まれていません" in feedback:
            return Investigation(
                category="content_mismatch",
                advice="verify.contains の条件と content の内容が一致するよう plan.json を修正する",
            )
        if "機密" in feedback:
            return Investigation(
                category="sensitive_content",
                advice="content から認証情報・個人情報を取り除く(このツールは機密情報を扱わない)",
            )
        return Investigation(
            category="unknown",
            advice=f"フィードバックを確認して plan.json を修正する: {feedback[:120]}",
        )

    def distill(self, task: dict, investigation: Investigation) -> str:
        """STATE.md に蓄積する教訓を 1 行に整形する。"""
        return (
            f"[{investigation.category}] action={task.get('action')}: "
            f"{investigation.advice}"
        )
