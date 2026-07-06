"""STATE.md の読み書き。

システムの進行状況・タスクキュー・獲得スキル・失敗履歴を
Markdown セクションとして永続化し、次回ループの CONSULT フェーズで
プロンプトコンテキストとして再利用する。
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

SECTIONS = ["Mission", "Current Status", "Task Queue", "Acquired Skills", "Failure Log"]

_TEMPLATE = """# STATE

## Mission
{mission}

## Current Status
{current_status}

## Task Queue
{task_queue}

## Acquired Skills
{acquired_skills}

## Failure Log
{failure_log}
"""


class StateManager:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.sections: dict[str, str] = {s: "" for s in SECTIONS}
        if self.path.exists():
            self.load()

    # ---- 永続化 -----------------------------------------------------

    def load(self) -> None:
        text = self.path.read_text(encoding="utf-8")
        for section in SECTIONS:
            pattern = rf"^## {re.escape(section)}\n(.*?)(?=^## |\Z)"
            m = re.search(pattern, text, re.MULTILINE | re.DOTALL)
            self.sections[section] = m.group(1).strip() if m else ""

    def save(self) -> None:
        self.path.write_text(
            _TEMPLATE.format(
                mission=self.sections["Mission"],
                current_status=self.sections["Current Status"],
                task_queue=self.sections["Task Queue"],
                acquired_skills=self.sections["Acquired Skills"],
                failure_log=self.sections["Failure Log"],
            ),
            encoding="utf-8",
        )

    # ---- 更新 API ---------------------------------------------------

    def set_mission(self, mission: str) -> None:
        self.sections["Mission"] = mission
        self.save()

    def update_status(self, phase: str, iteration: int, note: str = "") -> None:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        lines = [f"- phase: {phase}", f"- iteration: {iteration}", f"- last_updated: {now}"]
        if note:
            lines.append(f"- note: {note}")
        self.sections["Current Status"] = "\n".join(lines)
        self.save()

    def set_task_queue(self, tasks: list[str], done_index: int = -1) -> None:
        lines = []
        for i, task in enumerate(tasks):
            mark = "x" if i <= done_index else " "
            lines.append(f"- [{mark}] {task}")
        self.sections["Task Queue"] = "\n".join(lines)
        self.save()

    def add_skill(self, skill: str) -> None:
        """Distill フェーズで抽出した教訓を追記する(重複はスキップ)。"""
        existing = self.sections["Acquired Skills"]
        if skill.strip() in existing:
            return
        entry = f"- {skill.strip()}"
        self.sections["Acquired Skills"] = f"{existing}\n{entry}".strip()
        self.save()

    def log_failure(self, iteration: int, subtask: str, reason: str) -> None:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        entry = f"- [{now}] iter={iteration} task='{subtask}' reason: {reason}"
        existing = self.sections["Failure Log"]
        self.sections["Failure Log"] = f"{existing}\n{entry}".strip()
        self.save()

    # ---- 参照 API (Consult) -----------------------------------------

    def consult(self) -> str:
        """CONSULT フェーズ用: 過去の教訓と失敗履歴をプロンプト向けに整形。"""
        skills = self.sections["Acquired Skills"] or "(まだありません)"
        failures = self.sections["Failure Log"] or "(まだありません)"
        return (
            "## 過去に獲得した教訓(必ず考慮すること)\n"
            f"{skills}\n\n"
            "## 直近の失敗履歴\n"
            f"{failures}"
        )
