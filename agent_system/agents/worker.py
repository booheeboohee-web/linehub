"""Worker: サブタスクのローカル実行(完全ローカル)。

plan.json に定義された宣言的なタスクを core/safe_file_ops.py 経由で実行する。
- 編集は workspace/ 配下のみ、デフォルト dry-run、--apply 時のみ実編集
- human_review タスクは何も実行せず「人間確認が必要」と記録するだけ
"""

from __future__ import annotations

import logging

from core.safe_file_ops import FileOpResult, SafeFileOps

logger = logging.getLogger(__name__)


class Worker:
    """作業担当: 宣言的タスクを安全なファイル操作に変換して実行する。"""

    def __init__(self, file_ops: SafeFileOps):
        self.file_ops = file_ops

    def execute(self, task: dict) -> FileOpResult:
        action = task["action"]
        logger.info("Worker 実行: action=%s path=%s", action, task.get("path", "-"))

        if action == "write_file":
            return self.file_ops.write_file(task["path"], task["content"])
        if action == "append_file":
            return self.file_ops.append_file(task["path"], task["content"])
        if action == "replace_text":
            return self.file_ops.replace_text(task["path"], task["old"], task["new"])
        if action == "human_review":
            # 自動処理は行わない。ログと結果に「人間確認が必要」と残すのみ。
            note = task["note"]
            logger.warning("人間確認が必要: %s", note)
            return FileOpResult(
                ok=True,
                action="human_review",
                path="-",
                detail=f"人間確認が必要: {note}",
            )

        return FileOpResult(
            ok=False, action=action, path=task.get("path", "-"),
            detail=f"未対応のアクション: {action}",
        )
