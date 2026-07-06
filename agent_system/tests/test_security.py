"""セキュリティ機構のテスト。

- 機密情報の redact([REDACTED] 置換)
- 機密ファイル(.env / credentials / DB / 顧客データ)の読み取り拒否
- workspace 外パスの編集拒否
- STATE.md にメールアドレス・電話番号・キーらしき文字列が保存されないこと
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from core import redactor, security  # noqa: E402
from core.state_manager import StateManager  # noqa: E402


class TestRedactor(unittest.TestCase):
    def test_redacts_email(self):
        text = "連絡先: taro.yamada@example.com まで"
        out = redactor.redact(text)
        self.assertNotIn("taro.yamada@example.com", out)
        self.assertIn("[REDACTED]", out)

    def test_redacts_phone_numbers(self):
        for phone in ["090-1234-5678", "03-1234-5678", "09012345678"]:
            out = redactor.redact(f"tel: {phone}")
            self.assertNotIn(phone, out, f"電話番号 {phone} が redact されていません")
            self.assertIn("[REDACTED]", out)

    def test_redacts_secret_keys(self):
        samples = [
            "sk-abcdefghijklmnop1234",
            "AKIAIOSFODNN7EXAMPLE",
            "ghp_abcdefghijklmnopqrstuv123456",
            "xoxb-123456789012-abcdefghijk",
        ]
        for secret in samples:
            out = redactor.redact(f"value: {secret}")
            self.assertNotIn(secret, out, f"{secret} が redact されていません")

    def test_redacts_key_value_credentials(self):
        out = redactor.redact("api_key=supersecret123 password: hunter22")
        self.assertNotIn("supersecret123", out)
        self.assertNotIn("hunter22", out)

    def test_contains_sensitive(self):
        self.assertTrue(redactor.contains_sensitive("mail: a@example.com"))
        self.assertFalse(redactor.contains_sensitive("ただのテキストです"))


class TestForbiddenFiles(unittest.TestCase):
    def test_env_files_rejected(self):
        for name in [".env", ".env.local", "prod.env"]:
            with self.assertRaises(security.SecurityError, msg=name):
                security.ensure_readable(name)

    def test_credential_files_rejected(self):
        for name in [
            "credentials.json",
            "token.json",
            "server.key",
            "cert.pem",
            "data.sqlite",
            "app.db",
            "id_rsa",
        ]:
            with self.assertRaises(security.SecurityError, msg=name):
                security.ensure_readable(name)

    def test_customer_data_files_rejected(self):
        for name in ["顧客リスト.csv", "customer_data.xlsx", "会員一覧.csv", "個人情報.xls"]:
            with self.assertRaises(security.SecurityError, msg=name):
                security.ensure_readable(name)

    def test_normal_files_allowed(self):
        for name in ["notes.md", "plan.json", "summary.txt"]:
            security.ensure_readable(name)  # 例外が出ないこと


class TestWorkspaceBoundary(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.workspace = Path(self.tmp.name) / "workspace"
        self.workspace.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_relative_escape_rejected(self):
        with self.assertRaises(security.SecurityError):
            security.ensure_editable("../outside.txt", self.workspace)

    def test_absolute_outside_rejected(self):
        with self.assertRaises(security.SecurityError):
            security.ensure_editable("/etc/hosts", self.workspace)

    def test_forbidden_file_inside_workspace_rejected(self):
        with self.assertRaises(security.SecurityError):
            security.ensure_editable("secrets.key", self.workspace)

    def test_inside_workspace_allowed(self):
        resolved = security.ensure_editable("notes/a.md", self.workspace)
        self.assertTrue(str(resolved).startswith(str(self.workspace.resolve())))


class TestStateRedaction(unittest.TestCase):
    """STATE.md に機密情報が保存されないこと。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state_file = Path(self.tmp.name) / "STATE.md"
        self.state = StateManager(self.state_file)

    def tearDown(self):
        self.tmp.cleanup()

    def test_email_not_saved(self):
        self.state.log_failure(1, "task", "担当 hanako@example.com に確認")
        saved = self.state_file.read_text(encoding="utf-8")
        self.assertNotIn("hanako@example.com", saved)
        self.assertIn("[REDACTED]", saved)

    def test_phone_not_saved(self):
        self.state.add_skill("窓口 090-1234-5678 に電話する")
        saved = self.state_file.read_text(encoding="utf-8")
        self.assertNotIn("090-1234-5678", saved)

    def test_secret_key_not_saved(self):
        self.state.add_pending_review("鍵 sk-abcdefghijklmnop1234 が見つかった")
        saved = self.state_file.read_text(encoding="utf-8")
        self.assertNotIn("sk-abcdefghijklmnop1234", saved)

    def test_mission_redacted(self):
        self.state.set_mission("顧客 taro@example.com への返信文を作る")
        saved = self.state_file.read_text(encoding="utf-8")
        self.assertNotIn("taro@example.com", saved)


if __name__ == "__main__":
    unittest.main()
