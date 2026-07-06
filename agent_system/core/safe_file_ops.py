"""安全なファイル操作。

原則:
- デフォルトは dry-run(実ファイルを一切変更しない)
- 実編集は --apply 指定時のみ
- 実編集前に必ず backups/ へバックアップ
- 編集可能範囲は workspace/ 配下のみ(core/security.py で強制)
- 書き込み内容に機密情報らしき文字列があれば [REDACTED] に置換して警告
"""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from core import redactor, security

logger = logging.getLogger(__name__)


@dataclass
class FileOpResult:
    ok: bool
    action: str
    path: str
    detail: str = ""
    new_content: str | None = None
    applied: bool = False
    redacted: bool = False
    notes: list[str] = field(default_factory=list)


class SafeFileOps:
    def __init__(self, workspace: Path, backup_dir: Path, apply: bool = False):
        self.workspace = Path(workspace)
        self.backup_dir = Path(backup_dir)
        self.apply = apply
        # dry-run 用の仮想オーバーレイ。書き込み「予定」の内容を保持し、
        # 後続タスクが前段の結果に依存する計画でも dry-run で検証できるようにする。
        self._pending: dict[Path, str] = {}

    # ---- 公開 API ----------------------------------------------------

    def write_file(self, rel_path: str, content: str) -> FileOpResult:
        """ファイルを新規作成/上書きする(dry-run では計画のみ)。"""
        return self._commit("write_file", rel_path, content)

    def append_file(self, rel_path: str, content: str) -> FileOpResult:
        """ファイル末尾に追記する。"""
        target = security.ensure_editable(rel_path, self.workspace)
        current = self._current_content(target) or ""
        return self._commit("append_file", rel_path, current + content)

    def replace_text(self, rel_path: str, old: str, new: str) -> FileOpResult:
        """既存ファイル(または書き込み予定内容)の文字列を置換する。"""
        target = security.ensure_editable(rel_path, self.workspace)
        current = self._current_content(target)
        if current is None:
            return FileOpResult(
                ok=False,
                action="replace_text",
                path=rel_path,
                detail=f"対象ファイルが存在しません: {rel_path}",
            )
        if old not in current:
            return FileOpResult(
                ok=False,
                action="replace_text",
                path=rel_path,
                detail=f"置換対象の文字列が見つかりません: {old[:80]}",
            )
        return self._commit("replace_text", rel_path, current.replace(old, new))

    # ---- 内部処理 ----------------------------------------------------

    def _current_content(self, target: Path) -> str | None:
        """現時点の内容を返す(dry-run では書き込み予定の内容を優先)。"""
        if target in self._pending:
            return self._pending[target]
        if target.exists():
            return security.read_workspace_text(target, self.workspace)
        return None

    def _commit(self, action: str, rel_path: str, new_content: str) -> FileOpResult:
        target = security.ensure_editable(rel_path, self.workspace)

        result = FileOpResult(ok=True, action=action, path=rel_path, new_content=new_content)

        # 機密情報らしき内容は書き込み前に必ず redact する
        if redactor.contains_sensitive(new_content):
            new_content = redactor.redact(new_content)
            result.new_content = new_content
            result.redacted = True
            result.notes.append("機密情報らしき文字列を [REDACTED] に置換しました")
            logger.warning("[%s] %s: 機密情報らしき文字列を置換しました", action, rel_path)

        if not self.apply:
            self._pending[target] = new_content
            result.detail = "dry-run: 実ファイルは変更していません(--apply で適用)"
            logger.info("[dry-run] %s %s (%d 文字)", action, rel_path, len(new_content))
            return result

        # 実編集: 既存ファイルは必ずバックアップしてから書き込む
        if target.exists():
            backup_path = self._backup(target)
            result.notes.append(f"バックアップ: {backup_path}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(new_content, encoding="utf-8")
        result.applied = True
        result.detail = "適用済み"
        logger.info("[apply] %s %s", action, rel_path)
        return result

    def _backup(self, target: Path) -> Path:
        """編集前のファイルを backups/<timestamp>/<相対パス> へ退避する。"""
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        rel = target.resolve().relative_to(self.workspace.resolve())
        backup_path = self.backup_dir / stamp / rel
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, backup_path)
        logger.info("バックアップ作成: %s", backup_path)
        return backup_path
