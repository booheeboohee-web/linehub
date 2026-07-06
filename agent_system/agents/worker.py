"""Worker: 安価・高速モデルによる作業エージェント。

Orchestrator が分割したサブタスクを 1 件ずつ実行する。
セーフティ拒否や恒久エラー時は base.py のフォールバックチェーンにより
上位モデル (claude-sonnet-5) へ自動で切り替わる。
"""

from __future__ import annotations

from agents.base import BaseAgent


class Worker(BaseAgent):
    role = "worker"
    system_prompt = (
        "あなたは自律型エージェントシステムの Worker(作業担当)です。"
        "与えられたサブタスクを 1 件だけ、確実に実行してください。"
        "余計な前置きは不要で、成果物のみを出力してください。"
    )

    def execute(self, subtask: str, goal: str, state_context: str, hint: str = "") -> str:
        """サブタスクを実行し、成果物テキストを返す。

        hint には Investigate フェーズで得た「次の試行で変えるべき点」を渡す。
        """
        parts = [
            f"# 最終ゴール\n{goal}",
            f"# 実行するサブタスク\n{subtask}",
            f"# 参照情報(過去の教訓)\n{state_context}",
        ]
        if hint:
            parts.append(f"# 前回失敗からの改善指示\n{hint}")
        return self._call("\n\n".join(parts))
