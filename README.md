# LineHub 🚀
> LステップやエルメのようなLINE/Instagram/メール マーケティング自動化ツール

## 機能
| 機能 | 説明 |
|---|---|
| 👥 友だち管理 | タグ・セグメント・プラットフォーム別の友だち管理 |
| 🤖 シナリオ配信 | 友だち追加・キーワード・手動トリガーで自動ステップ配信 |
| 📢 一斉配信 | タグ絞り込み付きブロードキャスト・予約送信 |
| 📱 リッチメニュー | LINEリッチメニューの作成・管理・適用 |

---

## セットアップ手順

### 1. Supabase プロジェクト作成

1. [supabase.com](https://supabase.com) でプロジェクトを作成
2. **SQL Editor** で `supabase/schema.sql` の内容を貼り付けて実行
3. **Project Settings > API** から以下をコピー：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` キー → `SUPABASE_SERVICE_ROLE_KEY`

### 2. LINE Messaging API 設定

1. [LINE Developers Console](https://developers.line.biz/) でチャンネルを作成
2. **Messaging API** チャンネルを選択
3. 以下をコピー：
   - チャンネルアクセストークン（長期） → `LINE_CHANNEL_ACCESS_TOKEN`
   - チャンネルシークレット → `LINE_CHANNEL_SECRET`
4. Webhook URL を後で設定（デプロイ後）

### 3. 環境変数を設定

`.env.local` を編集：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
LINE_CHANNEL_ACCESS_TOKEN=xxxx
LINE_CHANNEL_SECRET=xxxx
RESEND_API_KEY=re_xxxx
EMAIL_FROM=noreply@yourdomain.com
CRON_SECRET=your_random_secret
```

### 4. 開発サーバー起動

```bash
npm run dev
```
→ http://localhost:3000

### 5. 管理者アカウント作成

Supabase ダッシュボード > **Authentication > Users > Invite user** からメール招待。

---

## Vercel デプロイ後の設定

1. **環境変数** を Vercel ダッシュボードに追加
2. LINE Developers Console の **Webhook URL** に設定：
   `https://your-app.vercel.app/api/webhook/line`

---

## コスト試算（月額）

| サービス | 費用 |
|---|---|
| Vercel Hobby | 無料 |
| Supabase Free | 無料（500MB DB） |
| LINE Basic | 無料（Push200通/月） |
| Resend Free | 無料（3,000通/月） |
| **合計** | **¥0〜** |

---

## 開発サーバー（オリジナルの説明）

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
