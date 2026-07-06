"""外部 API・ネットワーク・課金要素への依存が存在しないことのテスト。

- 課金 API のキー名・SDK 名が稼働コード/ドキュメントに存在しない
- ネットワーク通信を行うモジュールを import していない
- 依存パッケージ定義(requirements 等)が存在しない、または禁止パッケージを含まない
- 稼働コードが archive/(退避した課金前提の実装)を import していない

archive/ は「削除ではなく退避」した参照用コードのため、内容スキャンの
対象外とする。ただし稼働コードから archive を import しないことは検証する。
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

# 課金 API を想起させる禁止文字列(大文字小文字を区別しない)
FORBIDDEN_STRINGS = [
    "anthropic",
    "openai",
    "api.anthropic.com",
    "api.openai.com",
    "generativeai",
    "vertexai",
    "gemini",
]

# ネットワーク通信を行う import の禁止パターン
FORBIDDEN_IMPORT_RE = re.compile(
    r"^\s*(?:import|from)\s+"
    r"(requests|httpx|aiohttp|urllib|socket|http|ftplib|smtplib|websocket|websockets)"
    r"(?:[\s.]|$)",
    re.MULTILINE,
)

# .env 読み取りの禁止パターン
FORBIDDEN_DOTENV_RE = re.compile(r"load_dotenv|dotenv|open\(\s*['\"]\.env")


# スキャン対象外: tests(このテスト自身)、archive(退避コード。import されない
# ことは test_active_code_does_not_import_archive で別途検証)、自動生成物
EXCLUDED_TOP_DIRS = {"tests", "archive", "logs", "backups", "__pycache__"}


def target_files(suffixes: tuple[str, ...]) -> list[Path]:
    """稼働コード・ドキュメントの対象ファイルを列挙する。"""
    files = []
    for path in BASE_DIR.rglob("*"):
        if path.suffix not in suffixes or not path.is_file():
            continue
        rel = path.relative_to(BASE_DIR)
        if rel.parts[0] in EXCLUDED_TOP_DIRS:
            continue
        if "__pycache__" in rel.parts:
            continue
        files.append(path)
    return files


class TestNoAPIDependency(unittest.TestCase):
    def test_no_paid_api_strings_in_code_and_docs(self):
        """課金 API のキー名・SDK 名がコード・ドキュメントに存在しない。"""
        for path in target_files((".py", ".md", ".txt", ".json", ".toml", ".cfg")):
            text = path.read_text(encoding="utf-8").lower()
            for forbidden in FORBIDDEN_STRINGS:
                self.assertNotIn(
                    forbidden.lower(),
                    text,
                    f"{path} に禁止文字列 '{forbidden}' が含まれています",
                )

    def test_no_api_key_env_var_names(self):
        """外部 API キーの環境変数名がどこにも存在しない。"""
        for path in target_files((".py", ".md", ".txt", ".json", ".toml", ".cfg")):
            text = path.read_text(encoding="utf-8")
            self.assertNotRegex(
                text,
                r"[A-Z]+_API_KEY",
                f"{path} に API キー環境変数への参照が含まれています",
            )

    def test_no_network_imports(self):
        """ネットワーク通信を行うモジュールを import していない。"""
        for path in target_files((".py",)):
            text = path.read_text(encoding="utf-8")
            m = FORBIDDEN_IMPORT_RE.search(text)
            self.assertIsNone(
                m, f"{path} にネットワーク系 import が含まれています: {m.group(0) if m else ''}"
            )

    def test_no_dotenv_reading(self):
        """.env を読み取るコードが存在しない。"""
        for path in target_files((".py",)):
            text = path.read_text(encoding="utf-8")
            self.assertIsNone(
                FORBIDDEN_DOTENV_RE.search(text),
                f"{path} に .env 読み取りコードが含まれています",
            )

    def test_no_dependency_files_with_paid_packages(self):
        """依存定義ファイルが存在しない(=標準ライブラリのみ)。"""
        for name in ["requirements.txt", "Pipfile", "pyproject.toml", "setup.py"]:
            path = BASE_DIR / name
            self.assertFalse(
                path.exists(),
                f"{name} が存在します。標準ライブラリのみで動作する設計を維持してください",
            )

    def test_active_code_does_not_import_archive(self):
        """稼働コードが archive/(退避した課金前提の実装)を import していない。"""
        pattern = re.compile(r"^\s*(?:import|from)\s+archive\b", re.MULTILINE)
        for path in target_files((".py",)):
            text = path.read_text(encoding="utf-8")
            self.assertIsNone(
                pattern.search(text),
                f"{path} が archive/ を import しています(復元は人間の判断が必要)",
            )

    def test_no_subprocess_git_push_or_curl(self):
        """git push / curl / wget など外部送信コマンドの実行が存在しない。"""
        pattern = re.compile(r"git\s+push|curl\s|wget\s|subprocess")
        for path in target_files((".py",)):
            text = path.read_text(encoding="utf-8")
            self.assertIsNone(
                pattern.search(text),
                f"{path} に外部送信・外部コマンド実行が含まれています",
            )


if __name__ == "__main__":
    unittest.main()
