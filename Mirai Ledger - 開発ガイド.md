# Mirai Ledger - 開発ガイド

## プロジェクト構成

### ディレクトリ構造

```
finance-balance-app/
├── app/                              # Next.js App Router
│   ├── api/
│   │   └── finance-analysis/route.ts # AI分析 API
│   ├── layout.tsx                    # ルートレイアウト
│   ├── page.tsx                      # メインページ（大規模コンポーネント）
│   ├── manifest.ts                   # PWA マニフェスト
│   └── globals.css                   # グローバルスタイル
├── lib/                              # ユーティリティ・ロジック層
│   ├── types.ts                      # TypeScript 型定義
│   ├── db.ts                         # データベース操作（CRUD）
│   ├── finance.ts                    # 家計管理ロジック・計算式
│   ├── supabase.ts                   # Supabase クライアント初期化
│   ├── gemini.ts                     # Google Gemini API インテグレーション
│   ├── storage.ts                    # ローカルストレージ操作
│   └── sample-data.ts                # サンプルデータ生成
├── components/                       # React コンポーネント（現在は空）
├── public/                           # 静的ファイル
├── supabase/
│   └── schema.sql                    # DB スキーマ定義
├── package.json
├── tsconfig.json
├── next.config.mjs
└── .env.local                        # 環境変数（未コミット）
```

---

## コアモジュール

### lib/types.ts
アプリケーション全体で使用される TypeScript 型定義。

**主な型:**
- `SpaceType`: "personal" | "shared"
- `LedgerMode`: "cashflow" | "balance"
- `TransactionType`: "income" | "expense" | "transfer"
- `AccountType`: "bank" | "cash" | "credit" | "saving"
- `FixedCostStatus`: "planned" | "confirmed" | "paid"
- `Account`: 口座情報
- `Category`: カテゴリー（階層構造対応）
- `Transaction`: 取引記録
- `FixedCost`: 固定費
- `Goal`: 貯金目標
- `InvestmentAccount`: 投資口座（オプション機能）

### lib/db.ts
Supabase からのデータベース操作。全CRUD関数を提供。

**主な関数:**
```typescript
// 口座
createAccount(householdId, data)
updateAccount(accountId, data)
deleteAccount(accountId)
getAccounts(householdId)

// 取引
createTransaction(householdId, data)
updateTransaction(transactionId, data)
deleteTransaction(transactionId)
getTransactions(householdId, options)

// カテゴリー
createCategory(householdId, data)
updateCategory(categoryId, data)
deleteCategory(categoryId)
getCategories(householdId)

// 固定費
createFixedCost(householdId, data)
updateFixedCost(fixedCostId, data)
deleteFixedCost(fixedCostId)
getFixedCosts(householdId)

// 貯金目標
createGoal(householdId, data)
updateGoal(goalId, data)
deleteGoal(goalId)
getGoals(householdId)

// 共有家計簿
createSharedLedger(name)
joinSharedLedger(code)
leaveSharedLedger(householdId)
removeSharedLedgerMember(householdId, userId)
deleteSharedLedger(householdId)

// 管理者機能
adminDeleteUser(userId)
adminSuspendUser(userId)
adminResumeUser(userId)
adminDeleteHousehold(householdId)
```

### lib/finance.ts
家計管理ロジックと計算関数。ビジネスロジック層。

**主な計算関数:**
```typescript
// 残高計算
calculateAccountBalance(account, transactions)
confirmedAccountBalance(account, transactions)
totalAssets(accounts, transactions)

// 支出分析
monthlyExpense(month, transactions)
monthlyIncome(month, transactions)
categoryExpense(categoryId, month, transactions)

// 予測計算
projectedMonthEnd(household, month)
fixedCostForecast(month, fixedCosts)
goalProjection(goal, transactions, historicalData)

// ユーティリティ
yen(amount)
transactionTypeLabel(type)
creditStatusLabel(status)
balanceTrend(months)
averageMonthlySaving(months)
todayIso()
```

