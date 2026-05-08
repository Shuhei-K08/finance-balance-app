"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  CalendarDays,
  Copy,
  CreditCard,
  Goal,
  Home,
  Landmark,
  ListPlus,
  PiggyBank,
  Settings,
  Shield,
  Sparkles,
  LogOut,
  Mail,
  Lock,
  UserPlus,
  Wallet
} from "lucide-react";
import {
  balanceTrend,
  calculateAccountBalance,
  categoryExpense,
  creditStatusLabel,
  fixedCostForecast,
  fixedCostStatusLabel,
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
import { LedgerState, TransactionType } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  createSharedLedger,
  createAccount,
  createCategory,
  createFixedCost,
  deleteAccount,
  deleteCategory,
  deleteFixedCost,
  deleteTransaction,
  insertRemoteTransaction,
  claimFirstAdmin,
  joinSharedLedger,
  loadRemoteState,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  updateAccount,
  updateCategory,
  updateFixedCost,
  updateOpeningBalances,
  updateTransaction,
  updateRemoteGoalBoost
} from "@/lib/db";
import { AccountType, FixedCostStatus } from "@/lib/types";

type Tab = "home" | "history" | "analysis" | "goals" | "settings" | "admin";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "ホーム", icon: Home },
  { id: "history", label: "履歴", icon: CalendarDays },
  { id: "analysis", label: "分析", icon: BarChart3 },
  { id: "goals", label: "目標", icon: Goal },
  { id: "settings", label: "設定", icon: Settings },
  { id: "admin", label: "管理", icon: Shield }
];

