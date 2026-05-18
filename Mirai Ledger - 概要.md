# Mirai Ledger

## プロジェクト名
**Mirai Ledger** - 資産管理と家計簿をひとつにした、スマホ優先の残高予測アプリ

## プロジェクト概要
個人および共有の家計簿管理をサポートするWebアプリケーション。収支管理、資産管理、支出分析、貯金目標の達成予測を一つのプラットフォームで提供する。

## 基本情報
- **リポジトリ**: `finance-balance-app`
- **バージョン**: 0.1.0
- **作成日**: 2026-05-18
- **ステータス**: 開発中

---

## 主な機能

### 1. 取引管理
- 収入、支出、振替のクイック入力
- 複数口座の管理
- カテゴリー分類

### 2. 資産管理
- 口座別残高と総資産の自動計算
- 口座間の振替取引

### 3. 予測・分析
- 固定費、クレカ引落を含む月末残高予測
- カテゴリー別支出分析
- 支出差アドバイス

### 4. 貯金目標
- 目標貯金の達成率表示
- 達成予測
- 改善シミュレーション

### 5. 家計簿管理
- 個人家計簿作成
- 共有家計簿作成
- 招待コードによる参加
- 家計簿の切り替え

### 6. 管理機能
- 管理者画面の導線
- ロールベースアクセス制御
- ソフトデリート機能

---

## 技術スタック

### フレームワーク・言語
- **フレームワーク**: Next.js 14.2.3
- **言語**: TypeScript 5.4.5
- **ランタイム**: Node.js + React 18.3.1

### バックエンド・インフラ
- **データベース**: Supabase PostgreSQL
- **認証**: Supabase Auth
- **セキュリティ**: Row Level Security (RLS)
- **API**: Next.js Route Handlers

### フロントエンド・UI
- **グラフ**: Recharts 2.12.7
- **アイコン**: lucide-react 0.468.0
- **スタイル**: CSS Modules / Tailwind CSS

### 開発ツール
- **リンター**: ESLint
- **型チェック**: TypeScript
- **パッケージ管理**: npm

---

## 認証方式

### サポートされている認証
1. **メールアドレス / パスワード認証**
   - Supabase Auth Native Auth

2. **Google OAuth**
   - Supabase Google Provider
   - 設定: Dashboard > Authentication Providers > Google を有効化
   - リダイレクト URL: `http://localhost:3001` (開発), 本番 URL

---

## セキュリティ実装

### データベースセキュリティ
- ✅ RLS (Row Level Security) で household 単位に分離
- ✅ 参照 ID の household 整合性チェック
- ✅ 別 household の口座・カテゴリーを混ぜた登録を拒否するトリガー

### アプリケーションセキュリティ
- ✅ 管理画面は `profiles.role = 'admin'` のユーザーのみ表示
- ✅ `role` 昇格は通常ユーザー自身では不可
- ✅ ソフトデリート用 `deleted_at` フィールド
- ✅ Security Definer 関数による安全な権限操作

### HTTPセキュリティヘッダー
- ✅ `X-Frame-Options`: クリックジャッキング対策
- ✅ `X-Content-Type-Options`: MIME スニッフィング対策
- ✅ `Referrer-Policy`: リファラ情報の制限
- ✅ `Permissions-Policy`: ブラウザ機能の制限
- ✅ CSP (Content Security Policy): インジェクション攻撃対策

### 本番運用時の注意
⚠️ **重要**: anon key だけをフロントに置く。service role key は絶対にブラウザへ渡さない。

---

## 初期セットアップ

### 環境構築
```bash
npm install
npm run dev
```
ブラウザで `http://localhost:3000` を開く

### Supabase 接続設定
1. `.env.local.example` を `.env.local` にコピー
2. Supabase の URL と anon key を設定
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
   ```

### データベース初期化
1. Supabase SQL Editor を開く
2. `supabase/schema.sql` を実行
3. 以下が自動作成される:
   - `profiles`: Supabase Auth と紐づくユーザー情報
   - `households`: 個人/共有家計簿
   - `accounts`: 口座情報
   - `categories`: 支出カテゴリー
   - `transactions`: 取引記録
   - `fixed_costs`: 固定費
   - `savings_goals`: 貯金目標
   - RLS ポリシー
   - Security Definer 関数
   - 検証トリガー

### 初回管理者設定
1. Supabase SQL Editor で `supabase/schema.sql` を実行
2. アプリでアカウント作成
3. メール確認が有効な場合は確認後にログイン
4. 設定画面の「初回管理者にする」を押す

**注意**: `claim_first_admin()` は admin が1人も存在しない場合だけ成功。2人目以降の管理者追加は SQL Editor など管理者権限を持つ安全なバックエンド経由で行うこと。

---

## 開発コマンド

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバー起動 |
| `npm run lint` | ESLint 実行 |

---

## プロジェクト構成

```
finance-balance-app/
├── app/                          # Next.js App Router
│   ├── api/                      # API Route Handlers
│   ├── layout.tsx                # Root Layout
│   ├── page.tsx                  # Main Page
│   └── globals.css               # Global Styles
├── lib/                          # ユーティリティ・ロジック
│   ├── types.ts                  # TypeScript型定義
│   ├── db.ts                     # データベース処理
│   ├── finance.ts                # 家計管理ロジック
│   ├── supabase.ts               # Supabase初期化
│   ├── gemini.ts                 # AI分析 (Gemini)
│   ├── storage.ts                # ローカルストレージ
│   └── sample-data.ts            # サンプルデータ
├── public/                       # 静的ファイル
├── supabase/
│   └── schema.sql                # DB スキーマ定義
├── package.json                  # 依存関係定義
├── tsconfig.json                 # TypeScript設定
├── next.config.mjs               # Next.js設定
├── .env.local                    # 環境変数 (本番用)
└── README.md                     # このファイル
```

---

## 関連リンク

- [[Mirai Ledger - データベーススキーマ]]
- [[Mirai Ledger - 認証フロー]]
- [[Mirai Ledger - API仕様]]
- [[Mirai Ledger - 開発ガイド]]
