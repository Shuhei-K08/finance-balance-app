# Mirai Ledger - データベーススキーマ

## 概要
Supabase PostgreSQL を使用した家計簿アプリのスキーマ定義。Row Level Security (RLS) による household 単位のデータ分離と、Security Definer 関数を使用した安全な操作を実装。

---

## カスタム型 (Enums)

### ledger_space_type
```
'personal' | 'shared'
```
家計簿の種別。個人管理 or 複数人での共有管理。

### ledger_mode
```
'cashflow' | 'balance'
```
レジャー管理モード。キャッシュフロー管理 or 残高管理。

### transaction_type
```
'income' | 'expense' | 'transfer'
```
取引の種類。

### fixed_cost_status
```
'planned' | 'confirmed' | 'paid'
```
固定費の支払い状況。予定 → 確定 → 支払済み。

---

## テーブル設計

### 1. profiles
ユーザープロフィール（Supabase Auth と連携）

| カラム | 型 | 説明 |
|--------|-----|------|
| **id** | uuid PK | Auth.users との FK |
| display_name | text | ユーザー表示名 |
| role | text | 'user' \| 'admin' (デフォルト: 'user') |
| deleted_at | timestamptz | ソフトデリート用タイムスタンプ |
| created_at | timestamptz | レコード作成日時 |

**RLS**: 自分のレコード or 管理者が参照可能


### 2. admin_email_allowlist
管理者メールアドレスホワイトリスト（管理者のみアクセス可）

| カラム | 型 | 説明 |
|--------|-----|------|
| **email** | citext PK | ホワイトリスト登録メール |
| created_at | timestamptz | 追加日時 |

**RLS**: 管理者のみアクセス可


### 3. households
家計簿（個人/共有）の最上位単位

| カラム | 型 | 説明 |
|--------|-----|------|
| **id** | uuid PK | 自動生成 UUID |
| owner_id | uuid FK | 所有者（profiles.id） |
| name | text | 家計簿名 |
| space_type | ledger_space_type | 'personal' \| 'shared' |
| mode | ledger_mode | 'cashflow' \| 'balance' (デフォルト: 'balance') |
| invite_code | text UNIQUE | 共有家計簿の参加招待コード (8文字) |
| deleted_at | timestamptz | ソフトデリート |
| created_at | timestamptz | 作成日時 |

**RLS**: 
- メンバーは参照可能
- オーナーのみ作成・更新可能
- 管理者は全て参照可能


### 4. household_members
家計簿メンバー関連テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| **household_id** | uuid FK | households.id |
| **user_id** | uuid FK | profiles.id |
| member_role | text | 'owner' \| 'member' (デフォルト: 'member') |
| created_at | timestamptz | 参加日時 |

**PK**: (household_id, user_id)  
**RLS**: 
- メンバー本人、家計簿メンバー、管理者が参照可能
- 自身の参加のみ挿入可能
- オーナー or 管理者のみ更新・削除可能


### 5. accounts
口座（銀行口座、クレジットカード、現金等）

| カラム | 型 | 説明 |
|--------|-----|------|
| **id** | uuid PK | 自動生成 UUID |
| household_id | uuid FK | 所属家計簿 |
| name | text | 口座名 |
| account_type | text | 'bank' \| 'cash' \| 'credit' \| 'saving' |
| opening_balance | numeric(14,0) | 開始残高 |
| opening_balance_date | date | 開始残高の日付 |
| color | text | UI 色コード (デフォルト: '#0f766e') |
| closing_day | int | クレジットカード締め日 (1-31) |
| withdrawal_day | int | クレジットカード引落日 (1-31) |
| withdrawal_account_id | uuid FK | 引落先口座 |
| deleted_at | timestamptz | ソフトデリート |
| created_at | timestamptz | 作成日時 |

**CHECK**: closing_day, withdrawal_day は 1～31 の範囲  
**INDEX**: household_id (deleted_at is null でフィルタ)  
**RLS**: メンバーのみアクセス可


### 6. categories
支出カテゴリー（階層構造対応）