export default function App() {
  const [state, setState] = useState<LedgerState | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [quickOpen, setQuickOpen] = useState(false);
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
      setNotice(error instanceof Error ? error.message : "Supabase の初期化に失敗しました。");
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(Boolean(session));
      if (session) {
        setTimeout(() => {
          refreshRemoteState().catch((error) => setNotice(error.message));
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
        await refreshRemoteState();
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

  async function refreshRemoteState() {
    const next = await loadRemoteState(selectedHouseholdId);
    setSelectedHouseholdId(next.householdId);
    setState(next);
  }

  if (!authReady) return <main className="boot">読み込み中</main>;

  if (supabase && !isAuthed) {
    return <AuthScreen notice={notice} setNotice={setNotice} />;
  }

  if (!supabase) {
    return <SetupScreen />;
  }

  if (!state) return <DbErrorScreen notice={notice} onRetry={() => refreshRemoteState().catch((error) => setNotice(error.message))} />;

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

  async function addTransaction(form: FormData) {
    if (!state) return;
    const type = form.get("type") as TransactionType;
    const accountId = String(form.get("accountId"));
    const amount = Number(form.get("amount"));
    const creditAccount = state.accounts.find((account) => account.id === accountId && account.type === "credit");
    const transaction = {
      type,
      amount,
      categoryId: String(form.get("categoryId")),
      accountId,
      transferToAccountId: type === "transfer" ? String(form.get("transferToAccountId")) : undefined,
      date: String(form.get("date")),
      memo: String(form.get("memo") || ""),
      reflectedDate: creditAccount ? nextWithdrawalDate(creditAccount.withdrawalDay ?? 10) : undefined,
      creditStatus: creditAccount ? "unconfirmed" as const : undefined
    };
    try {
      const id = await insertRemoteTransaction(state.householdId ?? "", transaction);
      setState({ ...state, transactions: [{ id, ...transaction }, ...state.transactions] });
      setQuickOpen(false);
      setNotice("登録しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "登録に失敗しました。");
    }
  }

  const visibleTabs = state.profileRole === "admin" ? tabs : tabs.filter((item) => item.id !== "admin");

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Mirai Ledger</p>
          <h1>未来残高を見ながら整える家計簿</h1>
        </div>
        <div className="top-actions">
          <button className="primary-icon" type="button" onClick={() => setQuickOpen(true)} aria-label="取引を追加">
            <ListPlus size={22} />
          </button>
          <button className="ghost-icon" type="button" onClick={() => signOut().catch((error) => setNotice(error.message))} aria-label="ログアウト">
            <LogOut size={20} />
          </button>
        </div>
      </section>
      {notice && <section className="notice" role="status">{notice}</section>}

      {tab === "home" && <HomeView state={state} stats={stats} onQuick={() => setQuickOpen(true)} />}
      {tab === "history" && <HistoryView state={state} setNotice={setNotice} reload={() => refreshRemoteState()} />}
      {tab === "analysis" && <AnalysisView state={state} />}
      {tab === "goals" && <GoalsView state={state} setState={setState} setNotice={setNotice} />}
      {tab === "settings" && <SettingsView state={state} setState={setState} setNotice={setNotice} reloadHousehold={async (householdId) => {
        setSelectedHouseholdId(householdId);
        const next = await loadRemoteState(householdId);
        setSelectedHouseholdId(next.householdId);
        setState(next);
      }} />}
      {tab === "admin" && state.profileRole === "admin" && <AdminView />}

      <nav className="bottom-nav">
        {visibleTabs.map((item) => {
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

      {quickOpen && (
        <div className="sheet-backdrop" onClick={() => setQuickOpen(false)}>
          <form className="bottom-sheet" onSubmit={(event) => { event.preventDefault(); addTransaction(new FormData(event.currentTarget)); }} onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <h2>クイック入力</h2>
            <div className="segmented">
              <label><input name="type" type="radio" value="expense" defaultChecked />支出</label>
              <label><input name="type" type="radio" value="income" />収入</label>
              <label><input name="type" type="radio" value="transfer" />振替</label>
            </div>
            <input className="amount-input" name="amount" type="number" min="1" placeholder="0" required />
            <div className="form-grid">
              <label>カテゴリー<select name="categoryId">{state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>支払元<select name="accountId">{state.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <label>振替先<select name="transferToAccountId">{state.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <label>日付<input name="date" type="date" defaultValue={todayIso()} /></label>
            </div>
            <input name="memo" placeholder="メモ" />
            <button className="full-primary" type="submit">登録</button>
          </form>
        </div>
      )}
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
      setNotice(error instanceof Error ? error.message : "認証に失敗しました。");
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
        <button className="google-button" type="button" onClick={() => signInWithGoogle().catch((error) => setNotice(error.message))}>Googleで続ける</button>
        <button className="switch-auth" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "アカウントを作成する" : "ログインに戻る"}
        </button>
        <p className="auth-copy small">初回管理者にする場合は、アカウント作成後にログインしてから設定画面の「初回管理者にする」を押してください。</p>
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
      setNotice(error instanceof Error ? error.message : "初期残高の保存に失敗しました。");
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

function HomeView({ state, stats, onQuick }: { state: LedgerState; stats: Record<string, number>; onQuick: () => void }) {
  return (
    <div className="view-stack">
      <section className="hero-panel">
        <div>
          <p>総資産</p>
          <strong>{yen.format(stats.assets)}</strong>
          <span>月末予測 {yen.format(stats.forecast)}</span>
        </div>
        <button type="button" onClick={onQuick}><ListPlus size={18} />入力</button>
      </section>

      <div className="stat-grid">
        <Metric icon={Wallet} label="今月支出" value={yen.format(stats.expense)} />
        <Metric icon={PiggyBank} label="貯金率" value={`${Math.max(Math.round(((stats.income - stats.expense) / Math.max(stats.income, 1)) * 100), 0)}%`} />
        <Metric icon={Landmark} label="固定費予定" value={yen.format(stats.fixed)} />
        <Metric icon={CreditCard} label="引落予定" value={yen.format(stats.credit)} />
      </div>

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

      <section className="advice">
        <Sparkles size={20} />
        <p>{spendingAdvice(state)}</p>
      </section>

      <section className="panel">
        <div className="section-title"><h2>最近の支出</h2><span>{state.transactions.length}件</span></div>
        <TransactionList state={state} limit={5} setNotice={() => {}} reload={async () => {}} />
      </section>
    </div>
  );
}

function HistoryView({ state, setNotice, reload }: { state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const monthKey = selectedDate.slice(0, 7);
  const days = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  const dateRows = state.transactions.filter((transaction) => transaction.date === selectedDate);
  const visibleRows = dateRows.length > 0 ? { ...state, transactions: dateRows } : state;

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="section-title"><h2>履歴一覧</h2><input className="month-input" type="month" value={monthKey} onChange={(event) => setSelectedDate(`${event.target.value}-01`)} /></div>
        <div className="calendar-grid">
          {Array.from({ length: days }).map((_, index) => {
            const day = String(index + 1).padStart(2, "0");
            const date = `${monthKey}-${day}`;
            const total = state.transactions.filter((transaction) => transaction.date === date && transaction.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
            return <button className={date === selectedDate ? "selected-day" : ""} key={date} type="button" onClick={() => setSelectedDate(date)}><strong>{index + 1}</strong>{total > 0 && <span>{yen.format(total)}</span>}</button>;
          })}
        </div>
        <TransactionList state={visibleRows} setNotice={setNotice} reload={reload} />
      </section>
    </div>
  );
}

function AnalysisView({ state }: { state: LedgerState }) {
  const category = categoryExpense(state);
  const bars = [
    { name: "収入", value: monthlyIncome(monthTransactions(state.transactions)), fill: "#16a34a" },
    { name: "支出", value: monthlyExpense(monthTransactions(state.transactions)), fill: "#dc2626" },
    { name: "貯金", value: Math.max(monthlyIncome(monthTransactions(state.transactions)) - monthlyExpense(monthTransactions(state.transactions)), 0), fill: "#0f766e" }
  ];
  return (
    <div className="view-stack">
      <section className="panel chart-panel">
        <div className="section-title"><h2>カテゴリー分析</h2><span>今月</span></div>
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie data={category} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={4}>
              {category.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
            </Pie>
            <Tooltip formatter={(value) => yen.format(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
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

function GoalsView({ state, setState, setNotice }: { state: LedgerState; setState: (state: LedgerState) => void; setNotice: (message: string) => void }) {
  return (
    <div className="view-stack">
      {state.goals.map((goal) => {
        const projection = goalProjection(goal, state);
        return (
          <section className="panel goal-panel" key={goal.id}>
            <div className="section-title"><h2>{goal.name}</h2><span>{projection.projectedDate} 達成予測</span></div>
            <div className="progress"><span style={{ width: `${projection.progress}%` }} /></div>
            <div className="goal-numbers">
              <strong>{Math.round(projection.progress)}%</strong>
              <span>不足 {yen.format(projection.remaining)}</span>
            </div>
            <label className="slider-label">毎月の改善額 {yen.format(goal.monthlyBoost)}
              <input
                type="range"
                min="0"
                max="100000"
                step="5000"
                value={goal.monthlyBoost}
                onChange={(event) => setState({
                  ...state,
                  goals: state.goals.map((item) => item.id === goal.id ? { ...item, monthlyBoost: Number(event.target.value) } : item)
                })}
                onMouseUp={(event) => updateRemoteGoalBoost(goal.id, Number(event.currentTarget.value)).catch((error) => setNotice(error.message))}
                onTouchEnd={(event) => updateRemoteGoalBoost(goal.id, Number(event.currentTarget.value)).catch((error) => setNotice(error.message))}
              />
            </label>
          </section>
        );
      })}
    </div>
  );
}

function SettingsView({
  state,
  setState,
  setNotice,
  reloadHousehold
}: {
  state: LedgerState;
  setState: (state: LedgerState) => void;
  setNotice: (message: string) => void;
  reloadHousehold: (householdId: string) => Promise<void>;
}) {
  const [sharedName, setSharedName] = useState("共有家計簿");
  const [inviteCode, setInviteCode] = useState("");
  const [openingBalances, setOpeningBalances] = useState<Record<string, { amount: number; date: string }>>(
    Object.fromEntries(state.accounts.filter((account) => account.type !== "credit").map((account) => [account.id, { amount: account.openingBalance, date: account.openingBalanceDate ?? todayIso() }]))
  );
  const [newAccount, setNewAccount] = useState({ name: "", type: "bank" as AccountType, openingBalance: 0, openingBalanceDate: todayIso() });
  const [newCategory, setNewCategory] = useState({ name: "", parentId: "", color: "#0f766e" });
  const [newFixed, setNewFixed] = useState({ name: "", categoryId: state.categories[0]?.id ?? "", accountId: state.accounts[0]?.id ?? "", amount: 0, variable: false, dueDay: 1, status: "planned" as FixedCostStatus });

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="section-title"><h2>家計簿管理</h2><span>{state.householdName ?? (state.activeSpace === "personal" ? "個人" : "共有")}</span></div>
        <div className="ledger-list">
          {(state.households ?? []).map((household) => (
            <button
              className={household.id === state.householdId ? "selected-ledger" : ""}
              key={household.id}
              type="button"
              onClick={() => reloadHousehold(household.id).catch((error) => setNotice(error.message))}
            >
              <span>{household.name}</span>
              <em>{household.spaceType === "personal" ? "個人" : "共有"} / {household.memberRole === "owner" ? "所有者" : "メンバー"}</em>
            </button>
          ))}
        </div>
        {state.inviteCode && (
          <div className="invite-box">
            <span>招待コード</span>
            <strong>{state.inviteCode}</strong>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(state.inviteCode ?? "").then(() => setNotice("招待コードをコピーしました。"))}
              aria-label="招待コードをコピー"
            >
              <Copy size={16} />コピー
            </button>
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
                setNotice(error instanceof Error ? error.message : "共有家計簿の作成に失敗しました。");
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
                setNotice("共有家計簿に参加しました。");
              } catch (error) {
                setNotice(error instanceof Error ? error.message : "共有家計簿への参加に失敗しました。");
              }
            }}
          >
            招待コードで参加
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="section-title"><h2>口座</h2><span>{state.mode === "balance" ? "残高管理あり" : "収支のみ"}</span></div>
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
                setNotice(error instanceof Error ? error.message : "初期残高の更新に失敗しました。");
              }
            }}
          >
            初期残高を更新
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="section-title"><h2>口座の追加・編集</h2><span>削除は未使用口座向け</span></div>
        <div className="crud-form">
          <input placeholder="口座名" value={newAccount.name} onChange={(event) => setNewAccount({ ...newAccount, name: event.target.value })} />
          <select value={newAccount.type} onChange={(event) => setNewAccount({ ...newAccount, type: event.target.value as AccountType })}>
            <option value="bank">銀行口座</option><option value="cash">現金</option><option value="saving">貯金口座</option><option value="credit">クレジットカード</option>
          </select>
          <input type="number" min="0" value={newAccount.openingBalance} onChange={(event) => setNewAccount({ ...newAccount, openingBalance: Number(event.target.value) })} />
          <input type="date" value={newAccount.openingBalanceDate} onChange={(event) => setNewAccount({ ...newAccount, openingBalanceDate: event.target.value })} />
          <button className="full-primary" type="button" onClick={async () => {
            try {
              await createAccount(state.householdId ?? "", newAccount);
              await reloadHousehold(state.householdId ?? "");
              setNewAccount({ name: "", type: "bank", openingBalance: 0, openingBalanceDate: todayIso() });
              setNotice("口座を追加しました。");
            } catch (error) { setNotice(error instanceof Error ? error.message : "口座追加に失敗しました。"); }
          }}>口座を追加</button>
        </div>
        <EditableAccountList state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />
      </section>
      <section className="panel">
        <div className="section-title"><h2>カテゴリ管理</h2><span>追加・更新・削除</span></div>
        <div className="crud-form">
          <input placeholder="カテゴリ名" value={newCategory.name} onChange={(event) => setNewCategory({ ...newCategory, name: event.target.value })} />
          <select value={newCategory.parentId} onChange={(event) => setNewCategory({ ...newCategory, parentId: event.target.value })}>
            <option value="">親カテゴリ</option>{state.categories.filter((category) => !category.parentId).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
          <input type="color" value={newCategory.color} onChange={(event) => setNewCategory({ ...newCategory, color: event.target.value })} />
          <button className="full-primary" type="button" onClick={async () => {
            try {
              await createCategory(state.householdId ?? "", newCategory);
              await reloadHousehold(state.householdId ?? "");
              setNewCategory({ name: "", parentId: "", color: "#0f766e" });
              setNotice("カテゴリを追加しました。");
            } catch (error) { setNotice(error instanceof Error ? error.message : "カテゴリ追加に失敗しました。"); }
          }}>カテゴリを追加</button>
        </div>
        <EditableCategoryList state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />
      </section>
      <section className="panel">
        <div className="section-title"><h2>固定費管理</h2><span>追加・更新・削除</span></div>
        <div className="crud-form">
          <input placeholder="固定費名" value={newFixed.name} onChange={(event) => setNewFixed({ ...newFixed, name: event.target.value })} />
          <input type="number" min="0" value={newFixed.amount} onChange={(event) => setNewFixed({ ...newFixed, amount: Number(event.target.value) })} />
          <select value={newFixed.categoryId} onChange={(event) => setNewFixed({ ...newFixed, categoryId: event.target.value })}>{state.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select>
          <select value={newFixed.accountId} onChange={(event) => setNewFixed({ ...newFixed, accountId: event.target.value })}>{state.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select>
          <input type="number" min="1" max="31" value={newFixed.dueDay} onChange={(event) => setNewFixed({ ...newFixed, dueDay: Number(event.target.value) })} />
          <select value={newFixed.status} onChange={(event) => setNewFixed({ ...newFixed, status: event.target.value as FixedCostStatus })}><option value="planned">予定</option><option value="confirmed">確定</option><option value="paid">支払済</option></select>
          <button className="full-primary" type="button" onClick={async () => {
            try {
              await createFixedCost(state.householdId ?? "", newFixed);
              await reloadHousehold(state.householdId ?? "");
              setNewFixed({ name: "", categoryId: state.categories[0]?.id ?? "", accountId: state.accounts[0]?.id ?? "", amount: 0, variable: false, dueDay: 1, status: "planned" });
              setNotice("固定費を追加しました。");
            } catch (error) { setNotice(error instanceof Error ? error.message : "固定費追加に失敗しました。"); }
          }}>固定費を追加</button>
        </div>
        <EditableFixedCostList state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />
      </section>
      <section className="panel">
        <div className="section-title"><h2>固定費</h2><span>予定・確定・支払済</span></div>
        <div className="fixed-list">
          {state.fixedCosts.map((cost) => <div className={cost.status} key={cost.id}><span>{cost.name}</span><strong>{yen.format(cost.amount)}</strong><em>{fixedCostStatusLabel[cost.status]}</em></div>)}
        </div>
      </section>
      {state.profileRole !== "admin" && (
        <section className="panel">
          <div className="section-title"><h2>管理者設定</h2><span>初回のみ</span></div>
          <p className="setting-copy">まだ管理者がいない場合だけ、このログイン中のアカウントを管理者にできます。</p>
          <button
            className="full-primary"
            type="button"
            onClick={async () => {
              try {
                await claimFirstAdmin();
                setState({ ...state, profileRole: "admin" });
                setNotice("このアカウントを管理者にしました。");
              } catch (error) {
                setNotice(error instanceof Error ? error.message : "管理者設定に失敗しました。");
              }
            }}
          >
            初回管理者にする
          </button>
        </section>
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
  return <div className="edit-list">{state.accounts.map((account) => <EditableAccountRow key={account.id} account={account} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />)}</div>;
}

function EditableAccountRow({ account, state, setNotice, reloadHousehold }: { account: LedgerState["accounts"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  const [name, setName] = useState(account.name);
  const [openingBalance, setOpeningBalance] = useState(account.openingBalance);
  const [openingBalanceDate, setOpeningBalanceDate] = useState(account.openingBalanceDate ?? todayIso());
  return <div className="edit-row"><input value={name} onChange={(event) => setName(event.target.value)} /><input type="number" value={openingBalance} onChange={(event) => setOpeningBalance(Number(event.target.value))} /><input type="date" value={openingBalanceDate} onChange={(event) => setOpeningBalanceDate(event.target.value)} /><button onClick={async () => { try { await updateAccount(account.id, { name, openingBalance, openingBalanceDate }); await reloadHousehold(state.householdId ?? ""); setNotice("口座を更新しました。"); } catch (error) { setNotice(error instanceof Error ? error.message : "口座更新に失敗しました。"); } }}>更新</button><button onClick={async () => { try { await deleteAccount(account.id); await reloadHousehold(state.householdId ?? ""); setNotice("口座を削除しました。"); } catch (error) { setNotice(error instanceof Error ? error.message : "口座削除に失敗しました。"); } }}>削除</button></div>;
}

function EditableCategoryList({ state, setNotice, reloadHousehold }: { state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  return <div className="edit-list">{state.categories.map((category) => <EditableCategoryRow key={category.id} category={category} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />)}</div>;
}

function EditableCategoryRow({ category, state, setNotice, reloadHousehold }: { category: LedgerState["categories"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parentId ?? "");
  const [color, setColor] = useState(category.color);
  return <div className="edit-row"><input value={name} onChange={(event) => setName(event.target.value)} /><select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">親カテゴリ</option>{state.categories.filter((item) => !item.parentId && item.id !== category.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><button onClick={async () => { try { await updateCategory(category.id, { name, parentId, color }); await reloadHousehold(state.householdId ?? ""); setNotice("カテゴリを更新しました。"); } catch (error) { setNotice(error instanceof Error ? error.message : "カテゴリ更新に失敗しました。"); } }}>更新</button><button onClick={async () => { try { await deleteCategory(category.id); await reloadHousehold(state.householdId ?? ""); setNotice("カテゴリを削除しました。"); } catch (error) { setNotice(error instanceof Error ? error.message : "カテゴリ削除に失敗しました。"); } }}>削除</button></div>;
}

function EditableFixedCostList({ state, setNotice, reloadHousehold }: { state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  return <div className="edit-list">{state.fixedCosts.map((cost) => <EditableFixedCostRow key={cost.id} cost={cost} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />)}</div>;
}

function EditableFixedCostRow({ cost, state, setNotice, reloadHousehold }: { cost: LedgerState["fixedCosts"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  const [draft, setDraft] = useState(cost);
  return <div className="edit-row"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><input type="number" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })} /><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as FixedCostStatus })}><option value="planned">予定</option><option value="confirmed">確定</option><option value="paid">支払済</option></select><button onClick={async () => { try { await updateFixedCost(cost.id, draft); await reloadHousehold(state.householdId ?? ""); setNotice("固定費を更新しました。"); } catch (error) { setNotice(error instanceof Error ? error.message : "固定費更新に失敗しました。"); } }}>更新</button><button onClick={async () => { try { await deleteFixedCost(cost.id); await reloadHousehold(state.householdId ?? ""); setNotice("固定費を削除しました。"); } catch (error) { setNotice(error instanceof Error ? error.message : "固定費削除に失敗しました。"); } }}>削除</button></div>;
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
  if (editing) {
    return (
      <article className="tx-edit">
        <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as TransactionType })}><option value="expense">支出</option><option value="income">収入</option><option value="transfer">振替</option></select>
        <input type="number" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })} />
        <select value={draft.categoryId ?? ""} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>{state.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}>{state.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
        <input value={draft.memo ?? ""} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} />
        <button onClick={async () => { try { await updateTransaction(transaction.id, draft); setEditing(false); await reload(); setNotice("取引を更新しました。"); } catch (error) { setNotice(error instanceof Error ? error.message : "取引更新に失敗しました。"); } }}>保存</button>
        <button onClick={() => setEditing(false)}>取消</button>
      </article>
    );
  }
  return (
    <article>
      <div className={`tx-icon ${transaction.type}`}><ArrowDownUp size={16} /></div>
      <div><strong>{transaction.memo || category?.name || transactionTypeLabel[transaction.type]}</strong><span>{transaction.date} / {account?.name}{transaction.creditStatus ? ` / ${creditStatusLabel[transaction.creditStatus]}` : ""}</span></div>
      <em>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "-" : ""}{yen.format(transaction.amount)}</em>
      <button className="mini-button" onClick={() => setEditing(true)}>編集</button>
      <button className="mini-button" onClick={async () => { try { await deleteTransaction(transaction.id); await reload(); setNotice("取引を削除しました。"); } catch (error) { setNotice(error instanceof Error ? error.message : "取引削除に失敗しました。"); } }}>削除</button>
    </article>
  );
}

function nextWithdrawalDate(day: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  date.setDate(Math.min(day, 28));
  return date.toISOString().slice(0, 10);
}
