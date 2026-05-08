# Mirai Ledger

資産管理と家計簿をひとつにした、スマホ優先の残高予測アプリです。

## 主な機能

- 収入、支出、振替のクイック入力
- 口座別残高と総資産の自動計算
- 固定費、クレカ引落を含む月末残高予測
- カテゴリー別支出分析と支出差アドバイス
- 目標貯金の達成率、達成予測、改善シミュレーション
- 個人家計簿、共有家計簿の作成、招待コード参加、切り替え
- 管理者画面の導線
- Supabase PostgreSQL / RLS のスキーマ雛形

## 起動

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## Supabase 接続

`.env.local.example` を `.env.local` にコピーし、Supabase の URL と anon key を設定してください。

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

DB の初期スキーマは `supabase/schema.sql` にあります。

Supabase の SQL Editor で `supabase/schema.sql` を実行すると、以下が作成されます。

- Supabase Auth と紐づく `profiles`
- 個人/共有の `households`
- 口座、カテゴリー、取引、固定費、目標貯金
- 全テーブルの RLS
- 家計簿メンバー判定用の Security Definer 関数
- 別 household の口座・カテゴリーを混ぜた登録を拒否する検証トリガー
- 共有家計簿の作成/参加 RPC

## 認証

- メールアドレス / パスワード
- Google OAuth

Google OAuth を使う場合は Supabase Dashboard の Authentication Providers で Google を有効化し、リダイレクト URL にローカル開発用の `http://localhost:3001` と本番 URL を追加してください。

## 初回管理者アカウント

1. Supabase SQL Editor で `supabase/schema.sql` を実行
2. アプリでアカウント作成
3. メール確認が有効な場合は確認後にログイン
4. 設定画面の「初回管理者にする」を押す

`claim_first_admin()` は admin が1人も存在しない場合だけ成功します。2人目以降の管理者追加は Supabase SQL Editor など、管理者権限を持つ安全なバックエンド経由で行ってください。

## セキュリティ

この実装では以下を入れています。

- DB は RLS で household 単位に分離
- 管理画面は `profiles.role = 'admin'` のユーザーだけ表示
- `role` 昇格は通常ユーザー自身では不可
- ソフトデリート用 `deleted_at`
- 参照 ID の household 整合性チェック
- `X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`、CSP

本番運用では anon key だけをフロントに置き、service role key は絶対にブラウザへ渡さないでください。

## 現在の実装メモ

Supabase 接続情報が設定されている場合は DB に保存します。接続情報が未設定の場合は設定案内画面を表示します。
