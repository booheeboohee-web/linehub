"""自律稼働ループ(ステートマシン、完全ローカル)。

フェーズ遷移:

    CONSULT ─▶ PLAN ─▶ EXECUTE ─▶ VERIFY ─▶ (合格) 次タスク or DONE
       ▲                            │
       │                          (不合格)
       │                            ▼
    DISTILL ◀── INVESTIGATE ◀── FAIL

Fail → Investigate → Verify → Distill → Consult のサイクルを回しながら
STATE.md を更新し続ける。同一タスクが MAX_CONSECUTIVE_FAILURES(3)回
連続で失敗した場合は必ず停止し、人間確認を要求する(NEEDS_HUMAN)。
"""

from __future__ import annotations

import logging
from enum import Enum

import config
from agents.orchestrator import Orchestrator, PlanError
from agents.verifier import Verifier
from agents.worker import Worker
from core.security import SecurityError
from core.state_manager import StateManager

logger = logging.getLogger(__name__)


class Phase(str, Enum):
    CONSULT = "CONSULT"          # STATE.md の教訓・失敗履歴を参照
    PLAN = "PLAN"                # plan.json の読み込みと検証
    EXECUTE = "EXECUTE"          # Worker がサブタスクをローカル実行
    VERIFY = "VERIFY"            # Verifier が独立検証
    FAIL = "FAIL"                # 検証不合格を STATE.md に記録
    INVESTIGATE = "INVESTIGATE"  # 失敗原因の分類(ルールベース)
    DISTILL = "DISTILL"          # 教訓を STATE.md に抽出
    DONE = "DONE"
    NEEDS_HUMAN = "NEEDS_HUMAN"  # 停止して人間確認が必要


class AgentLoop:
    def __init__(
        self,
        orchestrator: Orchestrator,
        worker: Worker,
        verifier: Verifier,
        state: StateManager,
        max_iterations: int = config.DEFAULT_MAX_ITERATIONS,
        max_consecutive_failures: int = config.MAX_CONSECUTIVE_FAILURES,
    ):
        self.orchestrator = orchestrator
        self.worker = worker
        self.verifier = verifier
        self.state = state
        self.max_iterations = max_iterations
        self.max_consecutive_failures = max_consecutive_failures

    def run(self) -> Phase:
        """ループ本体。終了フェーズ (DONE / NEEDS_HUMAN) を返す。"""
        iteration = 0
        goal = ""
        tasks: list[dict] = []
        task_index = 0
        consecutive_failures = 0
        phase = Phase.CONSULT
        last_result = None
        last_feedback = ""

        while iteration < self.max_iterations:
            iteration += 1
            logger.info("=== iteration %d / phase %s ===", iteration, phase.value)
            self.state.update_status(phase.value, iteration)

            try:
                if phase is Phase.CONSULT:
                    self.state.load()
                    context = self.state.consult()
                    logger.debug("CONSULT:\n%s", context)
                    phase = Phase.PLAN if not tasks else Phase.EXECUTE

                elif phase is Phase.PLAN:
                    goal, tasks = self.orchestrator.plan()
                    task_index = 0
                    self.state.set_mission(goal)
                    self.state.set_task_queue([self._label(t) for t in tasks])
                    phase = Phase.EXECUTE

                elif phase is Phase.EXECUTE:
                    last_result = self.worker.execute(tasks[task_index])
                    phase = Phase.VERIFY

                elif phase is Phase.VERIFY:
                    task = tasks[task_index]
                    assert last_result is not None
                    verdict = self.verifier.verify(task, last_result)
                    logger.info(
                        "検証結果: passed=%s (%s)", verdict.passed, verdict.feedback
                    )
                    if verdict.passed:
                        consecutive_failures = 0
                        self.state.set_task_queue(
                            [self._label(t) for t in tasks], done_index=task_index
                        )
                        task_index += 1
                        if task_index >= len(tasks):
                            phase = Phase.DONE
                            break
                        phase = Phase.EXECUTE
                    else:
                        last_feedback = verdict.feedback
                        phase = Phase.FAIL

                elif phase is Phase.FAIL:
                    task = tasks[task_index]
                    consecutive_failures += 1
                    self.state.log_failure(iteration, self._label(task), last_feedback)
                    logger.warning(
                        "失敗 %d/%d 回目: %s",
                        consecutive_failures,
                        self.max_consecutive_failures,
                        last_feedback,
                    )
                    phase = Phase.INVESTIGATE

                elif phase is Phase.INVESTIGATE:
                    task = tasks[task_index]
                    investigation = self.orchestrator.investigate(task, last_feedback)
                    logger.info(
                        "調査結果: category=%s advice=%s",
                        investigation.category,
                        investigation.advice,
                    )
                    self._investigation = investigation
                    phase = Phase.DISTILL

                elif phase is Phase.DISTILL:
                    task = tasks[task_index]
                    lesson = self.orchestrator.distill(task, self._investigation)
                    self.state.add_skill(lesson)
                    logger.info("教訓を STATE.md に記録: %s", lesson)

                    # 3 回連続失敗したら必ず停止して人間確認を求める
                    if consecutive_failures >= self.max_consecutive_failures:
                        note = (
                            f"タスク '{self._label(task)}' が "
                            f"{consecutive_failures} 回連続で失敗しました。"
                            "plan.json を確認・修正してから再実行してください。"
                        )
                        logger.error("人間確認が必要: %s", note)
                        self.state.add_pending_review(note)
                        self.state.update_status(
                            Phase.NEEDS_HUMAN.value, iteration, note=note
                        )
                        return Phase.NEEDS_HUMAN

                    phase = Phase.CONSULT  # 教訓を読み直してから再試行

            except PlanError as e:
                logger.error("計画エラー: %s", e)
                self.state.add_pending_review(str(e))
                self.state.update_status(Phase.NEEDS_HUMAN.value, iteration, note=str(e))
                return Phase.NEEDS_HUMAN
            except SecurityError as e:
                logger.error("セキュリティ境界違反のため停止します: %s", e)
                self.state.log_failure(iteration, "security", str(e))
                self.state.add_pending_review(f"セキュリティ境界違反: {e}")
                self.state.update_status(Phase.NEEDS_HUMAN.value, iteration, note=str(e))
                return Phase.NEEDS_HUMAN

        if phase is Phase.DONE:
            self.state.update_status(Phase.DONE.value, iteration, note="全サブタスク完了")
            logger.info("=== 全タスク完了 ===")
            return Phase.DONE

        note = f"イテレーション上限 ({self.max_iterations}) に到達。人間確認が必要です。"
        logger.warning(note)
        self.state.add_pending_review(note)
        self.state.update_status(Phase.NEEDS_HUMAN.value, iteration, note=note)
        return Phase.NEEDS_HUMAN

    @staticmethod
    def _label(task: dict) -> str:
        return f"{task['action']}: {task.get('path') or task.get('note', '')}"
