"""機密情報のマスキング(redaction)。

STATE.md・ログ・workspace への書き込み前に必ず通すフィルタ。
メールアドレス / 電話番号 / 各種キー・トークン・パスワードらしき文字列を
[REDACTED] に置換する。標準ライブラリのみで動作し、外部送信は行わない。
"""

from __future__ import annotations

import logging
import re

REDACTED = "[REDACTED]"

# 検出パターン(順序: 具体的なもの → 汎用的なもの)
_PATTERNS: list[re.Pattern[str]] = [
    # メールアドレス
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    # ベンダー固有形式のキー・トークン
    re.compile(r"\bsk-[A-Za-z0-9_-]{10,}\b"),          # sk- 系シークレットキー
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),               # AWS アクセスキー ID
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),     # GitHub トークン
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),   # Slack トークン
    re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b"),  # JWT
    # Bearer トークン
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"),
    # 汎用: key=value 形式の認証情報
    re.compile(
        r"(?i)\b(api[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token"
        r"|auth[_-]?token|client[_-]?secret|password|passwd|secret|token)\b"
        r"\s*[:=]\s*[\"']?[^\s\"',;]{4,}[\"']?"
    ),
    # 日本の電話番号(0 始まり 10〜11 桁、区切りあり/なし)
    re.compile(r"(?<![\d-])0\d{1,4}-\d{1,4}-\d{3,4}(?![\d-])"),
    re.compile(r"(?<![\d-])0\d{9,10}(?![\d-])"),
]


def redact(text: str) -> str:
    """機密情報らしき文字列を [REDACTED] に置換して返す。"""
    for pattern in _PATTERNS:
        text = pattern.sub(REDACTED, text)
    return text


def contains_sensitive(text: str) -> bool:
    """機密情報らしき文字列を含むかどうか。"""
    return any(p.search(text) for p in _PATTERNS)


class RedactingFormatter(logging.Formatter):
    """ログ出力を必ず redact してから書き出す Formatter。

    logs/ 配下・コンソールの両方に適用することで、
    「ログに機密情報を保存しない」を仕組みとして保証する。
    """

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))
