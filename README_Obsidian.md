# Mirai Ledger - Obsidian プロジェクトノート

このフォルダ内にあるマークダウンファイルは、Obsidian で管理されるプロジェクトドキュメントです。

## 📑 ドキュメント一覧

### 1. [[Mirai Ledger - 概要]]
プロジェクト全体の概要。主な機能、技術スタック、セットアップ方法、セキュリティ実装をまとめたドキュメント。

**含まれる内容:**
- プロジェクト名・説明
- 主な機能一覧
- 技術スタック
- 認証方式
- セキュリティ実装
- 初期セットアップガイド
- 開発コマンド
- プロジェクト構成図

### 2. [[Mirai Ledger - データベーススキーマ]]
Supabase PostgreSQL のスキーマ定義と、データベース関連の実装詳細。

**含まれる内容:**
- カスタム型（Enum）の定義
- テーブル設計（全9テーブル）
- Security Definer 関数（12個）
- トリガー定義
- Row Level Security (RLS) ポリシー
- 初期化フロー
- インデックス戦略

### 3. [[Mirai Ledger - 開発ガイド]]
アプリケーション開発に関する実装ガイド。ファイル構造、コアモジュール、データフローなど。

**含まれる内容:**
- ディレクトリ構造
- コアモジュール解説（6ファイル）
- 認証フロー
- データフロー
- 開発のポイント
- よくある開発タスク
- 環境変数設定
- デバッグ方法
- パフォーマンス最適化
- テスト戦略

---

## 🚀 クイックリンク

### セットアップ
```bash
npm install
npm run dev
```

[セットアップ手順を見る](Mirai%20Ledger%20-%20概要.md#初期セットアップ)

### 技術スタック
- **フレームワーク**: Next.js 14.2.3 + TypeScript 5.4.5
- **DB**: Supabase PostgreSQL + RLS
- **認証**: Supabase Auth
- **UI**: React 18.3.1 + Recharts + lucide-react
- **IDE**: Visual Studio Code + ESLint

### 重要な URL
- **Supabase Dashboard**: https://app.supabase.com/
- **開発サーバー**: http://localhost:3000
- **Git リポジトリ**: [finance-balance-app]

---

## 📋 プロジェクト概要

| 項目 | 内容 |
|-----|------|
| **プロジェクト名** | Mirai Ledger |
| **説明** | 資産管理と家計簿をひとつにした、スマホ優先の残高予測アプリ |
| **ステータス** | 開発中 |
| **バージョン** | 0.1.0 |
| **ディレクトリ** | `/Users/kuboshuuhei/finance-balance-app` |

---

## 🎯 主な機能

1. **取引管理** - 収入、支出、振替のクイック入力
2. **資産管理** - 口座別残高と総資産の自動計算
3. **予測・分析** - 月末残高予測、支出分析、改善提案
4. **貯金目標** - 達成率、達成予測、シミュレーション
5. **家計簿管理** - 個人/共有家計簿、メンバー管理
6. **管理機能** - 管理者画面、ロールベースアクセス制御

---

## 🔐 セキュリティ

### 実装済みセキュリティ
✅ RLS (Row Level Security) でデータ分離  
✅ 管理画面は admin ロールのみ表示  
✅ 参照 ID の household 整合性チェック  
✅ ソフトデリート機能  
✅ Security Definer 関数による安全な権限操作  
✅ HTTPセキュリティヘッダー (CSP, X-Frame-Options等)

### 本番環境チェックリスト
- [ ] anon key のみをフロント配置（service role key は使用禁止）
- [ ] 環境変数が安全に管理されているか
- [ ] HTTPS が有効化されているか
- [ ] CORS が適切に設定されているか
- [ ] Rate limiting が設定されているか

---

## 🗂️ ファイル構成

```
finance-balance-app/
├── app/                          # Next.js App Router
├── lib/                          # ビジネスロジック層
│   ├── types.ts                  # TypeScript 型定義
│   ├── db.ts                     # DB 操作関数
│   ├── finance.ts                # 家計管理ロジック
│   ├── supabase.ts               # Supabase クライアント
│   ├── gemini.ts                 # AI 分析
│   ├── storage.ts                # ローカルストレージ
│   └── sample-data.ts            # サンプルデータ
├── supabase/
│   └── schema.sql                # DB スキーマ定義
├── package.json
└── tsconfig.json
```

---

## 📊 データベース構成

### テーブル一覧（9個）
1. **profiles** - ユーザープロフィール
2. **households** - 家計簿（個人/共有）
3. **household_members** - 家計簿メンバー管理
4. **accounts** - 口座
5. **categories** - 支出カテゴリー
6. **transactions** - 取引記録
7. **fixed_costs** - 固定費
8. **saving_goals** - 貯金目標
9. **admin_email_allowlist** - 管理者ホワイトリスト

[詳細スキーマを見る](Mirai%20Ledger%20-%20データベーススキーマ.md)

---

## 🛠️ 開発ワークフロー

### 新機能追加の流れ
1. `lib/types.ts` で型定義
2. `supabase/schema.sql` で DB テーブル追加
3. `lib/db.ts` で CRUD 関数実装
4. `lib/finance.ts` でビジネスロジック実装
5. `app/page.tsx` で UI 統合

### バグ修正の流れ
1. 問題を再現
2. console.log や Network タブで原因特定
3. 修正対象のファイルを特定
4. 修正を実装
5. ブラウザで動作確認

[詳細ガイドを見る](Mirai%20Ledger%20-%20開発ガイド.md#よくある開発タスク)

---

## 🔄 データフロー

```
UI ユーザー操作
  ↓
イベントハンドラー (onClick など)
  ↓
DB 操作関数 (lib/db.ts)
  ↓
Supabase API
  ↓
PostgreSQL
  ↓
RLS ポリシー チェック
  ↓
レスポンス
  ↓
React state 更新
  ↓
UI 再レンダリング
```

---

## 📝 最近の変更

| 日付 | 変更内容 |
|-----|---------|
| 2026-05-18 | Obsidian ドキュメント作成 |
| 2026-05-17 | スキーマ・認証フロー実装 |
| 2026-05-08 | プロジェクト初期化 |

---

## 📚 参考資料

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## 💡 Tips

### ローカル開発時
```bash
# 開発サーバー起動
npm run dev

# ブラウザで確認
# http://localhost:3000

# Supabase に接続確認
# .env.local にキーを設定
```

### テスト用メールアドレス
自由に作成可能。Supabase のメール確認を無効にしていればメール認証は不要。

### データベースの初期化
```bash
# Supabase SQL Editor で実行
# supabase/schema.sql の内容を全てコピー&ペースト
```

---

**最後更新**: 2026-05-18  
**ドキュメントバージョン**: 1.0  
**プロジェクトバージョン**: 0.1.0
