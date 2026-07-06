"""エントリポイント。

使い方:
    python main.py --goal "..." --mock            # API キー不要の動作確認
    python main.py --goal "..." --max-iterations 5  # 実 API (ANTHROPIC_API_KEY)
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

import config
from agents.orchestrator import Orchestrator
from agents.verifier import Verifier
from agents.worker import Worker
from core.llm_client import LLMClient, MockLLMClient
from core.loop import AgentLoop, Phase
from core.state_manager import StateManager


def build_client(use_mock: bool) -> LLMClient:
    if use_mock:
        logging.info("MockLLMClient を使用します(API 呼び出しなし)")
        return MockLLMClient()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        logging.warning(
            "ANTHROPIC_API_KEY が未設定です。`ant auth login` のプロファイルが"
            "あればそれが使われます。どちらも無い場合は --mock を指定してください。"
        )
    from core.llm_client import AnthropicLLMClient

    return AnthropicLLMClient()


def main() -> int:
    parser = argparse.ArgumentParser(description="自律型・自己改善 AI エージェントシステム")
    parser.add_argument("--goal", required=True, help="達成するゴール")
    parser.add_argument("--mock", action="store_true", help="Mock クライアントで実行")
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=config.DEFAULT_MAX_ITERATIONS,
        help=f"ループの最大イテレーション数 (default: {config.DEFAULT_MAX_ITERATIONS})",
    )
    parser.add_argument("--state-file", default=config.STATE_FILE, help="STATE.md のパス")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )

    client = build_client(args.mock)
    state = StateManager(args.state_file)

    loop = AgentLoop(
        goal=args.goal,
        orchestrator=Orchestrator(client),
        worker=Worker(client),
        verifier=Verifier(client),
        state=state,
        max_iterations=args.max_iterations,
    )
    final_phase = loop.run()
    print(f"\n終了フェーズ: {final_phase.value}(詳細は {args.state_file} を参照)")
    return 0 if final_phase is Phase.DONE else 1


if __name__ == "__main__":
    sys.exit(main())
