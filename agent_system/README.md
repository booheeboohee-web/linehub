# Agent System — 自律型・自己改善 AI エージェント

Orchestrator / Worker / Verifier の 3 役割に分離した、自律稼働・自己改善型のマルチエージェント基盤です。
実行状態と獲得スキルは `STATE.md` に永続化され、次のループで参照されます。

## アーキテクチャ

```
┌──────────────────────────────────────────────────────────┐
│                      AgentLoop (core/loop.py)             │
│                                                          │
│   CONSULT ─▶ PLAN ─▶ EXECUTE ─▶ VERIFY ─▶ (成功) DONE     │
│      ▲                            │                      │
│      │                         (失敗)                     │
│      │                            ▼                      │
│   DISTILL ◀── VERIFY ◀── INVESTIGATE ◀── FAIL             │
│      │                                                   │
│      └────────── STATE.md へスキル書き込み ────────────────┘
└──────────────────────────────────────────────────────────┘

  Orchestrator (claude-opus-4-8)   … タスク分割・調査・進行管理
  Worker       (claude-haiku-4-5)  … サブタスクの実処理(安価・高速)
  Verifier     (claude-opus-4-8)   … 独立検証 + Vision チェック機構
```

- **Fail → Investigate → Verify → Distill → Consult** サイクルをステートマシンとして実装
- 検証は Worker から完全に独立した Verifier エージェントが実施
- セーフティ・クラシファイア拒否 (`stop_reason: "refusal"`)、レート制限、
  一時的な API エラーに対するリトライ + モデルフォールバックを実装

## ディレクトリ構成

```
agent_system/
├── README.md
├── STATE.md            # 動的状態ファイル(ループごとに更新される)
├── requirements.txt
├── config.py           # モデルルーティング / フォールバック設定
├── main.py             # エントリポイント(自律ループ起動)
├── agents/
│   ├── base.py         # BaseAgent(リトライ・フォールバック共通処理)
│   ├── orchestrator.py # 統括: タスク分割 / 調査 / 教訓抽出
│   ├── worker.py       # 作業: サブタスク実行
│   └── verifier.py     # 検証: 独立検証 + Vision チェック
└── core/
    ├── llm_client.py   # Anthropic SDK ラッパ + Mock クライアント
    ├── safety.py       # 例外階層 / リトライ / フォールバックチェーン
    ├── state_manager.py# STATE.md の読み書き
    └── loop.py         # FIVC ステートマシン
```

## 使い方

```bash
cd agent_system
pip install -r requirements.txt

# API キーなしで動作確認(Mock クライアント)
python main.py --goal "ECサイトの商品説明文を10件生成する" --mock

# 実 API で稼働(ANTHROPIC_API_KEY が必要)
export ANTHROPIC_API_KEY=sk-ant-...
python main.py --goal "ECサイトの商品説明文を10件生成する" --max-iterations 5
```

ループは `STATE.md` を更新しながら稼働し続け、目標達成・イテレーション上限・
致命的エラーのいずれかで停止します。獲得した教訓は `STATE.md` の
「Acquired Skills」節に蓄積され、次回起動時の CONSULT フェーズで読み込まれます。
