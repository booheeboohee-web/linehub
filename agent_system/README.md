# Agent System — ローカル完結の自己改善ワークフロー補助ツール

Claude Code のセッション内で人間が実行・確認して使う、**完全ローカル動作**の
作業補助ツール群です。ローカルファイルと Python スクリプト(標準ライブラリのみ)で
構成され、以下を一切行いません。

- 外部 LLM / 外部 API の呼び出し
- ネットワーク通信、外部送信、Webhook、クラウド送信
- git push / PR 作成などのリモート操作
- 課金が発生するサービスの利用(依存パッケージもゼロ)

つまり **Claude Pro プランの範囲(Claude Code の利用)だけで完結**し、
追加の API 課金・プラン変更・有料サービス契約は不要です。

## アーキテクチャ

```
┌────────────────────────────────────────────────────────────┐
│                    AgentLoop (core/loop.py)                 │
│                                                            │
│   CONSULT ─▶ PLAN ─▶ EXECUTE ─▶ VERIFY ─▶ (合格) DONE       │
│      ▲                            │                        │
│      │                         (不合格)                     │
│      │                            ▼                        │
│   DISTILL ◀── INVESTIGATE ◀──── FAIL                        │
│      │                                                     │
│      └── 教訓を STATE.md へ / 3回連続失敗で必ず停止 ──────────┘
└────────────────────────────────────────────────────────────┘

  Orchestrator … plan.json の読み込み・検証、失敗のルールベース分析
  Worker       … workspace/ 配下へのローカルファイル操作のみ
  Verifier     … Worker から独立した検証(条件照合 + 機密情報スキャン)
```

- **Fail → Investigate → Verify → Distill → Consult** サイクルをステートマシンで実装
- 進行状況・教訓・失敗履歴は `STATE.md` に永続化し、次回実行時に参照
- 各役割は AI ではなく、ローカル処理・検証・状態管理を担う Python クラス

## セキュリティ設計

| 項目 | 実装 |
|---|---|
| 編集可能範囲 | `workspace/` 配下のみ(symlink 経由の脱出も拒否) |
| dry-run デフォルト | 実編集は `--apply` 指定時のみ |
| バックアップ | 実編集前に必ず `backups/<日時>/` へ退避 |
| 機密ファイル | `.env` / `credentials.json` / `token.json` / `*.key` / `*.pem` / `*.sqlite` / `*.db` / 顧客データ系 CSV・Excel は読み取り・編集とも拒否 |
| 機密情報の保存禁止 | STATE.md・ログ・成果物への書き込みは全て redact(メール・電話番号・キー/トークンらしき文字列を `[REDACTED]` に置換) |
| 失敗時の停止 | 同一タスクが 3 回連続で失敗したら必ず停止して人間確認を要求 |
| 画像 | Vision チェックは実装しない。「人間確認が必要」とログ・STATE.md に記録するのみ |

## ディレクトリ構成

```
agent_system/
├── README.md
├── STATE.md              # 動的状態ファイル(書き込み前に必ず redact)
├── config.py             # パス・上限値の設定(モデル設定は存在しない)
├── main.py               # エントリポイント
├── agents/
│   ├── orchestrator.py   # 計画の読み込み・検証 / 失敗分析 / 教訓整形
│   ├── worker.py         # workspace 内のローカルファイル操作
│   └── verifier.py       # 独立検証(条件照合 + 機密スキャン)
├── core/
│   ├── loop.py           # FIVC ステートマシン
│   ├── state_manager.py  # STATE.md の読み書き(redact 込み)
│   ├── security.py       # 編集範囲の制限・機密ファイルの拒否
│   ├── redactor.py       # [REDACTED] 置換・redact 済みログ出力
│   └── safe_file_ops.py  # dry-run / --apply / バックアップ
├── workspace/            # 唯一の編集可能領域(plan.json もここ)
│   └── plan.example.json # タスク計画のひな形
├── backups/              # 実編集前の自動バックアップ(自動生成)
├── logs/                 # 実行ログ(自動生成・redact 済み)
└── tests/                # セキュリティ・非依存性のテスト
```

## 使い方

追加インストールは不要です(Python 3.9+ / 標準ライブラリのみ)。

```bash
cd agent_system

# 1. タスク計画を作成(ひな形をコピーして編集)
cp workspace/plan.example.json workspace/plan.json

# 2. dry-run で確認(実ファイルは変更されない)
python main.py

# 3. 問題なければ実編集(編集前に backups/ へ自動バックアップ)
python main.py --apply
```

### plan.json の書き方

```json
{
  "goal": "達成したいこと",
  "tasks": [
    {"action": "write_file",   "path": "notes/a.md", "content": "...",
     "verify": {"contains": ["必須文字列"], "not_contains": ["禁止文字列"]}},
    {"action": "append_file",  "path": "notes/a.md", "content": "..."},
    {"action": "replace_text", "path": "notes/a.md", "old": "前", "new": "後"},
    {"action": "human_review", "note": "人間が目視確認する内容"}
  ]
}
```

`path` は `workspace/` からの相対パスです。検証に失敗すると
Fail → Investigate → Distill を経て教訓が `STATE.md` に蓄積され、
3 回連続で失敗した場合は必ず停止して人間の確認を求めます
(`STATE.md` の Pending Human Review 参照)。

## テスト

```bash
cd agent_system
python -m unittest discover -s tests -v
```

- 外部 API / ネットワーク依存コードが存在しないこと
- `.env` などの機密ファイルを読み取らないこと
- STATE.md にメールアドレス・電話番号・キーらしき文字列が保存されないこと
- `--apply` なしでは実ファイルを変更しないこと
- workspace 外のファイル編集を拒否すること
- 3 回連続失敗で必ず停止すること
