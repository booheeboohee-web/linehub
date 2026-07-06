"""セキュリティ境界の管理(完全ローカル)。

- 機密ファイル(認証情報・DB・顧客データ)の読み取り拒否
- 編集可能範囲を workspace/ 配下に限定(シンボリックリンク経由の脱出も拒否)

ネットワーク通信・外部送信は一切行わない。
"""

from __future__ import annotations

import fnmatch
from pathlib import Path


class SecurityError(Exception):
    """セキュリティ境界違反。呼び出し側は処理を中止すること。"""


# 読み取り・編集を常に拒否するファイル名パターン(小文字比較)
FORBIDDEN_NAME_PATTERNS: list[str] = [
    ".env",
    ".env.*",
    "*.env",
    "credentials.json",
    "credentials*.json",
    "token.json",
    "token*.json",
    "*.key",
    "*.pem",
    "*.p12",
    "*.pfx",
    "*.sqlite",
    "*.sqlite3",
    "*.db",
    "id_rsa*",
    "id_ed25519*",
    "*.keychain",
]

# 顧客データとみなして拒否するファイル名キーワード(小文字比較)
CUSTOMER_DATA_KEYWORDS: list[str] = [
    "customer",
    "client_list",
    "member",
    "顧客",
    "会員",
    "個人情報",
    "契約",
]

# 上記キーワードと組み合わせて拒否する表形式データの拡張子
CUSTOMER_DATA_SUFFIXES: set[str] = {".csv", ".tsv", ".xlsx", ".xls"}


def is_forbidden_file(path: Path | str) -> bool:
    """認証情報・DB・顧客データ系のファイルかどうかを判定する。"""
    name = Path(path).name.lower()
    if any(fnmatch.fnmatch(name, pat) for pat in FORBIDDEN_NAME_PATTERNS):
        return True
    suffix = Path(path).suffix.lower()
    if suffix in CUSTOMER_DATA_SUFFIXES:
        if any(keyword in name for keyword in CUSTOMER_DATA_KEYWORDS):
            return True
    return False


def ensure_readable(path: Path | str) -> Path:
    """読み取りが許可されるパスか検査する。違反時は SecurityError。"""
    p = Path(path)
    if is_forbidden_file(p):
        raise SecurityError(
            f"読み取り禁止ファイルです(認証情報/DB/顧客データの可能性): {p.name}"
        )
    return p


def ensure_within_workspace(path: Path | str, workspace: Path) -> Path:
    """workspace/ 配下に解決されるパスか検査する(symlink 脱出も拒否)。"""
    workspace_resolved = workspace.resolve()
    p = Path(path)
    if not p.is_absolute():
        p = workspace_resolved / p
    resolved = p.resolve()
    if not resolved.is_relative_to(workspace_resolved):
        raise SecurityError(f"workspace 外のパスは編集できません: {path}")
    return resolved


def ensure_editable(path: Path | str, workspace: Path) -> Path:
    """編集が許可されるパスか検査する。

    条件: workspace/ 配下 かつ 機密ファイルパターンに該当しない。
    """
    resolved = ensure_within_workspace(path, workspace)
    if is_forbidden_file(resolved):
        raise SecurityError(f"編集禁止ファイルです: {resolved.name}")
    return resolved


def read_workspace_text(path: Path | str, workspace: Path) -> str:
    """workspace 配下のテキストファイルを安全に読み取る。"""
    resolved = ensure_within_workspace(path, workspace)
    ensure_readable(resolved)
    return resolved.read_text(encoding="utf-8")
