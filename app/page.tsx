"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  ArrowDownUp,
  BarChart3,
  Copy,
  Goal,
  Home,
  Landmark,
  ListPlus,
  PiggyBank,
  Settings,
  Sparkles,
  LogOut,
  Mail,
  Lock,
  UserPlus,
  Wallet
} from "lucide-react";
import {
  balanceTrend,
  averageMonthlySaving,
  calculateAccountBalance,
  categoryExpense,
  creditStatusLabel,
  fixedCostForecast,
  goalProjection,
  monthTransactions,
  monthlyExpense,
  monthlyIncome,
  pendingCreditWithdrawals,
  projectedMonthEnd,
  spendingAdvice,
  todayIso,
  totalAssets,
  transactionTypeLabel,
  yen
} from "@/lib/finance";
import { loadState, saveState } from "@/lib/storage";
import { analyzeFinance, buildFinancePrompt } from "@/lib/gemini";
import { LedgerState, TransactionType } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  createSharedLedger,
  createAccount,
  createCategory,
  createFixedCost,
  createGoal,
  deleteAccount,
  deleteCategory,
  deleteFixedCost,
  deleteGoal,
  deleteSharedLedger,
  deleteTransaction,
  insertRemoteTransaction,
  joinSharedLedger,
  leaveSharedLedger,
  loadHouseholdMembers,
  loadRemoteState,
  removeSharedLedgerMember,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  updateAccount,
  updateCategory,
  updateFixedCost,
  updateGoal,
  updateOpeningBalances,
  updateTransaction,
  toJapaneseError
} from "@/lib/db";
import { AccountType } from "@/lib/types";
import type { HouseholdMember } from "@/lib/types";

type Tab = "home" | "analysis" | "goals" | "settings";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "ホーム", icon: Home },
  { id: "analysis", label: "分析", icon: BarChart3 },
  { id: "goals", label: "目標", icon: Goal },
  { id: "settings", label: "設定", icon: Settings }
];

export default function App() {
  const [state, setState] = useState<LedgerState | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDate, setQuickDate] = useState(todayIso());
  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!supabase) {
      setState(loadState());
      setAuthReady(true);
      return;
    }

    let mounted = true;
    bootAuth().catch((error) => {
      if (!mounted) return;
      setNotice(toJapaneseError(error, "Supabase の初期化に失敗しました。"));
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(Boolean(session));
      if (session) {
        setTimeout(() => {
          refreshRemoteState().catch((error) => setNotice(toJapaneseError(error, "家計簿データの読み込みに失敗しました。")));
        }, 0);
      } else {
        setState(null);
      }
    });

    async function bootAuth() {
      const sessionResult = await withTimeout(supabase!.auth.getSession(), 8000, "Supabase の認証確認がタイムアウトしました。URL と anon / publishable key を確認してください。");
      if (!mounted) return;
      setIsAuthed(Boolean(sessionResult.data.session));
      if (sessionResult.data.session) {
        try {
          await withTimeout(refreshRemoteState(), 12000, "家計簿データの読み込みがタイムアウトしました。Supabase SQL Editor で最新の schema.sql を実行済みか確認してください。");
        } catch (error) {
          setState(null);
          setNotice(toJapaneseError(error, "家計簿データの読み込みに失敗しました。"));
        }
      }
      if (mounted) setAuthReady(true);
    }

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state && !supabase) saveState(state);
  }, [state]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function refreshRemoteState() {
    const next = await loadRemoteState(selectedHouseholdId);
    setSelectedHouseholdId(next.householdId);
    setState(next);
  }

  async function switchHousehold(householdId: string) {
    setSelectedHouseholdId(householdId);
    const next = await loadRemoteState(householdId);
    setSelectedHouseholdId(next.householdId);
    setState(next);
  }

  if (!authReady) return <main className="boot"><div><strong>Mirai Ledger</strong><span>資産データを読み込んでいます</span></div></main>;

  if (supabase && !isAuthed) {
    return <AuthScreen notice={notice} setNotice={setNotice} />;
  }

  if (!supabase) {
    return <SetupScreen />;
  }

  if (!state) return <DbErrorScreen notice={notice} onRetry={() => withTimeout(refreshRemoteState(), 12000, "家計簿データの読み込みがタイムアウトしました。").catch((error) => setNotice(toJapaneseError(error, "家計簿データの読み込みに失敗しました。")))} />;

  if (state.needsOpeningSetup) {
    return <OpeningSetupScreen state={state} setNotice={setNotice} onDone={() => refreshRemoteState()} />;
  }

  const month = monthTransactions(state.transactions);
  const stats = {
    assets: totalAssets(state),
    expense: monthlyExpense(month),
    income: monthlyIncome(month),
    forecast: projectedMonthEnd(state),
    fixed: fixedCostForecast(state.fixedCosts),
    credit: pendingCreditWithdrawals(state)
  };

  function openQuick(date = todayIso()) {
    setQuickDate(date);
    setQuickOpen(true);
  }

  async function addTransaction(transaction: {
    type: TransactionType;
    amount: number;
    categoryId?: string;
    accountId: string;
    transferToAccountId?: string;
    date: string;
    memo?: string;
  }) {
    if (!state) return;
    const creditAccount = state.accounts.find((account) => account.id === transaction.accountId && account.type === "credit");
    const withdrawalDate = transaction.type === "expense" && creditAccount ? nextWithdrawalDate(creditAccount, transaction.date) : undefined;
    const payload = {
      ...transaction,
      categoryId: transaction.type === "transfer" ? undefined : transaction.categoryId,
      transferToAccountId: transaction.type === "transfer" ? transaction.transferToAccountId : undefined,
      date: withdrawalDate ?? transaction.date,
      reflectedDate: withdrawalDate,
      creditStatus: transaction.type === "expense" && creditAccount ? "unconfirmed" as const : undefined
    };
    try {
      const id = await insertRemoteTransaction(state.householdId ?? "", payload);
      setState({ ...state, transactions: [{ id, ...payload }, ...state.transactions] });
      setQuickOpen(false);
      setNotice("登録しました。");
    } catch (error) {
      setNotice(toJapaneseError(error, "登録に失敗しました。"));
    }
  }

  return (
    <main className={`app-shell ${state.activeSpace === "shared" ? "shared-ledger" : ""}`}>
      <section className="topbar">
        <div>
          <p className="eyebrow">{state.activeSpace === "shared" ? "共有カレンダー" : "Mirai Ledger"}</p>
          <h1>{state.householdName ?? "未来残高を見ながら整える家計簿"}</h1>
        </div>
        <div className="top-actions">
          <button className="primary-icon" type="button" onClick={() => openQuick()} aria-label="取引を追加">
            <ListPlus size={22} />
          </button>
          <button className="ghost-icon" type="button" onClick={() => signOut().catch((error) => setNotice(toJapaneseError(error)))} aria-label="ログアウト">
            <LogOut size={20} />
          </button>
        </div>
      </section>
      {(state.households ?? []).length > 1 && (
        <section className="ledger-switch" aria-label="家計簿切替">
          {(state.households ?? []).map((household) => (
            <button
              className={household.id === state.householdId ? "active" : ""}
              key={household.id}
              type="button"
              onClick={() => switchHousehold(household.id).catch((error) => setNotice(toJapaneseError(error, "家計簿の切替に失敗しました。")))}
            >
              <span>{household.spaceType === "shared" ? "共有" : "個人"}</span>
              {household.name}
            </button>
          ))}
        </section>
      )}
      {notice && <section className="notice" role="status">{notice}</section>}

      {tab === "home" && <HomeView state={state} stats={stats} setNotice={setNotice} reload={() => refreshRemoteState()} onQuick={openQuick} />}
      {tab === "analysis" && <AnalysisView state={state} />}
      {tab === "goals" && <GoalsView state={state} setNotice={setNotice} reload={() => refreshRemoteState()} />}
      {tab === "settings" && <SettingsView state={state} setNotice={setNotice} reloadHousehold={switchHousehold} />}

      <nav className="bottom-nav">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
              aria-label={item.label}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {quickOpen && <QuickTransactionSheet state={state} initialDate={quickDate} onClose={() => setQuickOpen(false)} onSubmit={addTransaction} />}
    </main>
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function SetupScreen() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Supabase 設定が必要です</p>
        <h1>DB 接続情報を設定してください</h1>
        <p className="auth-copy">`.env.local` に Supabase URL と anon key を入れると、ログイン画面と DB 保存が有効になります。</p>
        <div className="setup-code">
          <code>NEXT_PUBLIC_SUPABASE_URL=...</code>
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY=...</code>
        </div>
      </section>
    </main>
  );
}

function AuthScreen({ notice, setNotice }: { notice: string; setNotice: (message: string) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setNotice("");
    try {
      const email = String(form.get("email"));
      const password = String(form.get("password"));
      if (mode === "signup") {
        await signUpWithEmail(email, password, String(form.get("displayName") || ""));
        setNotice("確認メールを送信しました。メール確認後にログインしてください。");
      } else {
        await signInWithEmail(email, password);
      }
    } catch (error) {
      setNotice(toJapaneseError(error, "認証に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Mirai Ledger</p>
        <h1>{mode === "login" ? "ログイン" : "アカウント作成"}</h1>
        <p className="auth-copy">家計簿データは Supabase Auth と RLS でユーザーごとに分離して保存します。</p>
        {notice && <div className="notice" role="status">{notice}</div>}
        <form className="auth-form" onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }}>
          {mode === "signup" && (
            <label><UserPlus size={16} />表示名<input name="displayName" autoComplete="name" placeholder="山田 太郎" /></label>
          )}
          <label><Mail size={16} />メールアドレス<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label><Lock size={16} />パスワード<input name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="8文字以上" /></label>
          <button className="full-primary" type="submit" disabled={busy}>{busy ? "処理中" : mode === "login" ? "ログイン" : "作成する"}</button>
        </form>
        <button className="google-button" type="button" onClick={() => signInWithGoogle().catch((error) => setNotice(toJapaneseError(error)))}>Googleで続ける</button>
        <button className="switch-auth" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "アカウントを作成する" : "ログインに戻る"}
        </button>
      </section>
    </main>
  );
}