### lib/gemini.ts
Google Gemini API とのインテグレーション。AI による支出分析・アドバイス提供。

**主な関数:**
```typescript
analyzeFinance(prompt): Promise<string>
buildFinancePrompt(data): string
buildAnnualSavingsPrompt(data): string
```

### lib/supabase.ts
Supabase クライアントの初期化。

```typescript
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);
```

### lib/storage.ts
ブラウザのローカルストレージ操作。

```typescript
loadState<T>(key: string): T | null
saveState<T>(key: string, value: T): void
```

### lib/sample-data.ts
開発・テスト用のサンプルデータ生成。

---

## app/page.tsx

メインアプリケーション（~240KB の大規模 React コンポーネント）。

**主な責務:**
- 認証状態の管理（ログイン/ログアウト）
- 家計簿（household）のロード・切り替え
- UI のレンダリング（取引入力、グラフ、統計等）
- イベントハンドラー（作成・更新・削除操作）
- ローカルストレージとの同期
- Supabase リアルタイム更新のリスン

**アーキテクチャ:**
```
useState で以下を管理:
  - session: 認証情報
  - household: 現在の家計簿
  - households: 利用可能な家計簿一覧
  - transactions: 取引一覧
  - accounts: 口座一覧
  - categories: カテゴリー一覧
  - fixedCosts: 固定費一覧
  - goals: 貯金目標一覧
  - UI状態: モーダル表示/非表示、タブ選択等

useEffect で以下を実行:
  - 初期化時: Supabase Auth のセッションをロード
  - ログイン時: 家計簿データをロード
  - リアルタイム更新: Supabase のリスナーを登録
  - ローカルストレージ同期
```

---

## API ルート

### POST /api/finance-analysis

AI による支出分析 API。

**リクエスト:**
```json
{
  "prompt": "string"
}
```

**レスポンス:**
```json
{
  "result": "string"
}
```

---

## 認証フロー

### 1. ログイン
```
1. ユーザーがメール/パスワード or Google OAuth で認証
2. Supabase Auth で session 生成
3. profiles テーブルから ユーザー情報取得
4. household_members テーブルから 参加家計簿一覧取得
5. 個人家計簿がない場合は ensure_personal_ledger() を自動実行
```

### 2. 家計簿の切り替え
```
1. household_members から参加家計簿一覧を取得
2. 選択した household_id に切り替え
3. 該当家計簿のデータを全ロード
```

### 3. ログアウト
```
1. Supabase Auth からセッション削除
2. ローカルストレージをクリア
3. ログイン画面に遷移
```

---

## データフロー

### 状態管理パターン

```
ユーザー操作 (UI)
    ↓
イベントハンドラー (onClick など)
    ↓
DB 操作関数呼び出し (lib/db.ts)
    ↓
Supabase API 呼び出し
    ↓
DB 更新 (PostgreSQL)
    ↓
RLS ポリシーによる権限チェック
    ↓
レスポンス受信
    ↓
useState で状態更新
    ↓
再レンダリング (UI 更新)
    ↓
localStorage に同期 (オプション)
```

### リアルタイム更新
Supabase の `onAuthStateChange` と `on().subscribe()` を使用して、他のクライアントからの変更をリアルタイム反映。

---

## 開発のポイント

### 型安全性
- すべての関数に explicit な戻り値型を記載
- `lib/types.ts` で共通型を定義
- TypeScript の strict mode を使用

### パフォーマンス
- 大規模データセットは paginate して取得
- useMemo で計算結果をキャッシュ
- useCallback でハンドラー関数をメモ化

### セキュリティ
- Supabase RLS でサーバー側の権限チェック
- anon key のみをクライアント側に配置
- sensitive な情報は environment variable に
- CSP、X-Frame-Options など HTTPヘッダー設定

