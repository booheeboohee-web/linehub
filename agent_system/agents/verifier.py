"""Verifier: Worker から独立した検証(完全ローカル)。

Worker の内部状態を一切共有せず、タスク定義(plan.json の verify 条件)と
実行結果だけを突き合わせて合否を判定する。

- apply モードでは実ファイルを読み直して検証(Worker の申告を信用しない)
- dry-run では書き込み予定内容(new_content)を検証
- 成果物に機密情報らしき文字列が残っていれば不合格
- 画像ファイルが対象の場合、Vision チェックは実装しない。
  「人間確認が必要」とログ・STATE.md に記録するだけにする。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from core import redactor, security
from core.safe_file_ops import FileOpResult
from core.state_manager import StateManager

logger = logging.getLogger(__name__)

_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}


@dataclass
class VerificationResult:
    passed: bool
    feedback: str


class Verifier:
    """独立検証担当。Worker とはオブジェクトも状態も共有しない。"""

    def __init__(self, workspace: Path, state: StateManager):
        self.workspace = Path(workspace)
        self.state = state

    def verify(self, task: dict, result: FileOpResult) -> VerificationResult:
        # 実行自体が失敗していれば不合格
        if not result.ok:
            return VerificationResult(passed=False, feedback=result.detail)

        # human_review は自動検証の対象外。人間確認待ちとして記録する。
        if task["action"] == "human_review":
            note = task["note"]
            logger.warning("人間確認が必要: %s", note)
            self.state.add_pending_review(note)
            return VerificationResult(
                passed=True, feedback=f"自動検証対象外(人間確認待ち): {note}"
            )

        # 画像が対象なら Vision チェックは行わず、人間確認を要求するだけ
        path = task.get("path", "")
        if Path(path).suffix.lower() in _IMAGE_SUFFIXES:
            note = f"画像 {path} の内容確認(Vision チェックは行いません)"
            logger.warning("人間確認が必要: %s", note)
            self.state.add_pending_review(note)
            return VerificationResult(
                passed=True, feedback=f"画像のため自動検証をスキップ。{note}"
            )

        # 検証対象の内容を取得
        # - apply 済み: 実ファイルを読み直す(独立性の担保)
        # - dry-run:   書き込み予定内容を検証する
        if result.applied:
            try:
                content = security.read_workspace_text(path, self.workspace)
            except (OSError, security.SecurityError) as e:
                return VerificationResult(
                    passed=False, feedback=f"成果物ファイルを読み取れません: {e}"
                )
        else:
            content = result.new_content
            if content is None:
                return VerificationResult(
                    passed=False, feedback="検証対象の内容がありません"
                )

        # plan.json の verify 条件と照合
        checks = task.get("verify", {})
        for needle in checks.get("contains", []):
            if needle not in content:
                return VerificationResult(
                    passed=False, feedback=f"'{needle}' が成果物に含まれていません"
                )
        for needle in checks.get("not_contains", []):
            if needle in content:
                return VerificationResult(
                    passed=False, feedback=f"禁止文字列 '{needle}' が成果物に含まれています"
                )

        # 機密情報が成果物に残っていないことの最終確認
        if redactor.contains_sensitive(content):
            return VerificationResult(
                passed=False,
                feedback="機密情報らしき文字列が成果物に含まれています",
            )

        return VerificationResult(passed=True, feedback="全検証条件を満たしています")
