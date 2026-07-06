"""エントリポイント(完全ローカル・標準ライブラリのみ)。

使い方:
    python main.py               # dry-run(実ファイルを変更しない)
    python main.py --apply       # 実編集(編集前に backups/ へバックアップ)

タスクは workspace/plan.json に人間が定義する
(ひな形: workspace/plan.example.json)。
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path

import config
from agents.orchestrator import Orchestrator
from agents.verifier import Verifier
from agents.worker import Worker
from core.loop import AgentLoop, Phase
from core.redactor import RedactingFormatter
from core.safe_file_ops import SafeFileOps
from core.state_manager import StateManager


def setup_logging(log_dir: Path) -> Path:
    """コンソールとログファイルの両方に redact 済みログを出力する。"""
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"run-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"

    formatter = RedactingFormatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for handler in [logging.StreamHandler(), logging.FileHandler(log_file, encoding="utf-8")]:
        handler.setFormatter(formatter)
        root.addHandler(handler)
    return log_file


def main() -> int:
    parser = argparse.ArgumentParser(
        description="ローカル完結の自己改善ワークフロー補助ツール(外部通信なし)"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="実ファイルを編集する(未指定時は dry-run)",
    )
    parser.add_argument(
        "--plan",
        default=str(config.DEFAULT_PLAN_FILE),
        help="タスク計画ファイル (default: workspace/plan.json)",
    )
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=config.DEFAULT_MAX_ITERATIONS,
        help=f"ループの最大イテレーション数 (default: {config.DEFAULT_MAX_ITERATIONS})",
    )
    args = parser.parse_args()

    config.WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    log_file = setup_logging(config.LOG_DIR)
    logger = logging.getLogger("main")
    logger.info("モード: %s / ログ: %s", "apply(実編集)" if args.apply else "dry-run", log_file)

    state = StateManager(config.STATE_FILE)
    file_ops = SafeFileOps(config.WORKSPACE_DIR, config.BACKUP_DIR, apply=args.apply)

    loop = AgentLoop(
        orchestrator=Orchestrator(Path(args.plan)),
        worker=Worker(file_ops),
        verifier=Verifier(config.WORKSPACE_DIR, state),
        state=state,
        max_iterations=args.max_iterations,
    )
    final_phase = loop.run()

    print(f"\n終了フェーズ: {final_phase.value}(詳細は {config.STATE_FILE.name} を参照)")
    if final_phase is Phase.DONE and not args.apply:
        print("dry-run で完了しました。実編集するには --apply を付けて再実行してください。")
    if final_phase is Phase.NEEDS_HUMAN:
        print("人間確認が必要です。STATE.md の 'Pending Human Review' を確認してください。")
        return 2
    return 0 if final_phase is Phase.DONE else 1


if __name__ == "__main__":
    sys.exit(main())
