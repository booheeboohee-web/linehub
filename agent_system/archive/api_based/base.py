"""全役割エージェントの基底クラス。

リトライ + フォールバックチェーンを共通処理として持ち、
各役割はシステムプロンプトと入出力の整形だけを実装する。
"""

from __future__ import annotations

import logging
from typing import Any

from config import FALLBACK_ROUTING, MODEL_ROUTING, ModelConfig
from core.llm_client import LLMClient
from core.safety import FallbackChain

logger = logging.getLogger(__name__)


class BaseAgent:
    role: str = "base"
    system_prompt: str = ""

    def __init__(self, client: LLMClient):
        self.client = client
        primary: ModelConfig = MODEL_ROUTING[self.role]
        fallbacks = FALLBACK_ROUTING.get(self.role, [])
        self._chain = FallbackChain([primary, *fallbacks])

    def _call(self, user_content: str | list[dict[str, Any]]) -> str:
        """リトライ・フォールバック込みで LLM を 1 回呼び出す。"""

        def invoke(cfg: ModelConfig) -> str:
            logger.debug("[%s] model=%s を呼び出し", self.role, cfg.model)
            return self.client.complete(cfg, self.system_prompt, user_content)

        return self._chain.call(invoke)