| カラム | 型 | 説明 |
|--------|-----|------|
| **id** | uuid PK | 自動生成 UUID |
| household_id | uuid FK | 所属家計簿 |
| parent_id | uuid FK | 親カテゴリー (NULL = ルート) |
| category_kind | text | 'expense' \| 'income' (デフォルト: 'expense') |
| name | text | カテゴリー名 |
| color | text | UI 色コード (デフォルト: '#0f766e') |
| deleted_at | timestamptz | ソフトデリート |
| created_at | timestamptz | 作成日時 |

**INDEX**: household_id (deleted_at is null でフィルタ)  
**RLS**: メンバーのみアクセス可


### 7. transactions
取引記録（収入、支出、振替）

| カラム | 型 | 説明 |
|--------|-----|------|
| **id** | uuid PK | 自動生成 UUID |
| household_id | uuid FK | 所属家計簿 |
| transaction_type | transaction_type | 'income' \| 'expense' \| 'transfer' |
| amount | numeric(14,0) | 金額 (> 0) |
| category_id | uuid FK | カテゴリー (振替の場合は NULL) |
| account_id | uuid FK | 取引元口座 |
| transfer_to_account_id | uuid FK | 移動先口座 (振替の場合のみ) |
| occurred_on | date | 発生日 |
| reflected_on | date | 反映日（クレカの場合は引落日） |
| credit_status | text | 'unconfirmed' \| 'confirmed' \| 'withdrawn' (クレカのみ) |
| memo | text | メモ |
| deleted_at | timestamptz | ソフトデリート |
| created_at | timestamptz | 作成日時 |

**CHECK**: 
- amount > 0
- (transfer のみ transfer_to_account_id が null でない)
- (transfer 以外は transfer_to_account_id が null)

**INDEX**: household_id, occurred_on desc (deleted_at is null でフィルタ)  
**RLS**: メンバーのみアクセス可


### 8. fixed_costs
固定費（毎月の自動計上予定）

| カラム | 型 | 説明 |
|--------|-----|------|
| **id** | uuid PK | 自動生成 UUID |
| household_id | uuid FK | 所属家計簿 |
| category_id | uuid FK | カテゴリー |
| account_id | uuid FK | 引落口座 (NULL = 自動選択) |
| name | text | 固定費名 |
| amount | numeric(14,0) | 金額 (>= 0) |
| is_variable | boolean | 変動費フラグ |
| due_day | int | 支払い日 (1-31) |
| status | fixed_cost_status | 'planned' \| 'confirmed' \| 'paid' |
| effective_from | date | 有効開始日 |
| effective_to | date | 有効終了日 |
| deleted_at | timestamptz | ソフトデリート |
| created_at | timestamptz | 作成日時 |

**CHECK**: due_day は 1～31、amount >= 0  
**INDEX**: household_id (deleted_at is null でフィルタ)  
**RLS**: メンバーのみアクセス可


### 9. saving_goals
貯金目標

| カラム | 型 | 説明 |
|--------|-----|------|
| **id** | uuid PK | 自動生成 UUID |
| household_id | uuid FK | 所属家計簿 |
| account_id | uuid FK | 目標金額保有口座 (NULL = 自動選択) |
| name | text | 目標名 |
| target_amount | numeric(14,0) | 目標金額 (> 0) |
| deadline | date | 達成期限 |
| monthly_boost | numeric(14,0) | 月次ブースト金額 (>= 0) |
| deleted_at | timestamptz | ソフトデリート |
| created_at | timestamptz | 作成日時 |

**CHECK**: target_amount > 0, monthly_boost >= 0  
**INDEX**: household_id (deleted_at is null でフィルタ)  
**RLS**: メンバーのみアクセス可

---

## Security Definer 関数

### is_admin()
現在のユーザーが管理者であるか判定

```sql
select exists (
  select 1 from profiles
  where id = auth.uid()
    and role = 'admin'
    and deleted_at is null
);
```

### is_household_member(target_household_id uuid)
現在のユーザーが指定の家計簿メンバーであるか判定

### owns_household(target_household_id uuid)
現在のユーザーが指定の家計簿オーナーであるか判定

### claim_first_admin()
初回管理者を設定（admin が1人も存在しない場合のみ成功）

### claim_configured_admin()
メールアドレスホワイトリストに登録された管理者を設定

### ensure_personal_ledger()
個人家計簿がない場合は自動作成。デフォルト口座・カテゴリー・固定費・目標を初期化。

