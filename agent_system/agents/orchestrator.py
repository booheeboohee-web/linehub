"""Orchestrator: メイン推論モデルによる統括エージェント。

役割:
- plan:        ゴールをサブタスク列に分割する
- investigate: 失敗の原因を調査・分析する
- distill:     調査結果から再利用可能な教訓を 1 行に抽出する
"""

from __future__ import annotations

import json
import logging
import re

from agents.base import BaseAgent

logger = logging.getLogger(__name__)


class Orchestrator(BaseAgent):
    role = "orchestrator"
    system_prompt = (
        "あなたは自律型エージェントシステムの Orchestrator(統括)です。"
        "タスク分割・進行管理・失敗調査を担当します。"
        "指示された出力形式を厳密に守ってください。"
    )

    def plan(self, goal: str, state_context: str) -> list[str]:
        """ゴールを 2〜5 個のサブタスクに分割して返す。"""
        prompt = (
            f"以下のゴールを、Worker エージェントが 1 つずつ実行できる"
            f"2〜5 個のサブタスクに分割してください。\n\n"
            f"# ゴール\n{goal}\n\n"
            f"# 参照情報(過去の教訓)\n{state_context}\n\n"
            f"出力は JSON の文字列配列のみ。説明文は不要です。\n"
            f'例: ["サブタスク1", "サブタスク2"]'
        )
        raw = self._call(prompt)
        return self._parse_task_list(raw)

    def investigate(self, goal: str, subtask: str, output: str, feedback: str) -> str:
        """Fail 後の Investigate: 失敗原因を分析する。"""
        prompt = (
            "サブタスクの実行結果が検証に失敗しました。原因を調査・分析してください。\n\n"
            f"# ゴール\n{goal}\n\n"
            f"# サブタスク\n{subtask}\n\n"
            f"# Worker の出力\n{output}\n\n"
            f"# Verifier のフィードバック\n{feedback}\n\n"
            "失敗の根本原因と、次の試行で何を変えるべきかを簡潔に述べてください。"
        )
        return self._call(prompt)

    def distill(self, investigation: str) -> str:
        """Distill: 調査結果から次回以降に使える教訓を 1 行で抽出する。"""
        prompt = (
            "以下の失敗分析から、今後の実行で再利用できる一般的な教訓を"
            "1 行で抽出してください。教訓の文のみを出力してください。\n\n"
            f"# 失敗分析\n{investigation}"
        )
        return self._call(prompt).strip()

    @staticmethod
    def _parse_task_list(raw: str) -> list[str]:
        """LLM 出力から JSON 配列を頑健に取り出す。"""
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            try:
                tasks = json.loads(m.group(0))
                if isinstance(tasks, list) and all(isinstance(t, str) for t in tasks):
                    return tasks
            except json.JSONDecodeError:
                pass
        logger.warning("タスク分割の JSON 解析に失敗。出力全体を単一タスクとして扱います")
        return [raw.strip()]
