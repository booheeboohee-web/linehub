"""Verifier: 完全に独立した検証エージェント。

Worker の出力と初期目標を照合し、合否とフィードバックを返す。
Worker とは別のモデル設定・別のシステムプロンプトで動作し、
Worker の会話履歴を一切共有しない(独立性の担保)。

vision_check は Vision(画像認識)による検証を模倣する機構。
実 API 使用時は image content block を組み立てて送信し、
画像が存在しない場合はテキストのみの検証にフォールバックする。
"""

from __future__ import annotations

import base64
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from agents.base import BaseAgent

logger = logging.getLogger(__name__)

_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


@dataclass
class VerificationResult:
    passed: bool
    feedback: str


class Verifier(BaseAgent):
    role = "verifier"
    system_prompt = (
        "あなたは自律型エージェントシステムの Verifier(独立検証担当)です。"
        "Worker の出力が初期目標とサブタスクの要件を満たしているかを、"
        "第三者として厳格に検証してください。"
        '出力は JSON のみ: {"passed": true|false, "feedback": "理由"}'
    )

    def verify(self, goal: str, subtask: str, output: str) -> VerificationResult:
        """Worker の出力を初期目標と照合する。"""
        prompt = (
            f"# 初期目標\n{goal}\n\n"
            f"# サブタスク\n{subtask}\n\n"
            f"# Worker の出力(検証対象)\n{output}\n\n"
            "この出力はサブタスクの要件と初期目標に整合していますか?"
            "JSON のみで回答してください。"
        )
        return self._parse_result(self._call(prompt))

    def vision_check(self, goal: str, image_path: str | Path) -> VerificationResult:
        """Vision チェック機構: 画像成果物を目視検証(の模倣)。

        画像ファイルが存在すれば image block 付きで検証を依頼し、
        存在しなければスキップ扱い(passed=True, 注記付き)で返す。
        MockLLMClient 使用時も同じ経路を通るため、パイプラインの
        Vision 検証ステップを模倣できる。
        """
        path = Path(image_path)
        media_type = _MEDIA_TYPES.get(path.suffix.lower())
        if not path.exists() or media_type is None:
            logger.info("vision_check: 画像 %s が無いためスキップします", path)
            return VerificationResult(
                passed=True, feedback=f"画像 {path} が存在しないため Vision 検証をスキップ"
            )

        image_data = base64.standard_b64encode(path.read_bytes()).decode("ascii")
        content: list[dict[str, Any]] = [
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": image_data},
            },
            {
                "type": "text",
                "text": (
                    f"# 初期目標\n{goal}\n\n"
                    "この画像は初期目標の成果物として妥当ですか?"
                    "JSON のみで回答してください。"
                ),
            },
        ]
        return self._parse_result(self._call(content))

    @staticmethod
    def _parse_result(raw: str) -> VerificationResult:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                data = json.loads(m.group(0))
                return VerificationResult(
                    passed=bool(data.get("passed", False)),
                    feedback=str(data.get("feedback", "")),
                )
            except json.JSONDecodeError:
                pass
        # 解析不能な検証結果は安全側(不合格)に倒す
        logger.warning("検証結果の JSON 解析に失敗。不合格として扱います")
        return VerificationResult(passed=False, feedback=f"検証結果を解析できません: {raw[:200]}")