function DbErrorScreen({ notice, onRetry }: { notice: string; onRetry: () => void }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Mirai Ledger</p>
        <h1>DB読み込みで止まりました</h1>
        <p className="auth-copy">Supabase 接続は開始できていますが、家計簿データの取得または初期作成で失敗しています。SQL Editor で `supabase/schema.sql` を実行済みか確認してください。</p>
        {notice && <div className="notice" role="status">{notice}</div>}
        <button className="full-primary" type="button" onClick={onRetry}>再読み込み</button>
        <button className="switch-auth" type="button" onClick={() => signOut()}>ログアウト</button>
      </section>
    </main>
  );
}

function OpeningSetupScreen({ state, setNotice, onDone }: { state: LedgerState; setNotice: (message: string) => void; onDone: () => Promise<void> }) {
  const setupAccounts = state.accounts.filter((account) => account.type !== "credit");
  const [balances, setBalances] = useState<Record<string, { amount: number; date: string }>>(
    Object.fromEntries(setupAccounts.map((account) => [account.id, { amount: account.openingBalance, date: account.openingBalanceDate ?? todayIso() }]))
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateOpeningBalances(balances);
      setNotice("初期残高を保存しました。");
      await onDone();
    } catch (error) {
      setNotice(toJapaneseError(error, "初期残高の保存に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">初期設定</p>
        <h1>現在の残高を入力してください</h1>
        <p className="auth-copy">ここで入力した金額を基準に、今後の収支と月末予測を計算します。あとから口座画面でも変更できます。</p>
        <div className="opening-list">
          {setupAccounts.map((account) => (
            <label key={account.id}>{account.name}
              <input
                type="number"
                min="0"
                value={balances[account.id]?.amount ?? 0}
                onChange={(event) => setBalances({ ...balances, [account.id]: { ...(balances[account.id] ?? { date: todayIso() }), amount: Number(event.target.value) } })}
              />
              <input
                type="date"
                value={balances[account.id]?.date ?? todayIso()}
                onChange={(event) => setBalances({ ...balances, [account.id]: { ...(balances[account.id] ?? { amount: 0 }), date: event.target.value } })}
              />
            </label>
          ))}
        </div>
        <button className="full-primary" type="button" disabled={busy} onClick={save}>{busy ? "保存中" : "初期残高を保存"}</button>
      </section>
    </main>
  );
}

function HomeView({ state, stats, setNotice, reload, onQuick }: { state: LedgerState; stats: Record<string, number>; setNotice: (message: string) => void; reload: () => Promise<void>; onQuick: (date?: string) => void }) {
  const category = categoryExpense(state);
  const assetBreakdown = state.accounts.map((account) => ({
    name: account.name,
    value: Math.max(calculateAccountBalance(account, state.transactions), 0),
    fill: account.color
  })).filter((item) => item.value > 0);
  const assetTotal = assetBreakdown.reduce((sum, item) => sum + item.value, 0);
  const categoryTotal = category.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="view-stack">
      <section className="hero-panel">
        <div>
          <p>総資産</p>
          <strong>{yen.format(stats.assets)}</strong>
          <span>月末予測 {yen.format(stats.forecast)}</span>
        </div>
        <button type="button" onClick={() => onQuick()}><ListPlus size={18} />入力</button>
      </section>

      <div className="stat-grid">
        <Metric icon={Wallet} label="今月支出" value={yen.format(stats.expense)} />
        <Metric icon={Landmark} label="今月収入" value={yen.format(stats.income)} />
        <Metric icon={PiggyBank} label="貯金率" value={`${Math.max(Math.round(((stats.income - stats.expense) / Math.max(stats.income, 1)) * 100), 0)}%`} />
        <Metric icon={Landmark} label="固定費予定" value={yen.format(stats.fixed)} />
        <Metric icon={Wallet} label="引落予定" value={yen.format(stats.credit)} />
      </div>

      <section className="ai-panel">
        <div className="section-title"><h2>AIがお金を分析</h2><span>今月</span></div>
        <AiCommentary state={state} stats={stats} category={category} limit={2} />
      </section>

      <section className="panel chart-panel">
        <div className="section-title"><h2>残高推移</h2><span>予測は点線</span></div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={balanceTrend(state)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5ded2" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis hide domain={["dataMin - 50000", "dataMax + 50000"]} />
            <Tooltip formatter={(value) => yen.format(Number(value))} />
            <Area type="monotone" dataKey="actual" stroke="#0f766e" fill="#99f6e4" strokeWidth={3} />
            <Area type="monotone" dataKey="forecast" stroke="#dc2626" fill="transparent" strokeDasharray="6 6" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <div className="home-chart-grid">
        <section className="panel chart-panel">
          <div className="section-title"><h2>資産の内訳</h2><span>口座別</span></div>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={assetBreakdown.length ? assetBreakdown : [{ name: "未設定", value: 1, fill: "#d6d3d1" }]} dataKey="value" nameKey="name" innerRadius={50} outerRadius={74} paddingAngle={3} labelLine={false} label={(props) => renderCompactPieLabel(props, assetTotal)}>
                {(assetBreakdown.length ? assetBreakdown : [{ name: "未設定", value: 1, fill: "#d6d3d1" }]).map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={(value) => yen.format(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </section>
        <section className="panel chart-panel">
          <div className="section-title"><h2>支出カテゴリ</h2><span>今月</span></div>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={category.length ? category : [{ name: "支出なし", value: 1, fill: "#d6d3d1" }]} dataKey="value" nameKey="name" innerRadius={50} outerRadius={74} paddingAngle={3} labelLine={false} label={(props) => renderCompactPieLabel(props, categoryTotal)}>
                {(category.length ? category : [{ name: "支出なし", value: 1, fill: "#d6d3d1" }]).map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={(value) => yen.format(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </section>
      </div>

      <HomeCalendar state={state} setNotice={setNotice} reload={reload} onQuick={onQuick} />

      <section className="panel">
        <div className="section-title"><h2>最近の支出</h2><span>{state.transactions.length}件</span></div>
        <TransactionList state={state} limit={5} setNotice={setNotice} reload={reload} />
      </section>
    </div>
  );
}

function QuickTransactionSheet({
  state,
  initialDate,
  onClose,
  onSubmit
}: {
  state: LedgerState;
  initialDate: string;
  onClose: () => void;
  onSubmit: (transaction: { type: TransactionType; amount: number; categoryId?: string; accountId: string; transferToAccountId?: string; date: string; memo?: string }) => Promise<void>;
}) {
  const usableAccounts = state.accounts;
  const normalAccounts = state.accounts.filter((account) => account.type !== "credit");
  const expenseCategories = state.categories.filter((category) => category.kind === "expense");
  const incomeCategories = state.categories.filter((category) => category.kind === "income");
  const firstExpenseCategory = expenseCategories[0]?.id ?? state.categories[0]?.id ?? "";
  const firstIncomeCategory = incomeCategories[0]?.id ?? state.categories[0]?.id ?? "";
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(firstExpenseCategory);
  const [accountId, setAccountId] = useState(usableAccounts[0]?.id ?? "");
  const [transferToAccountId, setTransferToAccountId] = useState(normalAccounts.find((account) => account.id !== accountId)?.id ?? normalAccounts[0]?.id ?? "");
  const [date, setDate] = useState(initialDate);
  const [memo, setMemo] = useState("");

  function changeType(nextType: TransactionType) {
    setType(nextType);
    setCategoryId(nextType === "income" ? firstIncomeCategory : firstExpenseCategory);
    if (nextType === "transfer") {
      const from = normalAccounts[0]?.id ?? usableAccounts[0]?.id ?? "";
      const to = normalAccounts.find((account) => account.id !== from)?.id ?? normalAccounts[1]?.id ?? "";
      setAccountId(from);
      setTransferToAccountId(to);
    }
  }

  async function submit() {
    const value = Number(amount);
    if (!value || value <= 0) return;
    await onSubmit({
      type,
      amount: value,
      categoryId: type === "transfer" ? undefined : categoryId || undefined,
      accountId,
      transferToAccountId: type === "transfer" ? transferToAccountId || undefined : undefined,
      date,
      memo
    });
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="bottom-sheet" onSubmit={(event) => { event.preventDefault(); submit(); }} onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="section-title"><h2>クイック入力</h2><span>{date}</span></div>
        <div className="segmented" role="tablist" aria-label="取引種別">
          {(["expense", "income", "transfer"] as TransactionType[]).map((item) => (
            <button className={type === item ? "selected" : ""} key={item} type="button" onClick={() => changeType(item)}>
              {transactionTypeLabel[item]}
            </button>
          ))}
        </div>
        <input className="amount-input" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" placeholder="0" required />
        <div className="form-grid">
          {type !== "transfer" && (
            <label>カテゴリー<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{(type === "income" ? incomeCategories : expenseCategories).map((category) => <option key={category.id} value={category.id}>{category.parentId ? "└ " : ""}{category.name}</option>)}</select></label>
          )}
          <label>{type === "income" ? "入金先" : "支払元"}<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{(type === "transfer" ? normalAccounts : usableAccounts).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          {type === "transfer" && (
            <label>振替先<select value={transferToAccountId} onChange={(event) => setTransferToAccountId(event.target.value)}>{normalAccounts.filter((account) => account.id !== accountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          )}
          <label>日付<input value={date} onChange={(event) => setDate(event.target.value)} type="date" /></label>
        </div>
        <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="メモ" />
        <button className="full-primary" type="submit">登録</button>
      </form>
    </div>
  );
}

function HomeCalendar({ state, setNotice, reload, onQuick }: { state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void>; onQuick: (date: string) => void }) {
  const [selectedMonth, setSelectedMonth] = useState(todayIso().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [modalDate, setModalDate] = useState<string | null>(null);
  const monthKey = selectedMonth;
  const days = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  const firstDay = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1).getDay();
  const monthRows = state.transactions.filter((transaction) => transaction.date.startsWith(monthKey));
  const monthIncome = monthlyIncome(monthRows);
  const monthExpense = monthlyExpense(monthRows);

  function moveMonth(delta: number) {
    const next = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1 + delta, 1);
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(nextKey);
    setSelectedDate(`${nextKey}-01`);
  }

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="section-title calendar-title">
          <button type="button" onClick={() => moveMonth(-1)}>前月</button>
          <input className="month-input" type="month" value={monthKey} onChange={(event) => { setSelectedMonth(event.target.value); setSelectedDate(`${event.target.value}-01`); }} />
          <button type="button" onClick={() => moveMonth(1)}>翌月</button>
        </div>
        <div className="month-summary">
          <span>収入 <strong>{yen.format(monthIncome)}</strong></span>
          <span>支出 <strong>{yen.format(monthExpense)}</strong></span>
          <span>収支 <strong>{yen.format(monthIncome - monthExpense)}</strong></span>
        </div>
        <div className="calendar-grid">
          {["日", "月", "火", "水", "木", "金", "土"].map((day) => <b key={day}>{day}</b>)}
          {Array.from({ length: firstDay }).map((_, index) => <i key={`blank-${index}`} />)}
          {Array.from({ length: days }).map((_, index) => {
            const day = String(index + 1).padStart(2, "0");
            const date = `${monthKey}-${day}`;
            const income = monthRows.filter((transaction) => transaction.date === date && transaction.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
            const expense = monthRows.filter((transaction) => transaction.date === date && transaction.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
            return <button className={date === selectedDate ? "selected-day" : ""} key={date} type="button" onClick={() => { setSelectedDate(date); setModalDate(date); }}><strong>{index + 1}</strong>{income > 0 && <span className="income-mini">+{yen.format(income)}</span>}{expense > 0 && <span>-{yen.format(expense)}</span>}</button>;
          })}
        </div>
        <button className="full-primary" type="button" onClick={() => setModalDate(selectedDate)}>選択日の取引を開く</button>
      </section>
      {modalDate && <CalendarDayModal date={modalDate} state={state} setNotice={setNotice} reload={reload} onClose={() => setModalDate(null)} onQuick={(date) => { setModalDate(null); onQuick(date); }} />}
    </div>
  );
}

function CalendarDayModal({ date, state, setNotice, reload, onClose, onQuick }: { date: string; state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void; onQuick: (date: string) => void }) {
  const rows = state.transactions.filter((transaction) => transaction.date === date);
  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-title"><h2>{date} の取引</h2><span>{rows.length}件</span></div>
        <button className="full-primary" type="button" onClick={() => onQuick(date)}>この日に登録</button>
        {rows.length === 0 ? (
          <div className="empty-state"><span>この日の取引はまだありません。</span></div>
        ) : (
          <TransactionList state={{ ...state, transactions: rows }} setNotice={setNotice} reload={reload} />
        )}
        <button className="google-button" type="button" onClick={onClose}>閉じる</button>
      </section>
    </div>
  );
}

function useFinanceAi(state: LedgerState, stats: Record<string, number>, category: Array<{ name: string; value: number }>) {
  const fallback = buildAiInsights(state, category);
  const [lines, setLines] = useState(fallback);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const top = [...category].sort((a, b) => b.value - a.value)[0];
    const income = stats.income ?? monthlyIncome(monthTransactions(state.transactions));
    const expense = stats.expense ?? monthlyExpense(monthTransactions(state.transactions));
    const prompt = buildFinancePrompt({
      income,
      expense,
      assets: stats.assets ?? totalAssets(state),
      forecast: stats.forecast ?? projectedMonthEnd(state),
      topCategory: top?.name ?? "なし",
      topCategoryAmount: top?.value ?? 0,
      savingRate: Math.max(Math.round(((income - expense) / Math.max(income, 1)) * 100), 0),
      averageSaving: averageMonthlySaving(state),
      creditPending: stats.credit ?? pendingCreditWithdrawals(state)
    });
    let cancelled = false;
    setLoading(true);
    analyzeFinance(prompt)
      .then((text) => {
        if (cancelled) return;
        const next = text.split("\n").map((line) => line.trim()).filter(Boolean);
        setLines(next.length ? next : fallback);
      })
      .catch(() => {
        if (!cancelled) setLines(fallback);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.householdId, state.transactions.length, stats.income, stats.expense, stats.assets, stats.forecast, stats.credit, category.length]);

  return { lines, loading };
}

function AiCommentary({ state, stats, category, limit }: { state: LedgerState; stats: Record<string, number>; category: Array<{ name: string; value: number }>; limit?: number }) {
  const { lines, loading } = useFinanceAi(state, stats, category);
  return (
    <>
      {loading && <p>AIが分析中です...</p>}
      {lines.slice(0, limit).map((line) => <p key={line}>{line}</p>)}
    </>
  );
}

function AnalysisView({ state }: { state: LedgerState }) {
  const category = categoryExpense(state);
  const [drillParentId, setDrillParentId] = useState<string | null>(null);
  const drillParent = state.categories.find((item) => item.id === drillParentId);
  const drillData = drillParent ? subcategoryExpense(state, drillParent.id) : category;
  const totalCategoryExpense = category.reduce((sum, item) => sum + item.value, 0);
  const bars = [
    { name: "収入", value: monthlyIncome(monthTransactions(state.transactions)), fill: "#16a34a" },
    { name: "支出", value: monthlyExpense(monthTransactions(state.transactions)), fill: "#dc2626" },
    { name: "貯金", value: Math.max(monthlyIncome(monthTransactions(state.transactions)) - monthlyExpense(monthTransactions(state.transactions)), 0), fill: "#0f766e" }
  ];
  const trend = monthlyTrend(state);
  const savingAverage = averageMonthlySaving(state);
  const month = monthTransactions(state.transactions);
  const income = monthlyIncome(month);
  const expense = monthlyExpense(month);
  const savingRate = Math.round((income - expense) / Math.max(income, 1) * 100);
  const topCategory = [...category].sort((a, b) => b.value - a.value)[0];
  const suggestedCut = topCategory ? Math.min(Math.ceil(topCategory.value * 0.15 / 1000) * 1000, 30000) : 0;
  const analysisStats = {
    assets: totalAssets(state),
    expense,
    income,
    forecast: projectedMonthEnd(state),
    fixed: fixedCostForecast(state.fixedCosts),
    credit: pendingCreditWithdrawals(state)
  };
  return (
    <div className="view-stack">
      <section className="insight-grid">
        <div className="insight-card teal">
          <PiggyBank size={28} />
          <span>年間でいくら貯金できるか予測</span>
          <p>これまでの収入・支出の傾向から、年間でどれくらい貯金できるかを自動で予測します。</p>
          <strong>{yen.format(savingAverage * 12)}</strong>
          <div className="mini-bars">{[0.42, 0.52, 0.61, 0.72, 0.86, 1].map((height) => <i key={height} style={{ height: `${height * 34}px` }} />)}</div>
        </div>
        <div className="insight-card orange">
          <Goal size={30} />
          <span>AIが支出を分析</span>
          <AiCommentary state={state} stats={analysisStats} category={category} limit={1} />
          <strong>{Math.max(savingRate, 0)}%</strong>
          <div className="progress"><span style={{ width: `${Math.min(Math.max(savingRate, 0), 100)}%` }} /></div>
        </div>
        <div className="insight-card warn">
          <Sparkles size={30} />
          <span>改善アドバイス</span>
          <p>{topCategory ? `${topCategory.name}を月${yen.format(suggestedCut)}減らすと、貯金余力が上がります。` : "支出データが増えると、より具体的に改善提案できます。"}</p>
          <strong>{topCategory ? `${topCategory.name}` : "分析待ち"}</strong>
        </div>
      </section>
      <section className="panel chart-panel">
        <div className="section-title"><h2>収支推移</h2><span>直近6ヶ月</span></div>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5ded2" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip formatter={(value) => yen.format(Number(value))} />
            <Line type="monotone" dataKey="income" name="収入" stroke="#16a34a" strokeWidth={3} />
            <Line type="monotone" dataKey="expense" name="支出" stroke="#dc2626" strokeWidth={3} />
            <Line type="monotone" dataKey="saving" name="貯金" stroke="#0f766e" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </section>
      <section className="panel chart-panel">
        <div className="section-title"><h2>{drillParent ? `${drillParent.name}のサブカテゴリー` : "カテゴリー分析"}</h2><span>{drillParent ? "戻る" : "今月"}</span></div>
        {drillParent && <button className="google-button" type="button" onClick={() => setDrillParentId(null)}>カテゴリー全体に戻る</button>}
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie data={drillData.length ? drillData : [{ name: "支出なし", value: 1, fill: "#d6d3d1" }]} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={4} labelLine={false} label={(props) => renderCompactPieLabel(props, drillData.reduce((sum, item) => sum + item.value, 0))} onClick={(entry) => {
              const parent = state.categories.find((item) => item.name === entry.name && !item.parentId);
              if (parent) setDrillParentId(parent.id);
            }}>
              {(drillData.length ? drillData : [{ name: "支出なし", value: 1, fill: "#d6d3d1" }]).map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
            </Pie>
            <Tooltip formatter={(value) => yen.format(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </section>
      <section className="panel">
        <div className="section-title"><h2>カテゴリー別割合</h2><span>表</span></div>
        <div className="analysis-table">
          <div><strong>カテゴリ</strong><strong>金額</strong><strong>割合</strong></div>
          {category.map((item) => (
            <div key={item.name}>
              <span><i style={{ background: item.fill }} />{item.name}</span>
              <span>{yen.format(item.value)}</span>
              <span>{totalCategoryExpense ? Math.round((item.value / totalCategoryExpense) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel chart-panel">
        <div className="section-title"><h2>月別収支</h2><span>前月比の土台</span></div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={bars}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5ded2" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip formatter={(value) => yen.format(Number(value))} />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
      <section className="advice"><Sparkles size={20} /><p>{spendingAdvice(state)}</p></section>
    </div>
  );
}

function buildAiInsights(state: LedgerState, category: Array<{ name: string; value: number }>) {
  const current = monthTransactions(state.transactions);
  const income = monthlyIncome(current);
  const expense = monthlyExpense(current);
  const saving = income - expense;
  const top = [...category].sort((a, b) => b.value - a.value)[0];
  const insights = [
    `今月の収支は ${yen.format(saving)} です。${saving >= 0 ? "黒字なので、このペースなら残高を守れています。" : "赤字なので、まず大きい支出カテゴリから見直すのが近道です。"}`
  ];
  if (top) {
    const share = expense ? Math.round((top.value / expense) * 100) : 0;
    insights.push(`支出で一番大きいカテゴリは「${top.name}」で、今月支出の約${share}%です。ここを少し調整すると月末残高への影響が大きいです。`);
  }
  const credit = pendingCreditWithdrawals(state);
  if (credit > 0) insights.push(`クレジットカードの未引落が ${yen.format(credit)} あります。引落月の残高に余裕があるか確認しておくと安心です。`);
  if (insights.length < 3) insights.push(spendingAdvice(state));
  return insights;
}

function subcategoryExpense(state: LedgerState, parentId: string) {
  const childIds = state.categories.filter((category) => category.parentId === parentId).map((category) => category.id);
  return state.categories
    .filter((category) => childIds.includes(category.id))
    .map((category) => ({
      name: category.name,
      value: monthTransactions(state.transactions)
        .filter((transaction) => transaction.type === "expense" && transaction.categoryId === category.id)
        .reduce((sum, transaction) => sum + transaction.amount, 0),
      fill: category.color
    }))
    .filter((item) => item.value > 0);
}

function monthlyTrend(state: LedgerState) {
  const now = new Date();
  return Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const rows = state.transactions.filter((transaction) => transaction.date.startsWith(key));
    const income = monthlyIncome(rows);
    const expense = monthlyExpense(rows);
    return { label: `${date.getMonth() + 1}月`, income, expense, saving: Math.max(income - expense, 0) };
  });
}

function compactYen(value: number) {
  if (value >= 10000) return `${Math.round(value / 10000)}万`;
  return `${Math.round(value / 1000)}千`;
}

function renderCompactPieLabel(props: { cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; name?: string; value?: number }, total: number) {
  const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, name = "", value = 0 } = props;
  if (!value || !total) return null;
  const radius = outerRadius + 14;
  const radian = Math.PI / 180;
  const x = cx + radius * Math.cos(-midAngle * radian);
  const y = cy + radius * Math.sin(-midAngle * radian);
  const percent = Math.round((value / total) * 100);
  return (
    <text x={x} y={y} fill="#17201c" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={10} fontWeight={800}>
      {`${name} ${percent}% ${compactYen(value)}`}
    </text>
  );
}

function goalAdvice(goal: LedgerState["goals"][number], state: LedgerState) {
  const projection = goalProjection(goal, state);
  const top = [...categoryExpense(state)].sort((a, b) => b.value - a.value)[0];
  if (projection.months === 0) return "すでに達成圏内です。次の目標を作ると資産形成を続けやすくなります。";
  if (!top) return "支出データが増えると、どこを改善すべきかより具体的に提案できます。";
  const improve = Math.min(Math.ceil(top.value * 0.15 / 1000) * 1000, 30000);
  return `過去の貯金ペースは月${yen.format(averageMonthlySaving(state))}です。最大支出の「${top.name}」を月${yen.format(improve)}抑えると、達成時期を早められる可能性があります。`;
}

function TransactionDetail({ transaction, state }: { transaction: LedgerState["transactions"][number]; state: LedgerState }) {
  const category = state.categories.find((item) => item.id === transaction.categoryId);
  const account = state.accounts.find((item) => item.id === transaction.accountId);
  const transferTo = state.accounts.find((item) => item.id === transaction.transferToAccountId);
  return (
    <div className="transaction-detail">
      <div><span>種類</span><strong>{transactionTypeLabel[transaction.type]}</strong></div>
      <div><span>金額</span><strong>{yen.format(transaction.amount)}</strong></div>
      {transaction.type !== "transfer" && <div><span>カテゴリ</span><strong>{category?.name ?? "未設定"}</strong></div>}
      <div><span>{transaction.type === "income" ? "入金先" : "支払元"}</span><strong>{account?.name ?? "未設定"}</strong></div>
      {transaction.type === "transfer" && <div><span>振替先</span><strong>{transferTo?.name ?? "未設定"}</strong></div>}
      <div><span>日付</span><strong>{transaction.date}</strong></div>
      {transaction.reflectedDate && <div><span>反映日</span><strong>{transaction.reflectedDate}</strong></div>}
      <div><span>メモ</span><strong>{transaction.memo || "なし"}</strong></div>
    </div>
  );
}

function GoalsView({ state, setNotice, reload }: { state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const firstAccountId = state.accounts.find((account) => account.type === "saving")?.id ?? state.accounts[0]?.id ?? "";
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", targetAmount: 1000000, accountId: firstAccountId, deadline: `${new Date().getFullYear() + 2}-12-31`, monthlyBoost: 0 });
  const primaryGoal = state.goals[0];
  const primaryProjection = primaryGoal ? goalProjection(primaryGoal, state) : null;
  const savingAverage = averageMonthlySaving(state);
  const topCategory = [...categoryExpense(state)].sort((a, b) => b.value - a.value)[0];
  const suggestedCut = topCategory ? Math.min(Math.ceil(topCategory.value * 0.15 / 1000) * 1000, 30000) : 0;
  async function saveGoal(goalId?: string) {
    if (!draft.name.trim()) {
      setNotice("目標名を入力してください。");
      return;
    }
    if (goalId) {
      await updateGoal(goalId, draft);
      setNotice("目標を更新しました。");
    } else {
      await createGoal(state.householdId ?? "", draft);
      setNotice("目標を追加しました。");
    }
    setShowForm(false);
    setEditingId(null);
    setDraft({ name: "", targetAmount: 1000000, accountId: firstAccountId, deadline: `${new Date().getFullYear() + 2}-12-31`, monthlyBoost: 0 });
    await reload();
  }
  return (
    <div className="view-stack">
      <section className="insight-grid">
        <div className="insight-card teal">
          <PiggyBank size={30} />
          <span>年間でいくら貯金できるか予測</span>
          <p>これまでの収入・支出の傾向から、年間でどれくらい貯金できるかを自動で予測します。</p>
          <strong>{yen.format(savingAverage * 12)}</strong>
          <div className="mini-bars">{[0.38, 0.48, 0.58, 0.72, 0.86, 1].map((height) => <i key={height} style={{ height: `${height * 34}px` }} />)}</div>
        </div>
        <div className="insight-card orange">
          <Goal size={32} />
          <span>目標達成をAIがサポート</span>
          <p>{primaryGoal ? `${primaryGoal.name}は、このペースなら${primaryProjection?.projectedDate}ごろ達成見込みです。` : "目標を設定すると、達成可能性を自動判定します。"}</p>
          <strong>{primaryProjection ? `${Math.round(primaryProjection.progress)}%` : "未設定"}</strong>
          <div className="progress"><span style={{ width: `${primaryProjection ? primaryProjection.progress : 0}%` }} /></div>
        </div>
        <div className="insight-card warn">
          <Sparkles size={32} />
          <span>達成が難しい場合はアドバイス</span>
          <p>{topCategory ? `${topCategory.name}を月${yen.format(suggestedCut)}減らすと、達成確率を上げられます。` : "支出を登録すると、改善ポイントを具体的に提案します。"}</p>
          <strong>{topCategory ? `${topCategory.name}` : "分析待ち"}</strong>
        </div>
      </section>
      <section className="panel">
        <div className="section-title"><h2>目標貯金</h2><span>追加・達成予測</span></div>
        <button className="full-primary" type="button" onClick={() => { setShowForm(!showForm); setEditingId(null); }}>目標を追加する</button>
        {showForm && (
          <GoalEditForm draft={draft} setDraft={setDraft} state={state} onSave={() => saveGoal()} onCancel={() => setShowForm(false)} />
        )}
      </section>
      {state.goals.map((goal) => {
        const projection = goalProjection(goal, state);
        const isEditing = editingId === goal.id;
        return (
          <section className="panel goal-panel" key={goal.id}>
            <div className="section-title"><h2>{goal.name}</h2><span>{projection.projectedDate} 達成予測</span></div>
            {isEditing ? (
              <GoalEditForm draft={draft} setDraft={setDraft} state={state} onSave={() => saveGoal(goal.id)} onCancel={() => setEditingId(null)} onDelete={async () => { await deleteGoal(goal.id); await reload(); setEditingId(null); setNotice("目標を削除しました。"); }} />
            ) : (
            <>
            <div className="progress"><span style={{ width: `${projection.progress}%` }} /></div>
            <div className="goal-numbers">
              <strong>{Math.round(projection.progress)}%</strong>
              <span>不足 {yen.format(projection.remaining)} / 約{projection.months}ヶ月</span>
            </div>
            <section className="advice goal-advice"><Sparkles size={18} /><p>{goalAdvice(goal, state)}</p></section>
            <div className="goal-auto">
              <span>過去実績から見た月平均貯金</span>
              <strong>{yen.format(averageMonthlySaving(state))}</strong>
            </div>
            <button className="google-button" type="button" onClick={() => { setEditingId(goal.id); setShowForm(false); setDraft({ name: goal.name, targetAmount: goal.targetAmount, accountId: goal.accountId, deadline: goal.deadline, monthlyBoost: goal.monthlyBoost }); }}>編集する</button>
            </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function GoalEditForm({ draft, setDraft, state, onSave, onCancel, onDelete }: { draft: Omit<LedgerState["goals"][number], "id">; setDraft: (draft: Omit<LedgerState["goals"][number], "id">) => void; state: LedgerState; onSave: () => void; onCancel: () => void; onDelete?: () => void }) {
  return (
    <div className="edit-row balanced-edit">
      <label>目標名<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例: 住宅資金" /></label>
      <label>目標金額<input type="number" value={draft.targetAmount} onChange={(event) => setDraft({ ...draft, targetAmount: Number(event.target.value) })} /></label>
      <label>対象口座<select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}>{state.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label>期限<input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} /></label>
      <button type="button" onClick={onSave}>変更を保存</button>
      {onDelete && <button type="button" onClick={onDelete}>目標を削除</button>}
      <button type="button" onClick={onCancel}>編集をやめる</button>
    </div>
  );
}

function SettingsView({
  state,
  setNotice,
  reloadHousehold
}: {
  state: LedgerState;
  setNotice: (message: string) => void;
  reloadHousehold: (householdId: string) => Promise<void>;
}) {
  const [sharedName, setSharedName] = useState("共有家計簿");
  const [inviteCode, setInviteCode] = useState("");
  const [selectedLedgerId, setSelectedLedgerId] = useState(state.householdId ?? "");
  const [ledgerModalId, setLedgerModalId] = useState<string | null>(null);
  const [sharedMembers, setSharedMembers] = useState<HouseholdMember[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [openingBalances, setOpeningBalances] = useState<Record<string, { amount: number; date: string }>>(
    Object.fromEntries(state.accounts.filter((account) => account.type !== "credit").map((account) => [account.id, { amount: account.openingBalance, date: account.openingBalanceDate ?? todayIso() }]))
  );
  const [settingsTab, setSettingsTab] = useState<"ledger" | "accounts" | "categories" | "fixed">("ledger");
  const firstBankAccountId = state.accounts.find((account) => account.type === "bank")?.id ?? state.accounts.find((account) => account.type !== "credit")?.id ?? "";
  const firstParentCategoryId = state.categories.find((category) => !category.parentId)?.id ?? "";
  const [newAccount, setNewAccount] = useState({ name: "", type: "bank" as AccountType, openingBalance: 0, openingBalanceDate: todayIso(), closingDay: 25, withdrawalDay: 10, withdrawalAccountId: firstBankAccountId });
  const [newParentCategory, setNewParentCategory] = useState({ name: "", color: "#0f766e", kind: "expense" as "expense" | "income" });
  const [newChildCategory, setNewChildCategory] = useState({ name: "", parentId: firstParentCategoryId, color: "#0ea5e9" });
  const [newFixed, setNewFixed] = useState({ name: "", categoryId: state.categories[0]?.id ?? "", accountId: state.accounts[0]?.id ?? "", amount: 0, variable: false, dueDay: 1, status: "planned" as const, effectiveFrom: todayIso().slice(0, 7) + "-01" });
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showFixedForm, setShowFixedForm] = useState(false);
  const [categoryModalId, setCategoryModalId] = useState<string | null>(null);
  const selectedLedger = (state.households ?? []).find((household) => household.id === selectedLedgerId);
  const modalLedger = (state.households ?? []).find((household) => household.id === ledgerModalId);
  const modalCategory = state.categories.find((category) => category.id === categoryModalId);
  const personalLedgerId = (state.households ?? []).find((household) => household.spaceType === "personal")?.id ?? state.householdId ?? "";

  useEffect(() => {
    if (!modalLedger || modalLedger.spaceType !== "shared") {
      setSharedMembers([]);
      return;
    }
    let mounted = true;
    setMemberLoading(true);
    loadHouseholdMembers(modalLedger.id)
      .then((members) => {
        if (mounted) setSharedMembers(members);
      })
      .catch((error) => {
        if (mounted) setNotice(toJapaneseError(error, "共有メンバーの取得に失敗しました。"));
      })
      .finally(() => {
        if (mounted) setMemberLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [modalLedger?.id, modalLedger?.spaceType, setNotice]);

  return (
    <div className="view-stack">
      <div className="settings-tabs">
        {[
          ["ledger", "家計簿"],
          ["accounts", "お金管理"],
          ["categories", "カテゴリ"],
          ["fixed", "固定費"]
        ].map(([id, label]) => (
          <button className={settingsTab === id ? "active" : ""} key={id} type="button" onClick={() => setSettingsTab(id as typeof settingsTab)}>{label}</button>
        ))}
      </div>
      {settingsTab === "ledger" && (
      <>
      <section className="panel">
        <div className="section-title"><h2>家計簿管理</h2><span>{state.householdName ?? (state.activeSpace === "personal" ? "個人" : "共有")}</span></div>
        <div className="ledger-list">
          {(state.households ?? []).map((household) => (
            <button
              className={household.id === selectedLedgerId ? "selected-ledger" : ""}
              key={household.id}
              type="button"
              onClick={() => { setSelectedLedgerId(household.id); setLedgerModalId(household.id); }}
            >
              <span>{household.name}</span>
              <em>{household.spaceType === "personal" ? "個人" : "共有"} / {household.memberRole === "owner" ? "所有者" : "メンバー"}{household.id === state.householdId ? " / 表示中" : ""}</em>
            </button>
          ))}
        </div>
        {modalLedger && (
          <div className="ledger-detail">
            <button className="modal-close" type="button" onClick={() => setLedgerModalId(null)}>閉じる</button>
            <div>
              <span>家計簿名</span>
              <strong>{modalLedger.name}</strong>
              <em>{modalLedger.spaceType === "personal" ? "個人家計簿" : "共有家計簿"} / {modalLedger.memberRole === "owner" ? "所有者" : "メンバー"}</em>
            </div>
            {modalLedger.spaceType === "shared" && (
              <>
                {modalLedger.inviteCode && (
                  <div className="invite-box">
                    <span>共有ID</span>
                    <strong>{modalLedger.inviteCode}</strong>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(modalLedger.inviteCode ?? "").then(() => setNotice("共有IDをコピーしました。"))}
                      aria-label="共有IDをコピー"
                    >
                      <Copy size={16} />コピー
                    </button>
                  </div>
                )}
                <div className="member-list">
                  <span>共有メンバー</span>
                  {memberLoading && <em>読み込み中</em>}
                  {!memberLoading && sharedMembers.map((member) => (
                    <div key={member.userId}>
                      <strong>{member.displayName}</strong>
                      <em>{member.memberRole === "owner" ? "所有者" : "メンバー"}</em>
                      {modalLedger.memberRole === "owner" && member.memberRole !== "owner" && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`${member.displayName}さんを共有家計簿から脱退させますか？`)) return;
                            try {
                              await removeSharedLedgerMember(modalLedger.id, member.userId);
                              setSharedMembers(await loadHouseholdMembers(modalLedger.id));
                              setNotice("共有メンバーを脱退させました。");
                            } catch (error) {
                              setNotice(toJapaneseError(error, "共有メンバーの脱退処理に失敗しました。"));
                            }
                          }}
                        >
                          脱退させる
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {modalLedger.memberRole === "owner" ? (
                  <button
                    className="danger-button"
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("この共有家計簿を削除しますか？取引・口座・固定費・目標もこの画面から見えなくなります。")) return;
                      try {
                        await deleteSharedLedger(modalLedger.id);
                        await reloadHousehold(personalLedgerId);
                        setSelectedLedgerId(personalLedgerId);
                        setNotice("共有家計簿を削除しました。");
                      } catch (error) {
                        setNotice(toJapaneseError(error, "共有家計簿の削除に失敗しました。"));
                      }
                    }}
                  >
                    共有家計簿を削除
                  </button>
                ) : (
                  <button
                    className="danger-button"
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("この共有家計簿から脱退しますか？")) return;
                      try {
                        await leaveSharedLedger(modalLedger.id);
                        await reloadHousehold(personalLedgerId);
                        setSelectedLedgerId(personalLedgerId);
                        setNotice("共有家計簿から脱退しました。");
                      } catch (error) {
                        setNotice(toJapaneseError(error, "共有家計簿からの脱退に失敗しました。"));
                      }
                    }}
                  >
                    この共有家計簿から脱退
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-title"><h2>共有家計簿</h2><span>作成・参加</span></div>
        <div className="share-actions">
          <label>共有家計簿名<input value={sharedName} onChange={(event) => setSharedName(event.target.value)} /></label>
          <button
            className="full-primary"
            type="button"
            onClick={async () => {
              try {
                const householdId = await createSharedLedger(sharedName);
                await reloadHousehold(householdId);
                setNotice("共有家計簿を作成しました。");
              } catch (error) {
                setNotice(toJapaneseError(error, "共有家計簿の作成に失敗しました。"));
              }
            }}
          >
            共有家計簿を作成
          </button>
          <label>招待コード<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="例: A1B2C3D4" /></label>
          <button
            className="google-button"
            type="button"
            onClick={async () => {
              try {
                const householdId = await joinSharedLedger(inviteCode);
                await reloadHousehold(householdId);
                setInviteCode("");
                setNotice("共有家計簿に参加しました。");
              } catch (error) {
                setNotice(toJapaneseError(error, "共有家計簿への参加に失敗しました。"));
              }
            }}
          >
            招待コードで参加
          </button>
        </div>
      </section>
      </>
      )}
      {settingsTab === "accounts" && (
      <>
      <section className="panel">
        <div className="section-title"><h2>お金の置き場所・支払方法</h2><span>{state.mode === "balance" ? "残高管理あり" : "収支のみ"}</span></div>
        <div className="account-list">
          {state.accounts.map((account) => <div key={account.id}><i style={{ background: account.color }} /><span>{account.name}</span><strong>{yen.format(calculateAccountBalance(account, state.transactions))}</strong></div>)}
        </div>
      </section>
      <section className="panel">
        <div className="section-title"><h2>初期残高</h2><span>口座残高の基準</span></div>
        <div className="opening-list">
          {state.accounts.filter((account) => account.type !== "credit").map((account) => (
            <label key={account.id}>{account.name}
              <input
                type="number"
                min="0"
                value={openingBalances[account.id]?.amount ?? account.openingBalance}
                onChange={(event) => setOpeningBalances({ ...openingBalances, [account.id]: { ...(openingBalances[account.id] ?? { date: todayIso() }), amount: Number(event.target.value) } })}
              />
              <input
                type="date"
                value={openingBalances[account.id]?.date ?? account.openingBalanceDate ?? todayIso()}
                onChange={(event) => setOpeningBalances({ ...openingBalances, [account.id]: { ...(openingBalances[account.id] ?? { amount: account.openingBalance }), date: event.target.value } })}
              />
            </label>
          ))}
          <button
            className="full-primary"
            type="button"
            onClick={async () => {
              try {
                await updateOpeningBalances(openingBalances);
                await reloadHousehold(state.householdId ?? "");
                setNotice("初期残高を更新しました。");
              } catch (error) {
                setNotice(toJapaneseError(error, "初期残高の更新に失敗しました。"));
              }
            }}
          >
            初期残高を更新
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="section-title"><h2>お金の置き場所を追加・編集</h2><span>銀行・現金・カード</span></div>
        <p className="setting-copy">ここでは「銀行口座」だけでなく、現金、クレジットカード、貯金口座など、お金が出入りする場所や支払方法を登録します。</p>
        <button className="full-primary" type="button" onClick={() => setShowAccountForm(!showAccountForm)}>{showAccountForm ? "追加を閉じる" : "お金の置き場所を追加する"}</button>
        {showAccountForm && <div className="crud-form">
          <label>口座名<input placeholder="例: 生活口座 / 楽天カード" value={newAccount.name} onChange={(event) => setNewAccount({ ...newAccount, name: event.target.value })} /></label>
          <label>種類<select value={newAccount.type} onChange={(event) => setNewAccount({ ...newAccount, type: event.target.value as AccountType })}>
            <option value="bank">銀行口座</option><option value="cash">現金</option><option value="saving">貯金口座</option><option value="credit">クレジットカード</option>
          </select></label>
          {newAccount.type !== "credit" && (
            <>
              <label>初期残高<input type="number" min="0" value={newAccount.openingBalance} onChange={(event) => setNewAccount({ ...newAccount, openingBalance: Number(event.target.value) })} /></label>
              <label>初期残高の日付<input type="date" value={newAccount.openingBalanceDate} onChange={(event) => setNewAccount({ ...newAccount, openingBalanceDate: event.target.value })} /></label>
            </>
          )}
          {newAccount.type === "credit" && (
            <>
              <label>締め日<input type="number" min="1" max="31" value={newAccount.closingDay} onChange={(event) => setNewAccount({ ...newAccount, closingDay: Number(event.target.value) })} /></label>
              <label>引落日<input type="number" min="1" max="31" value={newAccount.withdrawalDay} onChange={(event) => setNewAccount({ ...newAccount, withdrawalDay: Number(event.target.value) })} /></label>
              <label>引落口座<select value={newAccount.withdrawalAccountId} onChange={(event) => setNewAccount({ ...newAccount, withdrawalAccountId: event.target.value })}>{state.accounts.filter((account) => account.type !== "credit").map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
              <p className="setting-copy">このカードで支出登録すると、残高反映日が自動で次回引落日に設定され、未確定のクレカ支出として月末予測に反映されます。</p>
            </>
          )}
          <button className="full-primary" type="button" onClick={async () => {
            try {
              await createAccount(state.householdId ?? "", { ...newAccount, openingBalance: newAccount.type === "credit" ? 0 : newAccount.openingBalance });
              await reloadHousehold(state.householdId ?? "");
              setNewAccount({ name: "", type: "bank", openingBalance: 0, openingBalanceDate: todayIso(), closingDay: 25, withdrawalDay: 10, withdrawalAccountId: firstBankAccountId });
              setShowAccountForm(false);
              setNotice("口座を追加しました。");
            } catch (error) { setNotice(toJapaneseError(error, "口座追加に失敗しました。")); }
          }}>口座を追加</button>
        </div>}
        <EditableAccountList state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />
      </section>
      </>
      )}
      {settingsTab === "categories" && (
      <section className="panel">
        <div className="section-title"><h2>カテゴリ管理</h2><span>親カテゴリと小カテゴリ</span></div>
        <p className="setting-copy">カテゴリーは「食費」「住居」など大きな分類です。サブカテゴリーは「スーパー」「外食」などカテゴリー内の細かい分類です。</p>
        <button className="full-primary" type="button" onClick={() => setShowCategoryForm(!showCategoryForm)}>{showCategoryForm ? "追加を閉じる" : "カテゴリを追加する"}</button>
        {showCategoryForm && <div className="split-editor">
          <div className="mini-panel">
            <h3>カテゴリーを追加</h3>
            <label>カテゴリー名<input placeholder="例: 食費" value={newParentCategory.name} onChange={(event) => setNewParentCategory({ ...newParentCategory, name: event.target.value })} /></label>
            <label>用途<select value={newParentCategory.kind} onChange={(event) => setNewParentCategory({ ...newParentCategory, kind: event.target.value as "expense" | "income" })}><option value="expense">支出</option><option value="income">収入</option></select></label>
            <label>色<input type="color" value={newParentCategory.color} onChange={(event) => setNewParentCategory({ ...newParentCategory, color: event.target.value })} /></label>
            <button className="full-primary" type="button" onClick={async () => {
              try {
                if (!newParentCategory.name.trim()) {
                  setNotice("カテゴリー名を入力してください。");
                  return;
                }
                await createCategory(state.householdId ?? "", { name: newParentCategory.name, color: newParentCategory.color, kind: newParentCategory.kind });
                await reloadHousehold(state.householdId ?? "");
                setNewParentCategory({ name: "", color: "#0f766e", kind: "expense" });
                setShowCategoryForm(false);
                setNotice("カテゴリーを追加しました。");
              } catch (error) { setNotice(toJapaneseError(error, "カテゴリー追加に失敗しました。")); }
            }}>カテゴリーを追加</button>
          </div>
          <div className="mini-panel">
            <h3>サブカテゴリーを追加</h3>
            <label>カテゴリー<select value={newChildCategory.parentId} onChange={(event) => setNewChildCategory({ ...newChildCategory, parentId: event.target.value })}>{state.categories.filter((category) => !category.parentId).map((category) => <option value={category.id} key={category.id}>{category.kind === "income" ? "収入" : "支出"} / {category.name}</option>)}</select></label>
            <label>サブカテゴリー名<input placeholder="例: スーパー" value={newChildCategory.name} onChange={(event) => setNewChildCategory({ ...newChildCategory, name: event.target.value })} /></label>
            <label>色<input type="color" value={newChildCategory.color} onChange={(event) => setNewChildCategory({ ...newChildCategory, color: event.target.value })} /></label>
            <button className="full-primary" type="button" onClick={async () => {
              try {
                if (!newChildCategory.name.trim()) {
                  setNotice("サブカテゴリー名を入力してください。");
                  return;
                }
                if (!newChildCategory.parentId) {
                  setNotice("カテゴリーを選んでください。");
                  return;
                }
                const parent = state.categories.find((category) => category.id === newChildCategory.parentId);
                await createCategory(state.householdId ?? "", { ...newChildCategory, kind: parent?.kind ?? "expense" });
                await reloadHousehold(state.householdId ?? "");
                setNewChildCategory({ name: "", parentId: firstParentCategoryId, color: "#0ea5e9" });
                setShowCategoryForm(false);
                setNotice("サブカテゴリーを追加しました。");
              } catch (error) { setNotice(toJapaneseError(error, "サブカテゴリー追加に失敗しました。")); }
            }}>サブカテゴリーを追加</button>
          </div>
        </div>}
        <div className="category-tree">
          {(["expense", "income"] as const).map((kind) => (
            <div className="category-kind-block" key={kind}>
              <strong>{kind === "expense" ? "支出カテゴリー" : "収入カテゴリー"}</strong>
              {state.categories.filter((category) => !category.parentId && category.kind === kind).map((parent) => (
                <section key={parent.id}>
                  <button type="button" onClick={() => setCategoryModalId(parent.id)}><strong><i style={{ background: parent.color }} />{parent.name}</strong></button>
                  {state.categories.filter((category) => category.parentId === parent.id).map((child) => <button type="button" key={child.id} onClick={() => setCategoryModalId(child.id)}><span><i style={{ background: child.color }} />{child.name}</span></button>)}
                </section>
              ))}
            </div>
          ))}
        </div>
        {modalCategory && <CategoryModal category={modalCategory} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} onClose={() => setCategoryModalId(null)} />}
      </section>
      )}
      {settingsTab === "fixed" && (
      <>
      <section className="panel">
        <div className="section-title"><h2>固定費管理</h2><span>追加・更新・削除</span></div>
        <p className="setting-copy">固定費は毎月ほぼ必ず発生する支払いです。家賃、通信費、保険、サブスクなどを登録します。変更・削除するときは「すべてに反映」か「指定月以降に反映」を選べます。</p>
        <button className="full-primary" type="button" onClick={() => setShowFixedForm(!showFixedForm)}>{showFixedForm ? "追加を閉じる" : "固定費を追加する"}</button>
        {showFixedForm && <div className="crud-form">
          <label>固定費名<input placeholder="例: 家賃 / Netflix / 電気代" value={newFixed.name} onChange={(event) => setNewFixed({ ...newFixed, name: event.target.value })} /></label>
          <label>金額<input type="number" min="0" value={newFixed.amount} onChange={(event) => setNewFixed({ ...newFixed, amount: Number(event.target.value) })} /></label>
          <label>カテゴリ<select value={newFixed.categoryId} onChange={(event) => setNewFixed({ ...newFixed, categoryId: event.target.value })}>{state.categories.filter((category) => category.kind === "expense").map((category) => <option value={category.id} key={category.id}>{category.parentId ? "└ " : ""}{category.name}</option>)}</select></label>
          <label>支払元<select value={newFixed.accountId} onChange={(event) => setNewFixed({ ...newFixed, accountId: event.target.value })}>{state.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
          <label>支払予定日<input type="number" min="1" max="31" value={newFixed.dueDay} onChange={(event) => setNewFixed({ ...newFixed, dueDay: Number(event.target.value) })} /></label>
          <label>開始月<input type="month" value={newFixed.effectiveFrom.slice(0, 7)} onChange={(event) => setNewFixed({ ...newFixed, effectiveFrom: `${event.target.value}-01` })} /></label>
          <button className="full-primary" type="button" onClick={async () => {
            try {
              await createFixedCost(state.householdId ?? "", newFixed);
              await reloadHousehold(state.householdId ?? "");
              setNewFixed({ name: "", categoryId: state.categories[0]?.id ?? "", accountId: state.accounts[0]?.id ?? "", amount: 0, variable: false, dueDay: 1, status: "planned", effectiveFrom: todayIso().slice(0, 7) + "-01" });
              setShowFixedForm(false);
              setNotice("固定費を追加しました。");
            } catch (error) { setNotice(toJapaneseError(error, "固定費追加に失敗しました。")); }
          }}>固定費を追加</button>
        </div>}
        <EditableFixedCostList state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />
      </section>
      <section className="panel">
        <div className="section-title"><h2>固定費</h2><span>毎月の支払い</span></div>
        <div className="fixed-list">
          {state.fixedCosts.map((cost) => <div key={cost.id}><span>{cost.name}</span><strong>{yen.format(cost.amount)}</strong><em>{cost.effectiveFrom ? `${cost.effectiveFrom.slice(0, 7)}から` : "毎月"}</em></div>)}
        </div>
      </section>
      </>
      )}
    </div>
  );
}

function AdminView() {
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="section-title"><h2>管理者画面</h2><span>/admin</span></div>
        <div className="admin-grid">
          {["ユーザー管理", "問い合わせ管理", "お知らせ管理", "利用状況確認", "エラーログ確認"].map((item) => <button key={item}>{item}</button>)}
        </div>
      </section>
    </div>
  );
}

function EditableAccountList({ state, setNotice, reloadHousehold }: { state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div className="detail-card-list">
      {state.accounts.map((account) => {
        const isOpen = selectedId === account.id;
        const isEditing = editingId === account.id;
        const withdrawalAccount = state.accounts.find((item) => item.id === account.withdrawalAccountId);
        return (
          <div className="detail-card" key={account.id}>
            <button className="detail-card-head" type="button" onClick={() => { setSelectedId(isOpen ? null : account.id); setEditingId(null); }}>
              <span><i style={{ background: account.color }} />{account.name}</span>
            </button>
            {isOpen && !isEditing && (
              <div className="fixed-detail">
                <span>種類: {account.type === "bank" ? "銀行口座" : account.type === "cash" ? "現金" : account.type === "saving" ? "貯金口座" : "クレジットカード"}</span>
                {account.type !== "credit" && <span>初期残高: {yen.format(account.openingBalance)} / 基準日: {account.openingBalanceDate ?? "未設定"}</span>}
                {account.type === "credit" && <span>締め日: 毎月{account.closingDay ?? 25}日 / 引落日: 毎月{account.withdrawalDay ?? 10}日 / 引落口座: {withdrawalAccount?.name ?? "未設定"}</span>}
                <button type="button" onClick={() => setEditingId(account.id)}>編集する</button>
              </div>
            )}
            {isOpen && isEditing && <EditableAccountRow account={account} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} onDone={() => setEditingId(null)} />}
          </div>
        );
      })}
    </div>
  );
}

function EditableAccountRow({ account, state, setNotice, reloadHousehold, onDone }: { account: LedgerState["accounts"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onDone: () => void }) {
  const [name, setName] = useState(account.name);
  const [openingBalance, setOpeningBalance] = useState(account.openingBalance);
  const [openingBalanceDate, setOpeningBalanceDate] = useState(account.openingBalanceDate ?? todayIso());
  const [closingDay, setClosingDay] = useState(account.closingDay ?? 25);
  const [withdrawalDay, setWithdrawalDay] = useState(account.withdrawalDay ?? 10);
  const [withdrawalAccountId, setWithdrawalAccountId] = useState(account.withdrawalAccountId ?? state.accounts.find((item) => item.type !== "credit")?.id ?? "");
  return <div className="edit-row balanced-edit"><label>口座名<input value={name} onChange={(event) => setName(event.target.value)} /></label>{account.type !== "credit" && <><label>初期残高<input type="number" value={openingBalance} onChange={(event) => setOpeningBalance(Number(event.target.value))} /></label><label>基準日<input type="date" value={openingBalanceDate} onChange={(event) => setOpeningBalanceDate(event.target.value)} /></label></>}{account.type === "credit" && <><label>締め日<input type="number" min="1" max="31" value={closingDay} onChange={(event) => setClosingDay(Number(event.target.value))} /></label><label>引落日<input type="number" min="1" max="31" value={withdrawalDay} onChange={(event) => setWithdrawalDay(Number(event.target.value))} /></label><label>引落口座<select value={withdrawalAccountId} onChange={(event) => setWithdrawalAccountId(event.target.value)}>{state.accounts.filter((item) => item.type !== "credit").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}<button onClick={async () => { try { await updateAccount(account.id, { name, openingBalance: account.type === "credit" ? 0 : openingBalance, openingBalanceDate: account.type === "credit" ? account.openingBalanceDate ?? todayIso() : openingBalanceDate, closingDay: account.type === "credit" ? closingDay : undefined, withdrawalDay: account.type === "credit" ? withdrawalDay : undefined, withdrawalAccountId: account.type === "credit" ? withdrawalAccountId : undefined }); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice("口座を更新しました。"); } catch (error) { setNotice(toJapaneseError(error, "口座更新に失敗しました。")); } }}>変更を保存</button><button onClick={async () => { try { await deleteAccount(account.id); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice("口座を削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "口座削除に失敗しました。")); } }}>口座を削除</button><button type="button" onClick={onDone}>編集をやめる</button></div>;
}

function CategoryModal({ category, state, setNotice, reloadHousehold, onClose }: { category: LedgerState["categories"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onClose: () => void }) {
  const parent = state.categories.find((item) => item.id === category.parentId);
  const children = state.categories.filter((item) => item.parentId === category.id);
  const [editing, setEditing] = useState(false);
  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-title"><h2>{category.name}</h2><span>{category.parentId ? "サブカテゴリー" : "カテゴリー"}</span></div>
        {!editing ? (
          <div className="fixed-detail">
            <span>用途: {category.kind === "income" ? "収入" : "支出"}</span>
            <span>分類: {category.parentId ? `サブカテゴリー（${parent?.name ?? "カテゴリー未設定"}）` : "カテゴリー"}</span>
            {!category.parentId && <span>サブカテゴリー: {children.map((child) => child.name).join("、") || "なし"}</span>}
            <button type="button" onClick={() => setEditing(true)}>編集する</button>
            <button type="button" onClick={onClose}>閉じる</button>
          </div>
        ) : (
          <EditableCategoryRow category={category} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} onDone={() => { setEditing(false); onClose(); }} />
        )}
      </section>
    </div>
  );
}

function EditableCategoryList({ state, setNotice, reloadHousehold }: { state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  const parents = state.categories.filter((category) => !category.parentId);
  const children = state.categories.filter((category) => category.parentId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  function renderCategory(category: LedgerState["categories"][number]) {
    const isOpen = selectedId === category.id;
    const isEditing = editingId === category.id;
    const parent = state.categories.find((item) => item.id === category.parentId);
    return (
      <div className="detail-card" key={category.id}>
        <button className="detail-card-head" type="button" onClick={() => { setSelectedId(isOpen ? null : category.id); setEditingId(null); }}>
          <span><i style={{ background: category.color }} />{category.name}</span>
        </button>
        {isOpen && !isEditing && (
          <div className="fixed-detail">
            <span>分類: {category.parentId ? `小カテゴリ（${parent?.name ?? "親カテゴリ未設定"}）` : "親カテゴリ"}</span>
            {!category.parentId && <span>小カテゴリ: {children.filter((child) => child.parentId === category.id).map((child) => child.name).join("、") || "なし"}</span>}
            <button type="button" onClick={() => setEditingId(category.id)}>編集する</button>
          </div>
        )}
        {isOpen && isEditing && <EditableCategoryRow category={category} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} onDone={() => setEditingId(null)} />}
      </div>
    );
  }
  return (
    <div className="category-edit-columns">
      <div>
        <h3>親カテゴリ</h3>
        <div className="detail-card-list">{parents.map(renderCategory)}</div>
      </div>
      <div>
        <h3>小カテゴリ</h3>
        <div className="detail-card-list">{children.map(renderCategory)}</div>
      </div>
    </div>
  );
}

function EditableCategoryRow({ category, state, setNotice, reloadHousehold, onDone }: { category: LedgerState["categories"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onDone: () => void }) {
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parentId ?? "");
  const [kind, setKind] = useState(category.kind);
  const [color, setColor] = useState(category.color);
  return <div className="edit-row balanced-edit"><label>{category.parentId ? "サブカテゴリー名" : "カテゴリー名"}<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>用途<select value={kind} onChange={(event) => setKind(event.target.value as "expense" | "income")}><option value="expense">支出</option><option value="income">収入</option></select></label><label>分類<select value={parentId} onChange={(event) => { const nextParentId = event.target.value; setParentId(nextParentId); const parent = state.categories.find((item) => item.id === nextParentId); if (parent) setKind(parent.kind); }}><option value="">カテゴリーにする</option>{state.categories.filter((item) => !item.parentId && item.id !== category.id && item.kind === kind).map((item) => <option value={item.id} key={item.id}>{item.name} のサブカテゴリーにする</option>)}</select></label><label>色<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><button onClick={async () => { try { if (!name.trim()) { setNotice("カテゴリー名を入力してください。"); return; } await updateCategory(category.id, { name, parentId, color, kind }); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice("カテゴリーを更新しました。"); } catch (error) { setNotice(toJapaneseError(error, "カテゴリー更新に失敗しました。")); } }}>変更を保存</button><button onClick={async () => { try { await deleteCategory(category.id); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice("カテゴリーを削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "カテゴリー削除に失敗しました。")); } }}>カテゴリーを削除</button><button type="button" onClick={onDone}>編集をやめる</button></div>;
}

function EditableFixedCostList({ state, setNotice, reloadHousehold }: { state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div className="fixed-editor-list">
      {state.fixedCosts.map((cost) => {
        const isOpen = selectedId === cost.id;
        const isEditing = editingId === cost.id;
        const category = state.categories.find((item) => item.id === cost.categoryId);
        const account = state.accounts.find((item) => item.id === cost.accountId);
        return (
          <div className="fixed-editor-card" key={cost.id}>
            <button className="fixed-editor-head" type="button" onClick={() => { setSelectedId(isOpen ? null : cost.id); setEditingId(null); }}>
              <span>{cost.name}</span>
              <strong>{yen.format(cost.amount)}</strong>
            </button>
            {isOpen && !isEditing && (
              <div className="fixed-detail">
                <span>支払日: 毎月{cost.dueDay}日</span>
                <span>カテゴリ: {category?.name ?? "未設定"}</span>
                <span>支払元: {account?.name ?? "未設定"}</span>
                <span>反映期間: {cost.effectiveFrom ? cost.effectiveFrom.slice(0, 7) : "開始月なし"} から {cost.effectiveTo ? cost.effectiveTo.slice(0, 7) : "継続中"}</span>
                <button type="button" onClick={() => setEditingId(cost.id)}>編集する</button>
              </div>
            )}
            {isOpen && isEditing && <EditableFixedCostRow cost={cost} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} onDone={() => setEditingId(null)} />}
          </div>
        );
      })}
    </div>
  );
}

function EditableFixedCostRow({ cost, state, setNotice, reloadHousehold, onDone }: { cost: LedgerState["fixedCosts"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onDone: () => void }) {
  const [draft, setDraft] = useState(cost);
  const [scope, setScope] = useState<"all" | "future">("all");
  const [fromMonth, setFromMonth] = useState(todayIso().slice(0, 7));
  return (
    <div className="edit-row">
      <label>固定費名<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>金額<input type="number" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })} /></label>
      <label>支払日<input type="number" min="1" max="31" value={draft.dueDay} onChange={(event) => setDraft({ ...draft, dueDay: Number(event.target.value) })} /></label>
      <label>反映範囲<select value={scope} onChange={(event) => setScope(event.target.value as "all" | "future")}><option value="all">すべてに反映</option><option value="future">指定月以降に反映</option></select></label>
      {scope === "future" && <label>開始月<input type="month" value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} /></label>}
      <button onClick={async () => { try { await updateFixedCost(cost.id, { ...draft, status: "planned" }, scope, fromMonth); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice(scope === "future" ? "指定月以降の固定費を更新しました。" : "固定費を更新しました。"); } catch (error) { setNotice(toJapaneseError(error, "固定費更新に失敗しました。")); } }}>変更を保存</button>
      <button onClick={async () => { try { await deleteFixedCost(cost.id, scope, fromMonth); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice(scope === "future" ? "指定月以降の固定費を削除しました。" : "固定費を削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "固定費削除に失敗しました。")); } }}>固定費を削除</button>
      <button type="button" onClick={onDone}>編集をやめる</button>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <section className="metric"><Icon size={19} /><span>{label}</span><strong>{value}</strong></section>;
}

function TransactionList({ state, limit, setNotice, reload }: { state: LedgerState; limit?: number; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const rows = state.transactions.slice(0, limit);
  return (
    <div className="transaction-list">
      {rows.map((transaction) => {
        return <TransactionRow key={transaction.id} transaction={transaction} state={state} setNotice={setNotice} reload={reload} />;
      })}
    </div>
  );
}

function TransactionRow({ transaction, state, setNotice, reload }: { transaction: LedgerState["transactions"][number]; state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(transaction);
  const category = state.categories.find((item) => item.id === transaction.categoryId);
  const account = state.accounts.find((item) => item.id === transaction.accountId);
  const normalAccounts = state.accounts.filter((item) => item.type !== "credit");
  const editCategories = state.categories.filter((item) => item.kind === (draft.type === "income" ? "income" : "expense"));
  async function saveDraft() {
    const creditAccount = state.accounts.find((item) => item.id === draft.accountId && item.type === "credit");
    const withdrawalDate = draft.type === "expense" && creditAccount ? nextWithdrawalDate(creditAccount, draft.date) : undefined;
    const payload = {
      ...draft,
      categoryId: draft.type === "transfer" ? undefined : draft.categoryId || undefined,
      transferToAccountId: draft.type === "transfer" ? draft.transferToAccountId || normalAccounts.find((item) => item.id !== draft.accountId)?.id : undefined,
      creditStatus: draft.type === "expense" && creditAccount ? draft.creditStatus ?? "unconfirmed" as const : undefined,
      date: withdrawalDate ?? draft.date,
      reflectedDate: withdrawalDate
    };
    await updateTransaction(transaction.id, payload);
    setEditing(false);
    await reload();
    setNotice("取引を更新しました。");
  }
  if (editing) {
    return (
      <article className="tx-edit">
        <label>取引の種類<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as TransactionType })}><option value="expense">支出</option><option value="income">収入</option><option value="transfer">振替</option></select></label>
        <label>金額<input type="number" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })} /></label>
        {draft.type !== "transfer" && <label>カテゴリ<select value={draft.categoryId ?? ""} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{editCategories.map((item) => <option key={item.id} value={item.id}>{item.parentId ? "└ " : ""}{item.name}</option>)}</select></label>}
        <label>{draft.type === "income" ? "入金先" : "支払元"}<select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}>{(draft.type === "transfer" ? normalAccounts : state.accounts).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {draft.type === "transfer" && <label>振替先<select value={draft.transferToAccountId ?? ""} onChange={(event) => setDraft({ ...draft, transferToAccountId: event.target.value })}>{normalAccounts.filter((item) => item.id !== draft.accountId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label>日付<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
        <label>メモ<input value={draft.memo ?? ""} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} /></label>
        <button onClick={async () => { try { await saveDraft(); } catch (error) { setNotice(toJapaneseError(error, "取引更新に失敗しました。")); } }}>変更を保存</button>
        <button onClick={() => setEditing(false)}>編集をやめる</button>
      </article>
    );
  }
  return (
    <article>
      <div className={`tx-icon ${transaction.type}`}><ArrowDownUp size={16} /></div>
      <div><strong>{transaction.memo || category?.name || transactionTypeLabel[transaction.type]}</strong><span>{transaction.date} / {account?.name}{transaction.reflectedDate ? ` / 反映日 ${transaction.reflectedDate}` : ""}{transaction.creditStatus ? ` / ${creditStatusLabel[transaction.creditStatus]}` : ""}</span></div>
      <em>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "-" : ""}{yen.format(transaction.amount)}</em>
      <button className="mini-button" onClick={() => setEditing(true)}>編集</button>
      <button className="mini-button" onClick={async () => { try { await deleteTransaction(transaction.id); await reload(); setNotice("取引を削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "取引削除に失敗しました。")); } }}>取引削除</button>
    </article>
  );
}

function nextWithdrawalDate(account: LedgerState["accounts"][number], occurredOn: string) {
  const closingDay = account.closingDay ?? 25;
  const withdrawalDay = account.withdrawalDay ?? 10;
  const usedAt = new Date(`${occurredOn}T00:00:00`);
  const monthsToAdd = usedAt.getDate() <= closingDay ? 1 : 2;
  const target = new Date(usedAt.getFullYear(), usedAt.getMonth() + monthsToAdd, Math.min(withdrawalDay, 28));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}