```
返り値: household_id (既存 or 新規作成)
作成される初期値:
  - 口座: 生活口座、貯金口座、現金、VISAカード
  - 支出カテゴリー: 食費（スーパー、外食）、住居（光熱費）、娯楽（サブスク）
  - 収入カテゴリー: 給与
  - 固定費: 家賃、電気代、保険
  - 目標: 生活防衛資金（200万円）、旅行資金（45万円）
```

### create_shared_ledger(ledger_name text)
共有家計簿を新規作成。8文字の招待コードを自動生成。

```
返り値: household_id
同時に個人家計簿と同様の初期化を行う
```

### join_shared_ledger(code text)
招待コードで共有家計簿に参加

### remove_shared_ledger_member(target_household_id uuid, target_user_id uuid)
家計簿からメンバー削除（オーナーのみ）

### leave_shared_ledger(target_household_id uuid)
家計簿から脱退（メンバー用）

### delete_shared_ledger(target_household_id uuid)
共有家計簿を削除（オーナーのみ）

### update_transaction_safe()
取引を更新（権限チェック付き）

### delete_transaction_safe()
取引を削除（権限チェック付き、ソフトデリート）

### validate_household_refs()
トリガー関数。参照 ID の household 整合性をチェック。

---

## トリガー

| トリガー名 | テーブル | タイミング | 関数 |
|-----------|---------|-----------|------|
| validate_accounts_household_refs | accounts | BEFORE INSERT/UPDATE | validate_household_refs |
| validate_categories_household_refs | categories | BEFORE INSERT/UPDATE | validate_household_refs |
| validate_transactions_household_refs | transactions | BEFORE INSERT/UPDATE | validate_household_refs |
| validate_fixed_costs_household_refs | fixed_costs | BEFORE INSERT/UPDATE | validate_household_refs |
| validate_saving_goals_household_refs | saving_goals | BEFORE INSERT/UPDATE | validate_household_refs |

---

## Row Level Security (RLS) ポリシー

### profiles
- **SELECT**: 自分のレコード or 管理者
- **INSERT**: 自分のレコード
- **UPDATE**: 自分（role は user のままで）or 管理者が role を変更可能

### admin_email_allowlist
- **全操作**: 管理者のみ

### households
- **SELECT**: メンバー or オーナー or 管理者
- **INSERT**: オーナー or 管理者
- **UPDATE**: オーナー or 管理者

### household_members
- **SELECT**: 自分、メンバー、管理者
- **INSERT**: 自分が参加、or オーナーがメンバー追加
- **UPDATE**: オーナー or 管理者
- **DELETE**: オーナー or 管理者

### accounts, categories, transactions, fixed_costs, saving_goals
- **全操作**: メンバーのみ

---

## 初期化フロー

### 1. ユーザー登録時
```
1. Supabase Auth でユーザー作成
2. profiles テーブルに自動挿入
3. (初回管理者の場合) claim_first_admin() 実行
```

### 2. 個人家計簿初期化
```
1. ensure_personal_ledger() 実行
2. デフォルト口座・カテゴリー・固定費・目標を自動作成
```

### 3. 共有家計簿作成
```
1. create_shared_ledger(name) 実行
2. 招待コードを生成
3. 初期化処理を実行
4. メンバーに join_shared_ledger(code) で参加させる
```

---

## 参考: インデックス戦略

```sql
-- 高速検索用インデックス
create index household_members_user_id_idx on household_members(user_id);
create index accounts_household_id_idx on accounts(household_id) where deleted_at is null;
create index categories_household_id_idx on categories(household_id) where deleted_at is null;
create index transactions_household_id_occurred_on_idx on transactions(household_id, occurred_on desc) where deleted_at is null;
create index fixed_costs_household_id_idx on fixed_costs(household_id) where deleted_at is null;
create index saving_goals_household_id_idx on saving_goals(household_id) where deleted_at is null;
create unique index households_invite_code_uidx on households(invite_code) where invite_code is not null and deleted_at is null;
```

---

## 関連リンク
- [[Mirai Ledger - 概要]]
- [[Mirai Ledger - 認証フロー]]
- [[Mirai Ledger - API仕様]]
