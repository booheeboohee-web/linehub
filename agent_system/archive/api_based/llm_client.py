"""LLM クライアント抽象。

- LLMClient: プロトコル(complete のみ)
- AnthropicLLMClient: 公式 SDK ラッパ。API エラーを safety.py の例外階層へ変換
- MockLLMClient: API キー不要の動作確認用スタブ
"""

from __future__ import annotations

import logging
from typing import Any, Protocol

from config import ModelConfig
from core.safety import (
    PermanentAPIError,
    RateLimitedError,
    SafetyRefusalError,
    TransientAPIError,
)

logger = logging.getLogger(__name__)


class LLMClient(Protocol):
    """役割エージェントが依存する最小インターフェース。"""

    def complete(
        self,
        cfg: ModelConfig,
        system: str,
        user_content: str | list[dict[str, Any]],
    ) -> str: ...


class AnthropicLLMClient:
    """Anthropic Messages API ラッパ。

    - stop_reason == "refusal" を SafetyRefusalError に変換
    - 典型的な HTTP エラーを safety.py の例外階層に変換
      (SDK 自体も 429/5xx を自動リトライするが、上位でのフォールバック
       判断のために型付き例外へ正規化する)
    """

    def __init__(self, api_key: str | None = None):
        import anthropic

        self._anthropic = anthropic
        self._client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()

    def complete(
        self,
        cfg: ModelConfig,
        system: str,
        user_content: str | list[dict[str, Any]],
    ) -> str:
        kwargs: dict[str, Any] = {
            "model": cfg.model,
            "max_tokens": cfg.max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user_content}],
        }
        if cfg.thinking is not None:
            kwargs["thinking"] = cfg.thinking
        if cfg.effort is not None:
            kwargs["output_config"] = {"effort": cfg.effort}

        a = self._anthropic
        try:
            response = self._client.messages.create(**kwargs)
        except a.RateLimitError as e:
            raise RateLimitedError(str(e)) from e
        except a.InternalServerError as e:
            raise TransientAPIError(str(e)) from e
        except a.APIStatusError as e:
            # 529 (overloaded) は一時的、それ以外の 4xx は恒久エラー扱い
            if e.type == "overloaded_error" or e.status_code >= 500:
                raise TransientAPIError(str(e)) from e
            raise PermanentAPIError(f"{e.status_code}: {e.message}") from e
        except a.APIConnectionError as e:
            raise TransientAPIError(str(e)) from e

        # セーフティ・クラシファイア / モデル拒否のハンドリング
        if response.stop_reason == "refusal":
            category = None
            if response.stop_details is not None:
                category = getattr(response.stop_details, "category", None)
            raise SafetyRefusalError(
                f"モデル {cfg.model} がリクエストを拒否しました", category=category
            )

        text = "".join(b.text for b in response.content if b.type == "text")
        if response.stop_reason == "max_tokens":
            logger.warning("出力が max_tokens (%d) で打ち切られました", cfg.max_tokens)
        return text


class MockLLMClient:
    """API キーなしでループ全体を動作確認するためのスタブ。

    役割別のシステムプロンプト内容から応答パターンを切り替える。
    verifier の初回検証を意図的に 1 度失敗させ、
    Fail → Investigate → Verify → Distill → Consult サイクルを通す。
    """

    def __init__(self, fail_first_verify: bool = True):
        self._verify_calls = 0
        self._fail_first_verify = fail_first_verify

    def complete(
        self,
        cfg: ModelConfig,
        system: str,
        user_content: str | list[dict[str, Any]],
    ) -> str:
        if "タスク分割" in system or "Orchestrator" in system:
            text = str(user_content)
            # 「分割」判定を最優先にする(plan プロンプトは参照情報として
            # 「教訓」という語も含むため、順序を誤ると誤マッチする)
            if "サブタスクに分割" in text:
                return (
                    '["ゴールの要件を整理する", "要件に沿って成果物を作成する", '
                    '"成果物を自己点検する"]'
                )
            if "原因を調査" in text:
                return (
                    "失敗原因の分析: 出力がゴールの必須要件を一部満たしていなかった。"
                    "要件を明示したプロンプトに修正して再実行すべき。"
                )
            if "教訓" in text:
                return "サブタスク実行時は、ゴールの必須要件を箇条書きでプロンプトに含めること。"
            return "[mock] Orchestrator 応答"
        if "Verifier" in system:
            self._verify_calls += 1
            if self._fail_first_verify and self._verify_calls == 1:
                return '{"passed": false, "feedback": "必須要件の一部が成果物に含まれていません"}'
            return '{"passed": true, "feedback": "全要件を満たしています"}'
        # worker
        return f"[mock:{cfg.model}] サブタスクを実行し、成果物を生成しました。"
