"""STATE.md の読み書き。

進行状況・タスクキュー・獲得した教訓・失敗履歴・人間確認待ち項目を
Markdown セクションとして永続化し、次回ループの CONSULT フェーズで参照する。

すべての書き込みは core/redactor.py を通し、メールアドレス・電話番号・
キー/トークンらしき文字列が STATE.md に保存されないことを保証する。
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

from core.redactor import redact

SECTIONS = [
    "Mission",
    "Current Status",
    "Task Queue",
    "Acquired Skills",
    "Failure Log",
    "Pending Human Review",
]

_TEMPLATE = """# STATE

## Mission
{Mission}

## Current Status
{Current Status}

## Task Queue
{Task Queue}

## Acquired Skills
{Acquired Skills}

## Failure Log
{Failure Log}

## Pending Human Review
{Pending Human Review}
"""


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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
        # 書き込み前に必ず redact(機密情報を STATE.md に残さない)
        rendered = _TEMPLATE.format(**{k: redact(v) for k, v in self.sections.items()})
        self.path.write_text(rendered, encoding="utf-8")

    # ---- 更新 API ---------------------------------------------------

    def set_mission(self, mission: str) -> None:
        self.sections["Mission"] = mission
        self.save()

    def update_status(self, phase: str, iteration: int, note: str = "") -> None:
        lines = [
            f"- phase: {phase}",
            f"- iteration: {iteration}",
            f"- last_updated: {_now()}",
        ]
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
        skill = skill.strip()
        if not skill or skill in self.sections["Acquired Skills"]:
            return
        existing = self.sections["Acquired Skills"]
        self.sections["Acquired Skills"] = f"{existing}\n- {skill}".strip()
        self.save()

    def log_failure(self, iteration: int, subtask: str, reason: str) -> None:
        entry = f"- [{_now()}] iter={iteration} task='{subtask}' reason: {reason}"
        existing = self.sections["Failure Log"]
        self.sections["Failure Log"] = f"{existing}\n{entry}".strip()
        self.save()

    def add_pending_review(self, note: str) -> None:
        """人間確認が必要な項目を記録する(Vision 検証の代替など)。"""
        entry = f"- [{_now()}] 人間確認が必要: {note}"
        existing = self.sections["Pending Human Review"]
        if note in existing:
            return
        self.sections["Pending Human Review"] = f"{existing}\n{entry}".strip()
        self.save()

    # ---- 参照 API (Consult) -----------------------------------------

    def consult(self) -> str:
        """CONSULT フェーズ用: 過去の教訓と失敗履歴を整形して返す。"""
        skills = self.sections["Acquired Skills"] or "(まだありません)"
        failures = self.sections["Failure Log"] or "(まだありません)"
        pending = self.sections["Pending Human Review"] or "(なし)"
        return (
            "## 過去に獲得した教訓\n"
            f"{skills}\n\n"
            "## 直近の失敗履歴\n"
            f"{failures}\n\n"
            "## 人間確認待ち\n"
            f"{pending}"
        )
