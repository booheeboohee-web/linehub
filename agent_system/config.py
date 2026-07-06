"""設定。

このシステムは完全ローカル動作です。
- 外部 API / ネットワーク通信は一切行いません
- 課金が発生する要素はありません(標準ライブラリのみで動作)
"""

from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# 編集可能範囲は workspace/ 配下のみ
WORKSPACE_DIR = BASE_DIR / "workspace"

# 実編集(--apply)前のバックアップ先
BACKUP_DIR = BASE_DIR / "backups"

# 実行ログ(書き込み前に必ず redact される)
LOG_DIR = BASE_DIR / "logs"

# 状態ファイル(書き込み前に必ず redact される)
STATE_FILE = BASE_DIR / "STATE.md"

# タスク計画ファイル(人間が編集する)
DEFAULT_PLAN_FILE = WORKSPACE_DIR / "plan.json"

# 同一タスクの連続失敗がこの回数に達したら必ず停止して人間確認を求める
MAX_CONSECUTIVE_FAILURES = 3

# ループ全体の安全弁
DEFAULT_MAX_ITERATIONS = 50