### エラーハンドリング
```typescript
try {
  const data = await createTransaction(...)
  setState(prev => ({ ...prev, transactions: [...] }))
} catch (error) {
  console.error('Transaction creation failed:', error)
  // ユーザーに通知
}
```

### ローカルストレージ戦略
```typescript
// 読込
const saved = loadState<LedgerState>('ledger-state')
if (saved) setState(saved)

// 保存
useEffect(() => {
  saveState('ledger-state', state)
}, [state])
```

---

## よくある開発タスク

### 新しい機能を追加する場合

1. **型定義を追加**
   ```typescript
   // lib/types.ts
   export type NewFeature = {
     id: string
     name: string
   }
   ```

2. **DB 操作関数を実装**
   ```typescript
   // lib/db.ts
   export async function createNewFeature(data) {
     const { data: result, error } = await supabase
       .from('new_features')
       .insert([data])
     if (error) throw error
     return result
   }
   ```

3. **ビジネスロジック層に追加**
   ```typescript
   // lib/finance.ts
   export function calculateNewFeature(data) {
     // 計算ロジック
   }
   ```

4. **UI に統合**
   ```typescript
   // app/page.tsx
   const [newFeatures, setNewFeatures] = useState<NewFeature[]>([])
   
   useEffect(() => {
     loadNewFeatures()
   }, [household])
   
   const handleCreate = async (data) => {
     await createNewFeature(data)
     await loadNewFeatures()
   }
   ```

5. **DB スキーマを更新**
   ```sql
   -- supabase/schema.sql
   create table if not exists new_features (
     id uuid primary key default gen_random_uuid(),
     household_id uuid not null references households(id),
     -- ...
   )
   ```

### バグを修正する場合

1. **問題を再現**
   - console.log() でデータの流れを確認
   - Network タブで API リクエスト/レスポンスを確認

2. **原因を特定**
   - lib/types.ts で型を確認
   - lib/db.ts で SQL ロジックを確認
   - app/page.tsx で state 更新ロジックを確認

3. **修正を実装**
   - 修正対象のファイルを特定
   - 修正を実装
   - 関連箇所に影響がないか確認

4. **テスト**
   - ブラウザでマニュアルテスト
   - console.log でデータを確認
   - 複数の家計簿で動作確認

---

## 環境変数

### .env.local (開発環境)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 本番環境変数
- Supabase dashboard で設定
- environment secrets に保存

---

## デバッグ方法

### 開発サーバーの起動
```bash
npm run dev
```
→ `http://localhost:3000`

### ブラウザ開発者ツール
```javascript
// Console で直接データアクセス
// localStorage から読込
const state = JSON.parse(localStorage.getItem('ledger-state'))
console.log(state)

// 状態を編集
localStorage.setItem('ledger-state', JSON.stringify(newState))
```

### Supabase ダッシュボード
```
1. Supabase Dashboard にログイン
2. SQL Editor でクエリを実行
3. Table Editor でデータを確認
4. Auth でユーザーを確認
```

---

## パフォーマンス最適化

### バンドルサイズ削減
- 不要な依存関係を削除
- dynamic import で遅延ロード
- tree-shaking が効くように ESM を使用

### レンダリング最適化
- useMemo で再計算を防止
- useCallback でハンドラー関数をメモ化
- React.memo でコンポーネントをメモ化

### データベースクエリ
- 不要なカラムを除外する SELECT
- インデックスを活用
- N+1 クエリを避ける

---

## テスト戦略

### ユニットテスト
- lib/finance.ts の計算ロジック
- lib/db.ts の DB 操作

### 統合テスト
- 認証フロー
- 家計簿の作成・編集・削除
- 共有家計簿のメンバー管理

### E2E テスト
- ログイン → 取引入力 → グラフ表示
- 共有家計簿の作成 → メンバー招待 → データ同期

---

## 関連リンク

- [[Mirai Ledger - 概要]]
- [[Mirai Ledger - データベーススキーマ]]
- [[Mirai Ledger - API仕様]]
