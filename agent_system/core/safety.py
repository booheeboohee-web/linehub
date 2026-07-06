"""セーフティと境界管理。

- 例外階層: 一時的エラー(リトライ可) / 恒久エラー / セーフティ拒否 を区別する
- retry_with_backoff: 指数バックオフ付きリトライ
- FallbackChain: プライマリ設定が拒否・恒久失敗した場合に代替設定へ切り替える
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Sequence
from typing import TypeVar

import config

logger = logging.getLogger(__name__)

T = TypeVar("T")


class AgentError(Exception):
    """エージェント基盤の基底例外。"""


class SafetyRefusalError(AgentError):
    """セーフティ・クラシファイアまたはモデル自身による拒否。

    リトライしても解決しないため、フォールバックモデルへの切替
    またはタスクの再設計(Investigate)で対処する。
    """

    def __init__(self, message: str, category: str | None = None):
        super().__init__(message)
        self.category = category


class RateLimitedError(AgentError):
    """429: レート制限。バックオフ後にリトライ可能。"""


class TransientAPIError(AgentError):
    """5xx / 529 / 接続断など、一時的なエラー。リトライ可能。"""


class PermanentAPIError(AgentError):
    """400 / 401 / 404 など、リトライしても解決しないエラー。"""


def retry_with_backoff(
    fn: Callable[[], T],
    max_retries: int = config.MAX_RETRIES,
    base_seconds: float = config.BACKOFF_BASE_SECONDS,
) -> T:
    """一時的エラーに対して指数バックオフでリトライする。

    SafetyRefusalError / PermanentAPIError は即座に送出する
    (時間をおいても解決しないため)。
    """
    last_error: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except (RateLimitedError, TransientAPIError) as e:
            last_error = e
            if attempt >= max_retries:
                break
            wait = base_seconds * (2**attempt)
            logger.warning(
                "一時的エラー (%s)。%.0f 秒後にリトライ (%d/%d)",
                e,
                wait,
                attempt + 1,
                max_retries,
            )
            time.sleep(wait)
    raise TransientAPIError(f"リトライ上限に到達: {last_error}") from last_error


class FallbackChain:
    """プライマリ → フォールバックの順にモデル設定を試行する。

    - 一時的エラー: 同一設定内でリトライ(retry_with_backoff)
    - セーフティ拒否 / 恒久エラー / リトライ枯渇: 次の設定へフォールバック
    - 全設定が失敗: 最後の例外を送出
    """

    def __init__(self, configs: Sequence["config.ModelConfig"]):
        if not configs:
            raise ValueError("FallbackChain には 1 つ以上の設定が必要です")
        self.configs = list(configs)

    def call(self, fn: Callable[["config.ModelConfig"], T]) -> T:
        last_error: Exception | None = None
        for i, cfg in enumerate(self.configs):
            try:
                return retry_with_backoff(lambda: fn(cfg))
            except SafetyRefusalError as e:
                logger.warning(
                    "モデル %s がセーフティ拒否 (category=%s)。フォールバックへ",
                    cfg.model,
                    e.category,
                )
                last_error = e
            except (PermanentAPIError, TransientAPIError) as e:
                logger.warning("モデル %s が失敗: %s。フォールバックへ", cfg.model, e)
                last_error = e
            if i == len(self.configs) - 1:
                break
        assert last_error is not None
        raise last_error
