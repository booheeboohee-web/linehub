"""自律稼働ループ(ステートマシン)。

フェーズ遷移:

    CONSULT ─▶ PLAN ─▶ EXECUTE ─▶ VERIFY ─▶ (合格) 次タスク or DONE
       ▲                            │
       │                          (不合格)
       │                            ▼
    DISTILL ◀── VERIFY ◀── INVESTIGATE ◀── FAIL

要件どおり Fail → Investigate → Verify → Distill → Consult の
サイクルを必ず経由する。各フェーズごとに STATE.md を更新するため、
プロセスが中断しても次回起動時に状態を引き継げる。
"""

from __future__ import annotations

import logging
from enum import Enum

from agents.orchestrator import Orchestrator
from agents.verifier import Verifier
from agents.worker import Worker
from core.safety import AgentError, SafetyRefusalError
from core.state_manager import StateManager

logger = logging.getLogger(__name__)


class Phase(str, Enum):
    CONSULT = "CONSULT"          # STATE.md の教訓を参照
    PLAN = "PLAN"                # タスク分割
    EXECUTE = "EXECUTE"          # Worker がサブタスク実行
    VERIFY = "VERIFY"            # Verifier が独立検証
    FAIL = "FAIL"                # 検証不合格を記録
    INVESTIGATE = "INVESTIGATE"  # 失敗原因の調査
    DISTILL = "DISTILL"          # 教訓の抽出 → STATE.md へ
    DONE = "DONE"
    ABORTED = "ABORTED"


class AgentLoop:
    def __init__(
        self,
        goal: str,
        orchestrator: Orchestrator,
        worker: Worker,
        verifier: Verifier,
        state: StateManager,
        max_iterations: int = 10,
    ):
        self.goal = goal
        self.orchestrator = orchestrator
        self.worker = worker
        self.verifier = verifier
        self.state = state
        self.max_iterations = max_iterations

    def run(self) -> Phase:
        """ループ本体。終了フェーズ (DONE / ABORTED) を返す。"""
        self.state.set_mission(self.goal)
        iteration = 0
        tasks: list[str] = []
        task_index = 0
        hint = ""  # Investigate で得た改善指示(次の EXECUTE に注入)
        phase = Phase.CONSULT
        context = ""
        last_output = ""
        last_feedback = ""
        investigation = ""

        while iteration < self.max_iterations:
            iteration += 1
            logger.info("=== iteration %d / phase %s ===", iteration, phase.value)
            self.state.update_status(phase.value, iteration)

            try:
                if phase is Phase.CONSULT:
                    # STATE.md から過去の教訓・失敗履歴を読み込む
                    self.state.load()
                    context = self.state.consult()
                    phase = Phase.PLAN if not tasks else Phase.EXECUTE

                elif phase is Phase.PLAN:
                    tasks = self.orchestrator.plan(self.goal, context)
                    task_index = 0
                    self.state.set_task_queue(tasks)
                    logger.info("タスク分割: %s", tasks)
                    phase = Phase.EXECUTE

                elif phase is Phase.EXECUTE:
                    subtask = tasks[task_index]
                    logger.info("Worker 実行: %s", subtask)
                    last_output = self.worker.execute(subtask, self.goal, context, hint)
                    hint = ""
                    phase = Phase.VERIFY

                elif phase is Phase.VERIFY:
                    subtask = tasks[task_index]
                    result = self.verifier.verify(self.goal, subtask, last_output)
                    logger.info("検証結果: passed=%s (%s)", result.passed, result.feedback)
                    if result.passed:
                        self.state.set_task_queue(tasks, done_index=task_index)
                        task_index += 1
                        if task_index >= len(tasks):
                            phase = Phase.DONE
                            break
                        phase = Phase.EXECUTE
                    else:
                        last_feedback = result.feedback
                        phase = Phase.FAIL

                elif phase is Phase.FAIL:
                    subtask = tasks[task_index]
                    self.state.log_failure(iteration, subtask, last_feedback)
                    phase = Phase.INVESTIGATE

                elif phase is Phase.INVESTIGATE:
                    subtask = tasks[task_index]
                    investigation = self.orchestrator.investigate(
                        self.goal, subtask, last_output, last_feedback
                    )
                    logger.info("調査結果: %s", investigation[:200])
                    # 調査で得た改善指示を次の実行に注入し、再検証へ向かう
                    hint = investigation
                    phase = Phase.DISTILL

                elif phase is Phase.DISTILL:
                    lesson = self.orchestrator.distill(investigation)
                    self.state.add_skill(lesson)
                    logger.info("教訓を STATE.md に記録: %s", lesson)
                    # Consult に戻り、更新された STATE.md を読み直してから再実行
                    phase = Phase.CONSULT

            except SafetyRefusalError as e:
                # 全フォールバックでも拒否された場合はタスクを再設計せず中断
                logger.error("セーフティ拒否によりループを中断します: %s", e)
                self.state.log_failure(iteration, "system", f"safety refusal: {e}")
                self.state.update_status(Phase.ABORTED.value, iteration, note=str(e))
                return Phase.ABORTED
            except AgentError as e:
                logger.error("回復不能な API エラー: %s", e)
                self.state.log_failure(iteration, "system", f"api error: {e}")
                self.state.update_status(Phase.ABORTED.value, iteration, note=str(e))
                return Phase.ABORTED

        if phase is Phase.DONE:
            self.state.update_status(Phase.DONE.value, iteration, note="全サブタスク完了")
            logger.info("=== ゴール達成 ===")
            return Phase.DONE

        self.state.update_status(
            Phase.ABORTED.value, iteration, note="イテレーション上限に到達"
        )
        logger.warning("イテレーション上限 (%d) に到達しました", self.max_iterations)
        return Phase.ABORTED
