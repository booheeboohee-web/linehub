"""モデルルーティング設定。

役割ごとに使用モデルと生成パラメータを定義する。
- Orchestrator / Verifier: 高知能モデル (claude-opus-4-8, adaptive thinking)
- Worker: 安価・高速モデル (claude-haiku-4-5)

`fallbacks` は、セーフティ拒否やモデル固有の恒久エラー発生時に
順番に試行される代替モデル設定。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ModelConfig:
    """1 モデル分の呼び出し設定。"""

    model: str
    max_tokens: int = 4096
    # claude-opus-4-8 系は adaptive thinking のみサポート
    # (budget_tokens / temperature / top_p は 400 になるため使わない)
    thinking: dict[str, Any] | None = None
    effort: str | None = None  # low | medium | high | xhigh | max


# 役割 → プライマリ設定
MODEL_ROUTING: dict[str, ModelConfig] = {
    "orchestrator": ModelConfig(
        model="claude-opus-4-8",
        max_tokens=16000,
        thinking={"type": "adaptive"},
        effort="high",
    ),
    "worker": ModelConfig(
        model="claude-haiku-4-5",
        max_tokens=4096,
    ),
    "verifier": ModelConfig(
        model="claude-opus-4-8",
        max_tokens=8000,
        thinking={"type": "adaptive"},
        effort="medium",
    ),
}

# 役割 → フォールバックチェーン(先頭から順に試行)
FALLBACK_ROUTING: dict[str, list[ModelConfig]] = {
    # Worker が拒否/恒久エラーとなった場合は上位モデルで救済
    "worker": [
        ModelConfig(model="claude-sonnet-5", max_tokens=4096),
    ],
    "orchestrator": [],
    "verifier": [],
}

# リトライ設定(一時的エラー: 429 / 5xx / 接続断)
MAX_RETRIES = 4
BACKOFF_BASE_SECONDS = 2.0  # 2, 4, 8, 16 秒

# ループ設定
DEFAULT_MAX_ITERATIONS = 10
STATE_FILE = "STATE.md"
