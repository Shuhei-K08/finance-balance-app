"use client";

import { useEffect, useRef, useState } from "react";
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
  confirmedAccountBalance,
  categoryExpense,
  creditStatusLabel,
  fixedCostOccurrencesForMonth,
  fixedCostForecast,
  goalProjection,
  investmentAssets,
  monthTransactions,
  monthTransactionsByKey,
  monthlyCreditWithdrawals,
  monthlyCreditWithdrawalsByKey,
  monthlyExpense,
  monthlyExpenseWithFixedByKey,
  monthlyExpenseWithFixed,
  monthlyIncome,
  monthlyIncomeWithFixedByKey,
  projectedMonthEnd,
  spendingAdvice,
  todayIso,
  totalAssets,
  transactionLedgerDate,
  transactionTypeLabel,
  yen
} from "@/lib/finance";
import type { FixedCostOccurrence } from "@/lib/finance";
import { loadState, saveState } from "@/lib/storage";
import { analyzeFinance, buildAnnualSavingsPrompt, buildFinancePrompt } from "@/lib/gemini";
import { LedgerState, TransactionType } from "@/lib/types";
import type { AdminDashboard } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  createSharedLedger,
  adminDeleteHousehold,
  adminDeleteUser,
  adminResumeUser,
  adminSuspendUser,
  createAccount,
  createInvestmentAccount,
  createCategory,
  createFixedCost,
  createGoal,
  deleteAccount,
  deleteInvestmentAccount,
  deleteCategory,
  deleteInvestmentRecord,
  deleteFixedCost,
  deleteGoal,
  deleteSharedLedger,
  deleteOwnedLedger,
  deleteTransaction,
  insertRemoteTransaction,
  joinSharedLedger,
  leaveSharedLedger,
  loadAdminDashboard,
  loadHouseholdMembers,
  loadRemoteState,
  removeSharedLedgerMember,
  renameSharedLedger,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  updateAccount,
  updateInvestmentAccount,
  updateCategory,
  updateFixedCost,
  updateGoal,
  updateOpeningBalances,
  updateSubcategoryOrder,
  updateTransaction,
  upsertInvestmentRecord,
  upsertFixedCostOverride,
  upsertAssetSnapshots,
  extractErrorText,
  toJapaneseError
} from "@/lib/db";
import { AccountType } from "@/lib/types";
import type { HouseholdMember } from "@/lib/types";

type Tab = "home" | "analysis" | "investments" | "goals" | "settings" | "admin";

const baseTabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "ホーム", icon: Home },
  { id: "analysis", label: "分析", icon: BarChart3 },
  { id: "investments", label: "投資", icon: Landmark },
  { id: "goals", label: "目標", icon: Goal },
  { id: "settings", label: "設定", icon: Settings }
];

const accountColorForType = (type: AccountType) => {
  if (type === "saving") return "#059669";
  if (type === "cash") return "#d97706";
  if (type === "credit") return "#7c3aed";
  return "#2563eb";
};

export default function App() {
  const [state, setState] = useState<LedgerState | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDate, setQuickDate] = useState(todayIso());
  const [calendarMonth, setCalendarMonth] = useState(todayIso().slice(0, 7));
  const [calendarDate, setCalendarDate] = useState(todayIso());
  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return window.localStorage.getItem("mirai-ledger-household-id") || undefined;
  });
  const selectedHouseholdRef = useRef<string | undefined>(selectedHouseholdId);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setState(loadState());
      setAuthReady(true);
      return;
    }

    let mounted = true;
    bootAuth().catch((error) => {
      if (!mounted) return;
      setNotice(toJapaneseError(error, "アプリの起動に失敗しました。"));
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
      const sessionResult = await withTimeout(supabase!.auth.getSession(), 8000, "ログイン状態の確認がタイムアウトしました。");
      if (!mounted) return;
      setIsAuthed(Boolean(sessionResult.data.session));
      if (sessionResult.data.session) {
        try {
          await withTimeout(refreshRemoteState(), 12000, "家計簿データの読み込みがタイムアウトしました。");
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

  function rememberHouseholdId(householdId?: string) {
    selectedHouseholdRef.current = householdId;
    setSelectedHouseholdId(householdId);
    if (typeof window === "undefined") return;
    if (householdId) window.localStorage.setItem("mirai-ledger-household-id", householdId);
    else window.localStorage.removeItem("mirai-ledger-household-id");
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function refreshRemoteState() {
    const next = await loadRemoteState(selectedHouseholdRef.current);
    rememberHouseholdId(next.householdId);
    setState(next);
  }

  async function switchHousehold(householdId: string) {
    rememberHouseholdId(householdId);
    const next = await loadRemoteState(householdId);
    rememberHouseholdId(next.householdId);
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

  const month = monthTransactionsByKey(state.transactions, calendarMonth);
  const stats = {
    assets: totalAssets(state, calendarMonth),
    expense: monthlyExpenseWithFixedByKey(state, calendarMonth),
    income: monthlyIncomeWithFixedByKey(state, calendarMonth),
    forecast: projectedMonthEnd(state, calendarMonth),
    fixed: fixedCostForecast(state.fixedCosts, calendarMonth),
    credit: monthlyCreditWithdrawalsByKey(state, calendarMonth)
  };
  const visibleTabs = state.profileRole === "admin"
    ? [...baseTabs, { id: "admin" as const, label: "管理", icon: UserPlus }]
    : baseTabs;

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
    creditPostingMode?: "used" | "withdrawal";
  }) {
    if (!state) return;
    if (transaction.type !== "transfer" && !transaction.categoryId) {
      setNotice("カテゴリーを選択してください。");
      return;
    }
    if (!transaction.accountId) {
      setNotice(transaction.type === "income" ? "入金先を選択してください。" : transaction.type === "transfer" ? "振替元を選択してください。" : "支払元を選択してください。");
      return;
    }
    if (transaction.type === "income" && state.accounts.find((account) => account.id === transaction.accountId)?.type === "credit") {
      setNotice("収入の入金先にクレジットカードは選択できません。");
      return;
    }
    if (transaction.type === "transfer" && !transaction.transferToAccountId) {
      setNotice("振替先を選択してください。");
      return;
    }
    const creditAccount = state.accounts.find((account) => account.id === transaction.accountId && account.type === "credit");
    const withdrawalDate = transaction.type === "expense" && creditAccount && transaction.creditPostingMode === "withdrawal" ? nextWithdrawalDate(creditAccount, transaction.date) : undefined;
    const payload = {
      ...transaction,
      categoryId: transaction.type === "transfer" ? undefined : transaction.categoryId,
      transferToAccountId: transaction.type === "transfer" ? transaction.transferToAccountId : undefined,
      date: transaction.date,
      reflectedDate: withdrawalDate,
      creditStatus: transaction.type === "expense" && creditAccount ? "unconfirmed" as const : undefined
    };
    try {
      const idempotencyKey = `${state.householdId ?? "local"}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const id = await insertRemoteTransaction(state.householdId ?? "", { ...payload, idempotencyKey });
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
        <div className="brand-heading">
          <img src="/mirai-ledger-logo.svg" alt="Mirai Ledger" />
          <div>
            <p className="eyebrow">{state.activeSpace === "shared" ? "共有カレンダー" : "Mirai Ledger"}</p>
            <h1>{state.householdName ?? "未来残高を見ながら整える家計簿"}</h1>
          </div>
        </div>
        <div className="top-actions">
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

      {tab === "home" && (
        <HomeView
          state={state}
          stats={stats}
          setNotice={setNotice}
          reload={() => refreshRemoteState()}
          onQuick={openQuick}
          calendarMonth={calendarMonth}
          setCalendarMonth={setCalendarMonth}
          calendarDate={calendarDate}
          setCalendarDate={setCalendarDate}
        />
      )}
      {tab === "analysis" && (
        <AnalysisView
          state={state}
          monthKey={calendarMonth}
          stats={stats}
        />
      )}
      {tab === "investments" && <InvestmentsView state={state} monthKey={calendarMonth} setNotice={setNotice} reload={() => refreshRemoteState()} />}
      {tab === "goals" && <GoalsView state={state} monthKey={calendarMonth} setNotice={setNotice} reload={() => refreshRemoteState()} />}
      {tab === "settings" && <SettingsView state={state} setNotice={setNotice} reloadHousehold={switchHousehold} />}
      {tab === "admin" && state.profileRole === "admin" && <AdminView />}

      <button className="floating-add-button" type="button" onClick={() => openQuick()} aria-label="取引を追加">
        <ListPlus size={24} />
      </button>

      <section className="bottom-controls">
        <MonthControl monthKey={calendarMonth} setMonthKey={setCalendarMonth} setSelectedDate={setCalendarDate} label="表示月" compact />
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
      </section>

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
        <p className="eyebrow">初期設定</p>
        <h1>アプリの接続設定が必要です</h1>
        <p className="auth-copy">ログイン機能を使うための接続情報がまだ設定されていません。</p>
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
  const [googleBusy, setGoogleBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setNotice("");
    try {
      const email = String(form.get("email"));
      const password = String(form.get("password"));
      if (mode === "signup") {
        const confirmPassword = String(form.get("confirmPassword"));
        if (password !== confirmPassword) {
          setNotice("確認用パスワードが一致しません。");
          return;
        }
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

  async function continueWithGoogle() {
    setGoogleBusy(true);
    setNotice("");
    try {
      await signInWithGoogle();
    } catch (error) {
      setGoogleBusy(false);
      setNotice(toJapaneseError(error, "Googleログインに失敗しました。"));
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Mirai Ledger</p>
        <h1>{mode === "login" ? "ログイン" : "アカウント作成"}</h1>
        <p className="auth-copy">未来の残高を見ながら、収入・支出・資産をまとめて管理できます。</p>
        {notice && <div className="notice" role="status">{notice}</div>}
        <form className="auth-form" onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }}>
          {mode === "signup" && (
            <label><UserPlus size={16} />表示名<input name="displayName" autoComplete="name" placeholder="山田 太郎" /></label>
          )}
          <label><Mail size={16} />メールアドレス<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label><Lock size={16} />パスワード<input name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="8文字以上" /></label>
          {mode === "signup" && (
            <label><Lock size={16} />確認用パスワード<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required placeholder="もう一度入力" /></label>
          )}
          <button className="full-primary" type="submit" disabled={busy}>{busy ? "処理中" : mode === "login" ? "ログイン" : "作成する"}</button>
        </form>
        <button className="google-button" type="button" disabled={googleBusy} onClick={continueWithGoogle}>{googleBusy ? "Googleへ移動中" : "Googleで続ける"}</button>
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
        <h1>データの読み込みで止まりました</h1>
        <p className="auth-copy">家計簿データの取得または初期作成で失敗しています。時間をおいて再試行してください。</p>
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
                value={numberInputValue(balances[account.id]?.amount ?? 0)}
                onChange={(event) => setBalances({ ...balances, [account.id]: { ...(balances[account.id] ?? { date: todayIso() }), amount: Number(event.target.value || 0) } })}
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

function HomeView({
  state,
  stats,
  setNotice,
  reload,
  onQuick,
  calendarMonth,
  setCalendarMonth,
  calendarDate,
  setCalendarDate
}: {
  state: LedgerState;
  stats: Record<string, number>;
  setNotice: (message: string) => void;
  reload: () => Promise<void>;
  onQuick: (date?: string) => void;
  calendarMonth: string;
  setCalendarMonth: (value: string) => void;
  calendarDate: string;
  setCalendarDate: (value: string) => void;
}) {
  const monthLabel = formatMonthLabel(calendarMonth);
  const isCurrentMonth = calendarMonth === todayIso().slice(0, 7);
  const confirmedSnapshots = state.assetSnapshots.filter((snapshot) => snapshot.month === calendarMonth);
  const isSnapshotConfirmed = isAssetSnapshotConfirmed(state, calendarMonth);
  const shouldShowSnapshotPanel = shouldShowAssetSnapshotPanel(calendarMonth, isSnapshotConfirmed);
  const suggestedPromptMonth = suggestedAssetSnapshotMonth(state);
  const [promptMonth, setPromptMonth] = useState<string | null>(null);
  const [homeEntryModal, setHomeEntryModal] = useState<"expense" | "income" | "credit" | null>(null);
  useEffect(() => {
    if (!suggestedPromptMonth) return;
    const key = `asset-snapshot-prompt-${state.householdId}-${suggestedPromptMonth}`;
    if (window.localStorage.getItem(key)) return;
    setPromptMonth(suggestedPromptMonth);
    window.localStorage.setItem(key, "shown");
  }, [state.householdId, suggestedPromptMonth]);
  useEffect(() => {
    if (promptMonth && isAssetSnapshotConfirmed(state, promptMonth)) setPromptMonth(null);
  }, [state.assetSnapshots.length, promptMonth]);
  const savingAmount = stats.income - stats.expense;
  const savingRate = Math.max(Math.round((savingAmount / Math.max(stats.income, 1)) * 100), 0);
  const displayAssets = isCurrentMonth ? stats.forecast : stats.assets;
  return (
    <div className="view-stack">
      <section className="hero-panel">
        <div>
          <p>{isCurrentMonth ? "予定総資産" : `${monthLabel}時点の総資産`}</p>
          <strong>{yen.format(displayAssets)}</strong>
          <span>{isCurrentMonth ? "今月の収支と引落予定を反映" : "確定済み月末資産と収支を反映"}</span>
        </div>
      </section>

      {shouldShowSnapshotPanel && (
        <AssetSnapshotPanel
          state={state}
          monthKey={calendarMonth}
          setNotice={setNotice}
          reload={reload}
          snapshotCount={confirmedSnapshots.length}
        />
      )}
      {promptMonth && !isAssetSnapshotConfirmed(state, promptMonth) && (
        <AssetSnapshotPrompt
          state={state}
          monthKey={promptMonth}
          setNotice={setNotice}
          reload={reload}
          onClose={() => setPromptMonth(null)}
        />
      )}

      <div className="stat-grid">
        <Metric icon={Wallet} label={`${monthLabel} 支出`} value={yen.format(stats.expense)} onClick={() => setHomeEntryModal("expense")} />
        <Metric icon={Landmark} label={`${monthLabel} 収入`} value={yen.format(stats.income)} onClick={() => setHomeEntryModal("income")} />
        <Metric icon={PiggyBank} label="貯金額 / 貯金率" value={`${yen.format(savingAmount)} / ${savingRate}%`} />
        <Metric icon={ArrowDownUp} label={`${monthLabel} カード引落`} value={yen.format(stats.credit)} onClick={() => setHomeEntryModal("credit")} />
      </div>

      <HomeCalendar
        state={state}
        setNotice={setNotice}
        reload={reload}
        onQuick={onQuick}
        selectedMonth={calendarMonth}
        setSelectedMonth={setCalendarMonth}
        selectedDate={calendarDate}
        setSelectedDate={setCalendarDate}
      />
      {homeEntryModal && (
        <HomeEntryModal
          type={homeEntryModal}
          monthKey={calendarMonth}
          state={state}
          setNotice={setNotice}
          reload={reload}
          onClose={() => setHomeEntryModal(null)}
        />
      )}
    </div>
  );
}

function AssetSnapshotPanel({
  state,
  monthKey,
  setNotice,
  reload,
  snapshotCount
}: {
  state: LedgerState;
  monthKey: string;
  setNotice: (message: string) => void;
  reload: () => Promise<void>;
  snapshotCount: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel asset-snapshot-panel important">
      <div>
        <strong>{formatMonthLabel(monthKey)}の月末資産を確認</strong>
        <span>{snapshotCount > 0 ? "確定済みです。実残高と違う場合は再確定できます。" : "未確定です。翌月以降の残高計算の基準になります。"}</span>
      </div>
      <button type="button" onClick={() => setOpen(true)}>月末資産を確定</button>
      {open && (
        <AssetSnapshotModal
          state={state}
          monthKey={monthKey}
          setNotice={setNotice}
          reload={reload}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

function AssetSnapshotPrompt({ state, monthKey, setNotice, reload, onClose }: { state: LedgerState; monthKey: string; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void }) {
  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel asset-confirm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="section-title"><h2>{formatMonthLabel(monthKey)}の月末資産確認</h2><span>残高確定</span></div>
        <p className="setting-copy">月末・月初は実残高とアプリ残高がズレやすい時期です。口座残高を確定すると、翌月以降の資産推移が正確になります。</p>
        <button className="full-primary" type="button" onClick={onClose}>あとで確認</button>
        <AssetSnapshotEditor state={state} monthKey={monthKey} setNotice={setNotice} reload={reload} onDone={onClose} />
      </section>
    </div>
  );
}

function AssetSnapshotModal({ state, monthKey, setNotice, reload, onClose }: { state: LedgerState; monthKey: string; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void }) {
  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-title"><h2>{formatMonthLabel(monthKey)}の資産確定</h2><span>翌月以降の基準</span></div>
        <p className="setting-copy">ここで保存した口座別残高を、翌月以降の資産計算の起点にします。通帳や実残高と違う場合は調整して保存してください。</p>
        <AssetSnapshotEditor state={state} monthKey={monthKey} setNotice={setNotice} reload={reload} onDone={onClose} />
        <button className="google-button" type="button" onClick={onClose}>閉じる</button>
      </section>
    </div>
  );
}

function AssetSnapshotEditor({ state, monthKey, setNotice, reload, onDone }: { state: LedgerState; monthKey: string; setNotice: (message: string) => void; reload: () => Promise<void>; onDone?: () => void }) {
  const assetAccounts = state.accounts.filter((account) => account.type !== "credit");
  const [balances, setBalances] = useState<Record<string, number>>({});
  useEffect(() => {
    setBalances(Object.fromEntries(assetAccounts.map((account) => [
      account.id,
      confirmedAccountBalance(account, state, monthKey)
    ])));
  }, [state.householdId, state.assetSnapshots.length, state.transactions.length, monthKey]);

  async function save() {
    try {
      await upsertAssetSnapshots(state.householdId ?? "", monthKey, balances);
      await reload();
      onDone?.();
      setNotice(`${formatMonthLabel(monthKey)}の月末資産を確定しました。`);
    } catch (error) {
      setNotice(toJapaneseError(error, "月末資産の確定に失敗しました。"));
    }
  }

  return (
    <div className="asset-snapshot-editor">
      <div className="opening-list">
        {assetAccounts.map((account) => (
          <label key={account.id}>{account.name}
            <input
              type="number"
              value={numberInputValue(balances[account.id] ?? 0)}
              onChange={(event) => setBalances({ ...balances, [account.id]: Number(event.target.value || 0) })}
            />
          </label>
        ))}
      </div>
      <button className="full-primary" type="button" onClick={save}>この金額で確定</button>
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
  onSubmit: (transaction: { type: TransactionType; amount: number; categoryId?: string; accountId: string; transferToAccountId?: string; date: string; memo?: string; creditPostingMode?: "used" | "withdrawal" }) => Promise<void>;
}) {
  const usableAccounts = state.accounts;
  const normalAccounts = state.accounts.filter((account) => account.type !== "credit");
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [transferToAccountId, setTransferToAccountId] = useState("");
  const [date, setDate] = useState(initialDate);
  const [memo, setMemo] = useState("");
  const [creditPostingMode, setCreditPostingMode] = useState<"used" | "withdrawal">("used");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedAccount = state.accounts.find((account) => account.id === accountId);
  const isCreditExpense = type === "expense" && selectedAccount?.type === "credit";
  const accountChoices = type === "income" || type === "transfer" ? normalAccounts : usableAccounts;

  function changeType(nextType: TransactionType) {
    setType(nextType);
    setCategoryId("");
    setAccountId("");
    setTransferToAccountId("");
    setCreditPostingMode("used");
    setError("");
  }

  async function submit() {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("金額を入力してください。");
      return;
    }
    if (type !== "transfer" && !categoryId) {
      setError("カテゴリーを選択してください。");
      return;
    }
    if (!accountId) {
      setError(type === "income" ? "入金先を選択してください。" : type === "transfer" ? "振替元を選択してください。" : "支払元を選択してください。");
      return;
    }
    if (type === "income" && state.accounts.find((account) => account.id === accountId)?.type === "credit") {
      setError("収入の入金先にクレジットカードは選択できません。");
      return;
    }
    if (type === "transfer" && !transferToAccountId) {
      setError("振替先を選択してください。");
      return;
    }
    if (type === "transfer" && accountId === transferToAccountId) {
      setError("振替元と振替先は別の口座を選択してください。");
      return;
    }
    setError("");
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        type,
        amount: value,
        categoryId: type === "transfer" ? undefined : categoryId || undefined,
        accountId,
        transferToAccountId: type === "transfer" ? transferToAccountId || undefined : undefined,
        date,
        memo,
        creditPostingMode: isCreditExpense ? creditPostingMode : undefined
      });
    } finally {
      setSubmitting(false);
    }
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
            <label>カテゴリー<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">選択してください</option>
              <CategoryOptions categories={state.categories} kind={type === "income" ? "income" : "expense"} />
            </select></label>
          )}
          <label>{type === "income" ? "入金先" : type === "transfer" ? "振替元" : "支払元"}<select value={accountId} onChange={(event) => { setAccountId(event.target.value); if (event.target.value === transferToAccountId) setTransferToAccountId(""); setCreditPostingMode("used"); }}>
            <option value="">選択してください</option>
            {accountChoices.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select></label>
          {type === "transfer" && (
            <label>振替先<select value={transferToAccountId} onChange={(event) => setTransferToAccountId(event.target.value)}>
              <option value="">選択してください</option>
              {normalAccounts.filter((account) => account.id !== accountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select></label>
          )}
          <label>{isCreditExpense ? "使用日" : "日付"}<input value={date} onChange={(event) => setDate(event.target.value)} type="date" /></label>
        </div>
        {isCreditExpense && (
          <div className="credit-posting-mode">
            <span>計上する日付</span>
            <div className="segmented compact">
              <button className={creditPostingMode === "used" ? "selected" : ""} type="button" onClick={() => setCreditPostingMode("used")}>使用日</button>
              <button className={creditPostingMode === "withdrawal" ? "selected" : ""} type="button" onClick={() => setCreditPostingMode("withdrawal")}>引落日</button>
            </div>
            <small>{creditPostingMode === "withdrawal" ? `${nextWithdrawalDate(selectedAccount, date)} に収支へ反映します。` : "使用日に収支へ反映します。"}</small>
          </div>
        )}
        <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="メモ" />
        {error && <p className="form-error">{error}</p>}
        <button className="full-primary" type="submit" disabled={submitting}>{submitting ? "登録中" : "登録"}</button>
      </form>
    </div>
  );
}

function CategoryOptions({ categories, kind }: { categories: LedgerState["categories"]; kind: "expense" | "income" }) {
  const parents = sortCategories(categories.filter((category) => !category.parentId && category.kind === kind));
  return (
    <>
      {parents.map((parent) => {
        const children = sortSubcategories(categories.filter((category) => category.parentId === parent.id && category.kind === kind));
        return (
          <optgroup key={parent.id} label={parent.name}>
            <option value={parent.id}>{parent.name}</option>
            {children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

function sortCategories(categories: LedgerState["categories"]) {
  return [...categories].sort((a, b) => colorLightness(a.color) - colorLightness(b.color) || a.name.localeCompare(b.name, "ja"));
}

function sortSubcategories(categories: LedgerState["categories"]) {
  const hasManualOrder = categories.some((category) => typeof category.sortOrder === "number" && category.sortOrder > 0);
  return [...categories].sort((a, b) => {
    const aOther = a.name === "その他";
    const bOther = b.name === "その他";
    if (aOther !== bOther) return aOther ? 1 : -1;
    if (hasManualOrder) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "ja");
    return a.name.localeCompare(b.name, "ja");
  });
}

function categoryDisplayColor(category: LedgerState["categories"][number], categories: LedgerState["categories"]) {
  return category.color;
}

function colorLightness(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3 ? normalized.split("").map((char) => `${char}${char}`).join("") : normalized.padEnd(6, "0").slice(0, 6);
  const parsed = Number.parseInt(value, 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function subcategoryColorPreview(parentColor: string, index: number) {
  const base = hexToRgb(parentColor || "#0f766e");
  const mix = Math.min(0.24 + index * 0.12, 0.76);
  return rgbToHex({
    r: base.r + (255 - base.r) * mix,
    g: base.g + (255 - base.g) * mix,
    b: base.b + (255 - base.b) * mix
  });
}

function nextSubcategoryColor(categories: LedgerState["categories"], parentId: string) {
  const parent = categories.find((category) => category.id === parentId);
  const index = categories.filter((category) => category.parentId === parentId).length;
  return subcategoryColorPreview(parent?.color ?? "#0f766e", index);
}

function fixedKindMeta(kind: TransactionType) {
  if (kind === "income") return { label: "定期収入", className: "income", sign: "+" };
  if (kind === "transfer") return { label: "定期振替", className: "transfer", sign: "" };
  return { label: "定期支出", className: "expense", sign: "-" };
}

function HomeCalendar({
  state,
  setNotice,
  reload,
  onQuick,
  selectedMonth,
  setSelectedMonth,
  selectedDate,
  setSelectedDate
}: {
  state: LedgerState;
  setNotice: (message: string) => void;
  reload: () => Promise<void>;
  onQuick: (date: string) => void;
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  selectedDate: string;
  setSelectedDate: (value: string) => void;
}) {
  const [modalDate, setModalDate] = useState<string | null>(null);
  const monthKey = selectedMonth;
  const days = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  const firstDay = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1).getDay();
  const monthRows = state.transactions.filter((transaction) => transactionLedgerDate(transaction).startsWith(monthKey));
  const fixedRows = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state);
  const monthIncome = monthlyIncome(monthRows) + fixedRows.filter((row) => row.kind === "income").reduce((sum, row) => sum + row.amount, 0);
  const fixedExpense = fixedRows.filter((row) => row.kind === "expense").reduce((sum, row) => sum + row.amount, 0);
  const monthExpense = monthlyExpense(monthRows) + fixedExpense;

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
          <strong>{formatMonthLabel(monthKey)}</strong>
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
            const income = monthRows.filter((transaction) => transactionLedgerDate(transaction) === date && transaction.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
            const expense = monthRows.filter((transaction) => transactionLedgerDate(transaction) === date && transaction.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
            const transfer = monthRows.filter((transaction) => transactionLedgerDate(transaction) === date && transaction.type === "transfer").reduce((sum, tx) => sum + tx.amount, 0);
            const fixedIncome = fixedRows.filter((row) => row.date === date && row.kind === "income").reduce((sum, row) => sum + row.amount, 0);
            const fixed = fixedRows.filter((row) => row.date === date && row.kind === "expense").reduce((sum, row) => sum + row.amount, 0);
            const fixedTransfer = fixedRows.filter((row) => row.date === date && row.kind === "transfer").reduce((sum, row) => sum + row.amount, 0);
            return <button className={date === selectedDate ? "selected-day" : ""} key={date} type="button" onClick={() => { setSelectedDate(date); setModalDate(date); }}><strong>{index + 1}</strong>{income + fixedIncome > 0 && <span className="income-mini">+{yen.format(income + fixedIncome)}</span>}{expense > 0 && <span>-{yen.format(expense)}</span>}{fixed > 0 && <span className="fixed-mini">固定 -{yen.format(fixed)}</span>}{transfer + fixedTransfer > 0 && <span className="transfer-mini">振替 {yen.format(transfer + fixedTransfer)}</span>}</button>;
          })}
        </div>
        <button className="full-primary" type="button" onClick={() => setModalDate(selectedDate)}>選択日の取引を開く</button>
      </section>
      {modalDate && <CalendarDayModal date={modalDate} state={state} setNotice={setNotice} reload={reload} onClose={() => setModalDate(null)} onQuick={(date) => { setModalDate(null); onQuick(date); }} />}
    </div>
  );
}

function HomeEntryModal({ type, monthKey, state, setNotice, reload, onClose }: { type: "expense" | "income" | "credit"; monthKey: string; state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void }) {
  const creditIds = new Set(state.accounts.filter((account) => account.type === "credit").map((account) => account.id));
  const rows = state.transactions
    .filter((transaction) => (
      type === "credit"
        ? transaction.type === "expense" && creditIds.has(transaction.accountId) && transactionLedgerDate(transaction).startsWith(monthKey)
        : transaction.type === type && transactionLedgerDate(transaction).startsWith(monthKey)
    ))
    .sort((a, b) => transactionLedgerDate(b).localeCompare(transactionLedgerDate(a)));
  const fixedRows = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state).filter((row) => (
    type === "credit"
      ? row.kind === "expense" && creditIds.has(row.accountId)
      : row.kind === type
  ));
  const entries = [
    ...rows.map((transaction) => ({ kind: "transaction" as const, date: transactionLedgerDate(transaction), transaction })),
    ...fixedRows.map((fixedCost) => ({ kind: "fixed" as const, date: fixedCost.date, fixedCost }))
  ].sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((sum, transaction) => sum + transaction.amount, 0) + fixedRows.reduce((sum, row) => sum + row.amount, 0);
  const title = type === "income" ? "収入" : type === "credit" ? "カード引落" : "支出";
  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel entry-modal" onClick={(event) => event.stopPropagation()}>
        <div className="section-title">
          <h2>{formatMonthLabel(monthKey)}の{title}一覧</h2>
          <span>{yen.format(total)}</span>
        </div>
        {type === "credit" && <CreditCardTotals state={state} monthKey={monthKey} />}
        {entries.length === 0 ? (
          <div className="empty-state"><span>この月の{title}はまだありません。</span></div>
        ) : (
          <MonthEntryList entries={entries} state={state} setNotice={setNotice} reload={reload} />
        )}
        <button className="google-button" type="button" onClick={onClose}>閉じる</button>
      </section>
    </div>
  );
}

function CreditCardTotals({ state, monthKey }: { state: LedgerState; monthKey: string }) {
  const creditAccounts = state.accounts.filter((account) => account.type === "credit");
  const totals = creditAccounts
    .map((account) => {
      const transactionTotal = monthTransactionsByKey(state.transactions, monthKey)
        .filter((transaction) => transaction.type === "expense" && transaction.accountId === account.id)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const fixedTotal = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state)
        .filter((cost) => cost.kind === "expense" && cost.accountId === account.id)
        .reduce((sum, cost) => sum + cost.amount, 0);
      return { account, transactionTotal, fixedTotal, total: transactionTotal + fixedTotal };
    })
    .filter((row) => row.total > 0);
  if (!totals.length) return null;
  return (
    <div className="credit-card-totals">
      {totals.map((row) => (
        <div key={row.account.id}>
          <span><i style={{ background: row.account.color }} />{row.account.name}</span>
          <strong>{yen.format(row.total)}</strong>
          <small>支出 {yen.format(row.transactionTotal)} / 定期支出 {yen.format(row.fixedTotal)}</small>
        </div>
      ))}
    </div>
  );
}

function CalendarDayModal({ date, state, setNotice, reload, onClose, onQuick }: { date: string; state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void; onQuick: (date: string) => void }) {
  const rows = state.transactions.filter((transaction) => transactionLedgerDate(transaction) === date);
  const fixedRows = fixedCostOccurrencesForMonth(state.fixedCosts, date.slice(0, 7), state).filter((row) => row.date === date);
  const count = rows.length + fixedRows.length;
  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-title"><h2>{date} の収支</h2><span>{count}件</span></div>
        <button className="full-primary" type="button" onClick={() => onQuick(date)}>この日に登録</button>
        {count === 0 ? (
          <div className="empty-state"><span>この日の取引はまだありません。</span></div>
        ) : (
          <>
            {fixedRows.length > 0 && <FixedCostOccurrenceList rows={fixedRows} state={state} setNotice={setNotice} reload={reload} />}
            {rows.length > 0 && <TransactionList state={{ ...state, transactions: rows }} setNotice={setNotice} reload={reload} />}
          </>
        )}
        <button className="google-button" type="button" onClick={onClose}>閉じる</button>
      </section>
    </div>
  );
}

function MonthEntryList({
  entries,
  state,
  setNotice,
  reload
}: {
  entries: Array<{ kind: "transaction"; date: string; transaction: LedgerState["transactions"][number] } | { kind: "fixed"; date: string; fixedCost: FixedCostOccurrence }>;
  state: LedgerState;
  setNotice: (message: string) => void;
  reload: () => Promise<void>;
}) {
  if (entries.length === 0) return <div className="empty-state"><span>この月の収支はまだありません。</span></div>;
  return (
    <div className="transaction-list month-entry-list">
      {entries.map((entry) => (
        entry.kind === "fixed"
          ? <FixedCostOccurrenceRow key={`fixed-${entry.fixedCost.id}-${entry.date}`} row={entry.fixedCost} state={state} setNotice={setNotice} reload={reload} />
          : <TransactionRow key={entry.transaction.id} transaction={entry.transaction} state={state} setNotice={setNotice} reload={reload} />
      ))}
    </div>
  );
}

function FixedCostOccurrenceList({ rows, state, setNotice, reload }: { rows: FixedCostOccurrence[]; state: LedgerState; setNotice?: (message: string) => void; reload?: () => Promise<void> }) {
  return <div className="transaction-list">{rows.map((row) => <FixedCostOccurrenceRow key={`fixed-${row.id}-${row.date}`} row={row} state={state} setNotice={setNotice} reload={reload} />)}</div>;
}

function FixedCostOccurrenceRow({ row, state, setNotice, reload }: { row: FixedCostOccurrence; state: LedgerState; setNotice?: (message: string) => void; reload?: () => Promise<void> }) {
  const category = state.categories.find((item) => item.id === row.categoryId);
  const account = state.accounts.find((item) => item.id === row.accountId);
  const transferToAccount = state.accounts.find((item) => item.id === row.transferToAccountId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: row.name, amount: row.amount, categoryId: row.categoryId, accountId: row.accountId, transferToAccountId: row.transferToAccountId ?? "", dueDay: row.dueDay });
  const meta = fixedKindMeta(row.kind);
  return (
    <article className="fixed-occurrence-row">
      <div className="tx-icon fixed"><Landmark size={16} /></div>
      <div><strong>{row.name}</strong><span><b className={`kind-badge ${meta.className}`}>{meta.label}</b>{row.date} / {row.kind === "transfer" ? `${account?.name ?? "未設定"} → ${transferToAccount?.name ?? "未設定"}` : `${category?.name ?? "未設定"} / ${account?.name ?? "未設定"}`}</span></div>
      <em>{meta.sign}{yen.format(row.amount)}</em>
      {setNotice && reload && <button className="mini-button" type="button" onClick={() => setEditing(!editing)}>この月だけ変更</button>}
      {editing && (
        <div className="fixed-override-form">
          <label>名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>金額<input type="number" value={numberInputValue(draft.amount)} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value || 0) })} /></label>
          {row.kind !== "transfer" && <label>カテゴリ<select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><CategoryOptions categories={state.categories} kind={row.kind} /></select></label>}
          <label>{row.kind === "income" ? "入金先" : row.kind === "transfer" ? "振替元" : "支払元"}<select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value, transferToAccountId: event.target.value === draft.transferToAccountId ? "" : draft.transferToAccountId })}>{state.accounts.filter((accountItem) => row.kind === "expense" || accountItem.type !== "credit").map((accountItem) => <option value={accountItem.id} key={accountItem.id}>{accountItem.name}</option>)}</select></label>
          {row.kind === "transfer" && <label>振替先<select value={draft.transferToAccountId} onChange={(event) => setDraft({ ...draft, transferToAccountId: event.target.value })}><option value="">選択してください</option>{state.accounts.filter((accountItem) => accountItem.type !== "credit" && accountItem.id !== draft.accountId).map((accountItem) => <option value={accountItem.id} key={accountItem.id}>{accountItem.name}</option>)}</select></label>}
          <label>日付<input type="number" min="1" max="31" value={numberInputValue(draft.dueDay)} onChange={(event) => setDraft({ ...draft, dueDay: Number(event.target.value || 0) })} /></label>
          <button type="button" onClick={async () => {
            try {
              if (row.kind === "transfer" && !draft.transferToAccountId) {
                setNotice?.("振替先を選択してください。");
                return;
              }
              await upsertFixedCostOverride(state.householdId ?? "", row.id, row.date.slice(0, 7), draft);
              await reload?.();
              setEditing(false);
              setNotice?.("選択月のみ変更しました。");
            } catch (error) {
              setNotice?.(toJapaneseError(error, "選択月のみの変更に失敗しました。"));
            }
          }}>保存</button>
        </div>
      )}
    </article>
  );
}

function useFinanceAi(state: LedgerState, stats: Record<string, number>, category: Array<{ name: string; value: number }>, monthKey: string) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const top = [...category].sort((a, b) => b.value - a.value)[0];
    const monthRows = monthTransactionsByKey(state.transactions, monthKey);
    const income = stats.income ?? monthlyIncome(monthRows);
    const expense = stats.expense ?? monthlyExpenseWithFixedByKey(state, monthKey);
    const primaryGoal = state.goals[0];
    const projection = primaryGoal ? goalProjection(primaryGoal, state) : null;
    const deadlinePlan = primaryGoal ? goalDeadlinePlan(primaryGoal, state) : null;
    const categoryBreakdown = [...category]
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((item) => `${item.name}:${yen.format(item.value)}`)
      .join("、") || "支出カテゴリなし";
    const assetBreakdown = state.accounts
      .filter((account) => account.type !== "credit")
      .map((account) => `${account.name}:${yen.format(confirmedAccountBalance(account, state, monthKey))}`)
      .join("、") || "資産口座なし";
    const recentTrend = monthlyTrend(state, monthKey)
      .map((row) => `${row.label}:収入${yen.format(row.income)} 支出${yen.format(row.expense)} 収支${yen.format(row.income - row.expense)}`)
      .join("、");
    const prompt = buildFinancePrompt({
      monthLabel: formatMonthLabel(monthKey),
      income,
      expense,
      assets: stats.assets ?? totalAssets(state, monthKey),
      forecast: stats.forecast ?? projectedMonthEnd(state, monthKey),
      topCategory: top?.name ?? "なし",
      topCategoryAmount: top?.value ?? 0,
      savingRate: Math.max(Math.round(((income - expense) / Math.max(income, 1)) * 100), 0),
      averageSaving: averageMonthlySaving(state),
      creditPending: stats.credit ?? monthlyCreditWithdrawalsByKey(state, monthKey),
      fixedCost: stats.fixed ?? fixedCostForecast(state.fixedCosts, monthKey),
      monthlyBalance: income - expense,
      categoryBreakdown,
      assetBreakdown,
      recentTrend,
      goalSummary: primaryGoal && projection && deadlinePlan
        ? `${primaryGoal.name}: 不足${yen.format(projection.remaining)}、期限${primaryGoal.deadline}、必要月額${yen.format(deadlinePlan.requiredMonthly)}`
        : "目標未設定"
    });
    let cancelled = false;
    setLines([]);
    setLoading(true);
    analyzeFinance(prompt)
      .then((text) => {
        if (cancelled) return;
        const next = text.split("\n").map((line) => line.trim()).filter(Boolean);
        setLines(next);
      })
      .catch(() => {
        if (!cancelled) setLines([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.householdId, state.transactions.length, state.fixedCosts.length, state.goals.length, monthKey, stats.income, stats.expense, stats.assets, stats.forecast, stats.credit, stats.fixed, category.length]);

  return { lines, loading };
}

function useAnnualSavingsAi(state: LedgerState, monthKey: string) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const rows = monthlyTrend(state, monthKey).map((row) => `${row.label}: 収入${yen.format(row.income)} / 支出${yen.format(row.expense)} / 貯金${yen.format(row.saving)}`).join("\n");
    const prompt = buildAnnualSavingsPrompt({
      monthLabel: formatMonthLabel(monthKey),
      monthlyRows: rows || "月別データなし",
      averageSaving: averageMonthlySaving(state),
      currentAssets: totalAssets(state, monthKey)
    });
    let cancelled = false;
    setLines([]);
    setLoading(true);
    analyzeFinance(prompt)
      .then((text) => {
        if (cancelled) return;
        setLines(text.split("\n").map((line) => line.trim()).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setLines([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.householdId, state.transactions.length, state.fixedCosts.length, monthKey]);
  return { lines, loading };
}

function AiCommentary({ state, stats, category, monthKey, limit }: { state: LedgerState; stats: Record<string, number>; category: Array<{ name: string; value: number }>; monthKey: string; limit?: number }) {
  const { lines, loading } = useFinanceAi(state, stats, category, monthKey);
  return (
    <>
      {loading && <p>AIが分析中です...</p>}
      {lines.slice(0, limit).map((line) => <p key={line}>{line}</p>)}
    </>
  );
}

function AnnualSavingsAi({ state, monthKey }: { state: LedgerState; monthKey: string }) {
  const { lines, loading } = useAnnualSavingsAi(state, monthKey);
  return (
    <>
      {loading && <p>AIが年間貯金予測を作成中です...</p>}
      {lines.map((line) => <p key={line}>{line}</p>)}
    </>
  );
}

function AnalysisView({
  state,
  monthKey,
  stats
}: {
  state: LedgerState;
  monthKey: string;
  stats: Record<string, number>;
}) {
  const monthLabel = formatMonthLabel(monthKey);
  const category = categoryExpense(state, monthKey);
  const [drillParentId, setDrillParentId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const drillParent = state.categories.find((item) => item.id === drillParentId);
  const drillData = drillParent ? subcategoryExpense(state, drillParent.id, monthKey) : category;
  const totalCategoryExpense = category.reduce((sum, item) => sum + item.value, 0);
  const bars = [
    { name: "収入", value: stats.income, fill: "#16a34a" },
    { name: "支出", value: stats.expense, fill: "#dc2626" },
    { name: "貯金", value: Math.max(stats.income - stats.expense, 0), fill: "#0f766e" }
  ];
  const trend = monthlyTrend(state, monthKey);
  const savingAverage = averageMonthlySaving(state);
  const month = monthTransactionsByKey(state.transactions, monthKey);
  const income = monthlyIncomeWithFixedByKey(state, monthKey);
  const expense = monthlyExpenseWithFixedByKey(state, monthKey);
  const savingRate = Math.round((income - expense) / Math.max(income, 1) * 100);
  const topCategory = [...category].sort((a, b) => b.value - a.value)[0];
  const categoryTrend = expenseCategoryTrend(state, monthKey);
  const accountExpense = expenseByAccountKind(state, monthKey, "account");
  const paymentExpense = expenseByAccountKind(state, monthKey, "payment");
  const analysisStats = {
    assets: totalAssets(state, monthKey),
    expense,
    income,
    forecast: projectedMonthEnd(state, monthKey),
    fixed: fixedCostForecast(state.fixedCosts, monthKey),
    credit: monthlyCreditWithdrawalsByKey(state, monthKey)
  };
  return (
    <div className="view-stack">
      <section className="panel month-context">
        <div className="section-title"><h2>{monthLabel} の分析</h2><span>カレンダー選択月と連動</span></div>
        <div className="month-summary">
          <span>総資産 <strong>{yen.format(analysisStats.assets)}</strong></span>
          <span>支出 <strong>{yen.format(expense)}</strong></span>
          <span>収支 <strong>{yen.format(income - expense)}</strong></span>
        </div>
      </section>
      <section className="insight-grid">
        <div className="insight-card teal">
          <PiggyBank size={28} />
          <span>AI年間貯金予測</span>
          <AnnualSavingsAi state={state} monthKey={monthKey} />
          <strong>{yen.format(savingAverage * 12)}</strong>
          <div className="mini-bars">{[0.42, 0.52, 0.61, 0.72, 0.86, 1].map((height) => <i key={height} style={{ height: `${height * 34}px` }} />)}</div>
        </div>
        <div className="insight-card orange">
          <Goal size={30} />
          <span>AIが{monthLabel}の支出を分析</span>
          <AiCommentary state={state} stats={analysisStats} category={category} monthKey={monthKey} limit={1} />
          <strong>{Math.max(savingRate, 0)}%</strong>
          <div className="progress"><span style={{ width: `${Math.min(Math.max(savingRate, 0), 100)}%` }} /></div>
        </div>
        <div className="insight-card warn">
          <Sparkles size={30} />
          <span>{monthLabel}の支出トップ</span>
          <p>カテゴリー別の金額と割合を下の表で確認できます。</p>
          <strong>{topCategory ? `${topCategory.name} ${yen.format(topCategory.value)}` : "支出なし"}</strong>
        </div>
      </section>
      <section className="panel chart-panel">
        <div className="section-title"><h2>収支推移</h2><span>{monthLabel}までの6ヶ月</span></div>
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
        <div className="section-title"><h2>{drillParent ? `${drillParent.name}のサブカテゴリー` : "カテゴリー分析"}</h2><span>{drillParent ? "戻る" : monthLabel}</span></div>
        {drillParent && <button className="google-button" type="button" onClick={() => setDrillParentId(null)}>カテゴリー全体に戻る</button>}
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie data={drillData.length ? drillData : [{ name: "支出なし", value: 1, fill: "#d6d3d1" }]} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={4} onClick={(entry) => {
              const parent = state.categories.find((item) => item.name === entry.name && !item.parentId);
              if (parent) setDrillParentId(parent.id);
            }}>
              {(drillData.length ? drillData : [{ name: "支出なし", value: 1, fill: "#d6d3d1" }]).map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
            </Pie>
            <Tooltip formatter={(value) => yen.format(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
        <PieLegend data={drillData} total={drillData.reduce((sum, item) => sum + item.value, 0)} emptyLabel="支出なし" />
      </section>
      <section className="panel chart-panel">
        <div className="section-title"><h2>支出カテゴリごとの推移</h2><span>{monthLabel}までの6ヶ月</span></div>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={categoryTrend.rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5ded2" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip formatter={(value) => yen.format(Number(value))} />
            {categoryTrend.categories.map((categoryItem, index) => (
              <Line
                key={categoryItem.name}
                type="monotone"
                dataKey={categoryItem.name}
                name={categoryItem.name}
                stroke={categoryItem.fill || ["#0f766e", "#ea580c", "#2563eb", "#8b5cf6", "#dc2626", "#64748b"][index % 6]}
                strokeWidth={2.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <PieLegend data={categoryTrend.categories.map((item) => ({ name: item.name, value: item.total, fill: item.fill }))} total={categoryTrend.categories.reduce((sum, item) => sum + item.total, 0)} emptyLabel="支出なし" />
      </section>
      <div className="home-chart-grid">
        <section className="panel chart-panel">
          <div className="section-title"><h2>口座別支出</h2><span>{monthLabel}</span></div>
          <ResponsiveContainer width="100%" height={176}>
            <PieChart>
              <Pie data={accountExpense.length ? accountExpense : [{ name: "支出なし", value: 1, fill: "#d6d3d1" }]} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
                {(accountExpense.length ? accountExpense : [{ name: "支出なし", value: 1, fill: "#d6d3d1" }]).map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={(value) => yen.format(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
          <PieLegend data={accountExpense} total={accountExpense.reduce((sum, item) => sum + item.value, 0)} emptyLabel="支出なし" />
        </section>
        <section className="panel chart-panel">
          <div className="section-title"><h2>支払い方法別支出</h2><span>{monthLabel}</span></div>
          <ResponsiveContainer width="100%" height={176}>
            <PieChart>
              <Pie data={paymentExpense.length ? paymentExpense : [{ name: "カード支出なし", value: 1, fill: "#d6d3d1" }]} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3} onClick={(entry) => {
                if ("id" in entry && typeof entry.id === "string") setSelectedPaymentId(entry.id);
              }}>
                {(paymentExpense.length ? paymentExpense : [{ name: "カード支出なし", value: 1, fill: "#d6d3d1" }]).map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={(value) => yen.format(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
          <PieLegend data={paymentExpense} total={paymentExpense.reduce((sum, item) => sum + item.value, 0)} emptyLabel="カード支出なし" />
          {selectedPaymentId && <PaymentMethodBreakdown state={state} monthKey={monthKey} accountId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)} />}
        </section>
      </div>
      <section className="panel">
        <div className="section-title"><h2>カテゴリー別割合</h2><span>{monthLabel}</span></div>
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
        <div className="section-title"><h2>月別収支</h2><span>{monthLabel}</span></div>
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
    </div>
  );
}

function buildAiInsights(state: LedgerState, category: Array<{ name: string; value: number }>) {
  const current = monthTransactions(state.transactions);
  const income = monthlyIncome(current);
  const expense = monthlyExpenseWithFixed(state);
  const saving = income - expense;
  const top = [...category].sort((a, b) => b.value - a.value)[0];
  const insights = [
    `今月の収支は ${yen.format(saving)} です。${saving >= 0 ? "黒字なので、このペースなら残高を守れています。" : "赤字なので、まず大きい支出カテゴリから見直すのが近道です。"}`
  ];
  if (top) {
    const share = expense ? Math.round((top.value / expense) * 100) : 0;
    insights.push(`支出で一番大きいカテゴリは「${top.name}」で、今月支出の約${share}%です。ここを少し調整すると月末残高への影響が大きいです。`);
  }
  const credit = monthlyCreditWithdrawals(state);
  if (credit > 0) insights.push(`クレジットカードの未引落が ${yen.format(credit)} あります。引落月の残高に余裕があるか確認しておくと安心です。`);
  if (insights.length < 3) insights.push(spendingAdvice(state));
  return insights;
}

function PaymentMethodBreakdown({ state, monthKey, accountId, onClose }: { state: LedgerState; monthKey: string; accountId: string; onClose: () => void }) {
  const account = state.accounts.find((item) => item.id === accountId);
  const transactionRows = monthTransactionsByKey(state.transactions, monthKey)
    .filter((transaction) => transaction.type === "expense" && transaction.accountId === accountId)
    .map((transaction) => ({ type: "transaction" as const, id: transaction.id, date: transactionLedgerDate(transaction), name: transaction.memo || state.categories.find((category) => category.id === transaction.categoryId)?.name || "支出", amount: transaction.amount }));
  const fixedRows = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state)
    .filter((cost) => cost.kind === "expense" && cost.accountId === accountId)
    .map((cost) => ({ type: "fixed" as const, id: `${cost.id}-${cost.date}`, date: cost.date, name: cost.name, amount: cost.amount }));
  const rows = [...transactionRows, ...fixedRows].sort((a, b) => b.date.localeCompare(a.date));
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="inline-breakdown">
      <div className="section-title">
        <h3>{account?.name ?? "支払い方法"}の内訳</h3>
        <span>{yen.format(total)}</span>
      </div>
      {rows.length === 0 ? <p>この月の支出はありません。</p> : rows.map((row) => (
        <div className="breakdown-row" key={row.id}>
          <span><strong>{row.name}</strong><small>{row.date} / {row.type === "fixed" ? "固定費" : "支出"}</small></span>
          <em>{yen.format(row.amount)}</em>
        </div>
      ))}
      <button className="google-button" type="button" onClick={onClose}>閉じる</button>
    </div>
  );
}

function subcategoryExpense(state: LedgerState, parentId: string, monthKey: string) {
  const childIds = state.categories.filter((category) => category.parentId === parentId).map((category) => category.id);
  return state.categories
    .filter((category) => childIds.includes(category.id))
    .map((category) => ({
      name: category.name,
      value: monthTransactionsByKey(state.transactions, monthKey)
        .filter((transaction) => transaction.type === "expense" && transaction.categoryId === category.id)
        .reduce((sum, transaction) => sum + transaction.amount, 0) +
        fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state)
          .filter((cost) => cost.kind === "expense" && cost.categoryId === category.id)
          .reduce((sum, cost) => sum + cost.amount, 0),
      fill: category.color
    }))
    .filter((item) => item.value > 0);
}

function expenseByAccountKind(state: LedgerState, monthKey: string, mode: "account" | "payment") {
  const creditMode = mode === "payment";
  return state.accounts
    .filter((account) => creditMode ? account.type === "credit" : account.type !== "credit")
    .map((account) => {
      const transactionValue = monthTransactionsByKey(state.transactions, monthKey)
        .filter((transaction) => transaction.type === "expense" && transaction.accountId === account.id)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const fixedValue = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state)
        .filter((cost) => cost.kind === "expense" && cost.accountId === account.id)
        .reduce((sum, cost) => sum + cost.amount, 0);
      return { id: account.id, name: account.name, value: transactionValue + fixedValue, fill: account.color };
    })
    .filter((item) => item.value > 0);
}

function expenseCategoryTrend(state: LedgerState, endMonthKey: string) {
  const now = new Date(Number(endMonthKey.slice(0, 4)), Number(endMonthKey.slice(5, 7)) - 1, 1);
  const parents = state.categories.filter((category) => !category.parentId && category.kind === "expense");
  const monthKeys = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: `${date.getMonth() + 1}月`
    };
  });
  const categories = parents
    .map((parent) => {
      const childIds = state.categories.filter((category) => category.parentId === parent.id).map((category) => category.id);
      const ids = new Set([parent.id, ...childIds]);
      const total = monthKeys.reduce((sum, month) => sum + expenseForCategoryIds(state, month.key, ids), 0);
      return { id: parent.id, name: parent.name, fill: parent.color, total, ids };
    })
    .filter((category) => category.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const rows = monthKeys.map((month) => {
    const row: Record<string, string | number> = { label: month.label };
    categories.forEach((category) => {
      row[category.name] = expenseForCategoryIds(state, month.key, category.ids);
    });
    return row;
  });
  return { rows, categories };
}

function expenseForCategoryIds(state: LedgerState, monthKey: string, categoryIds: Set<string>) {
  return monthTransactionsByKey(state.transactions, monthKey)
    .filter((transaction) => transaction.type === "expense" && transaction.categoryId && categoryIds.has(transaction.categoryId))
    .reduce((sum, transaction) => sum + transaction.amount, 0) +
    fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state)
      .filter((cost) => cost.kind === "expense" && categoryIds.has(cost.categoryId))
      .reduce((sum, cost) => sum + cost.amount, 0);
}

function categoryUsageTrend(state: LedgerState, endMonthKey: string, categoryId: string) {
  const parent = state.categories.find((item) => item.id === categoryId);
  const children = state.categories.filter((item) => item.parentId === categoryId);
  const now = new Date(Number(endMonthKey.slice(0, 4)), Number(endMonthKey.slice(5, 7)) - 1, 1);
  return Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const rows = monthTransactionsByKey(state.transactions, key).filter((transaction) => transaction.type === "expense");
    const fixedRows = fixedCostOccurrencesForMonth(state.fixedCosts, key, state).filter((cost) => cost.kind === "expense");
    const ids = new Set([categoryId, ...children.map((child) => child.id)]);
    const total = rows.filter((transaction) => transaction.categoryId && ids.has(transaction.categoryId)).reduce((sum, transaction) => sum + transaction.amount, 0) +
      fixedRows.filter((cost) => ids.has(cost.categoryId)).reduce((sum, cost) => sum + cost.amount, 0);
    const childValues = Object.fromEntries(children.slice(0, 4).map((child) => [
      child.name,
      rows.filter((transaction) => transaction.categoryId === child.id).reduce((sum, transaction) => sum + transaction.amount, 0) +
      fixedRows.filter((cost) => cost.categoryId === child.id).reduce((sum, cost) => sum + cost.amount, 0)
    ]));
    return { label: `${date.getMonth() + 1}月`, total: parent ? total : 0, ...childValues };
  });
}

function monthlyTrend(state: LedgerState, endMonthKey: string) {
  const now = new Date(Number(endMonthKey.slice(0, 4)), Number(endMonthKey.slice(5, 7)) - 1, 1);
  return Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const rows = state.transactions.filter((transaction) => transactionLedgerDate(transaction).startsWith(key));
    const income = monthlyIncome(rows);
    const fixedRows = fixedCostOccurrencesForMonth(state.fixedCosts, key, state);
    const fixedIncome = fixedRows.filter((cost) => cost.kind === "income").reduce((sum, cost) => sum + cost.amount, 0);
    const expense = monthlyExpense(rows) + fixedRows.filter((cost) => cost.kind === "expense").reduce((sum, cost) => sum + cost.amount, 0);
    return { label: `${date.getMonth() + 1}月`, income: income + fixedIncome, expense, saving: income + fixedIncome - expense };
  });
}

function PieLegend({ data, total, emptyLabel }: { data: Array<{ name: string; value: number; fill?: string }>; total: number; emptyLabel: string }) {
  const rows = data.length ? data : [{ name: emptyLabel, value: 0, fill: "#d6d3d1" }];
  return (
    <div className="pie-legend">
      {rows.slice(0, 6).map((item) => {
        const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <div key={item.name}>
            <span><i style={{ background: item.fill ?? "#0f766e" }} />{item.name}</span>
            <strong>{yen.format(item.value)}</strong>
            <em>{percent}%</em>
          </div>
        );
      })}
    </div>
  );
}

function goalAdvice(goal: LedgerState["goals"][number], state: LedgerState) {
  const projection = goalProjection(goal, state);
  const top = [...categoryExpense(state)].sort((a, b) => b.value - a.value)[0];
  const deadlinePlan = goalDeadlinePlan(goal, state);
  if (projection.months === 0) return "すでに達成圏内です。次の目標を作ると資産形成を続けやすくなります。";
  if (deadlinePlan.months <= 0) return "期限が過ぎています。期限を見直すか、目標金額を再設定すると現実的な計画に戻せます。";
  if (deadlinePlan.gap <= 0) return `期限までに必要な貯金は月${yen.format(deadlinePlan.requiredMonthly)}です。現在の平均ペースなら期限内に届く見込みです。`;
  if (!top) return `期限までに月${yen.format(deadlinePlan.gap)}ほど上乗せが必要です。支出データが増えると、削減候補を具体的に提案できます。`;
  const possibleCut = Math.min(top.value, Math.ceil(deadlinePlan.gap / 1000) * 1000);
  return `期限までに月${yen.format(deadlinePlan.requiredMonthly)}必要です。現在の平均貯金との差は月${yen.format(deadlinePlan.gap)}なので、まず「${top.name}」を月${yen.format(possibleCut)}見直すと達成期限に近づきます。`;
}

function goalDeadlinePlan(goal: LedgerState["goals"][number], state: LedgerState) {
  const projection = goalProjection(goal, state);
  const deadline = new Date(`${goal.deadline}T00:00:00`);
  const now = new Date();
  const months = Math.max((deadline.getFullYear() - now.getFullYear()) * 12 + deadline.getMonth() - now.getMonth() + 1, 0);
  const requiredMonthly = months > 0 ? Math.ceil(projection.remaining / months) : projection.remaining;
  const averageSaving = averageMonthlySaving(state);
  return {
    months,
    requiredMonthly,
    averageSaving,
    gap: Math.max(requiredMonthly - averageSaving, 0)
  };
}

function InvestmentsView({ state, monthKey, setNotice, reload }: { state: LedgerState; monthKey: string; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const investmentAccounts = state.investmentAccounts ?? [];
  const investmentRecords = state.investmentRecords ?? [];
  const [selectedId, setSelectedId] = useState(investmentAccounts[0]?.id ?? "");
  const selected = investmentAccounts.find((account) => account.id === selectedId) ?? investmentAccounts[0];
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountDraft, setAccountDraft] = useState({ name: "証券口座", initialAmount: 0, monthlyContribution: 100000, targetMonthlyRate: 1, annualTargetAmount: 0, color: "#0f766e" });
  const existingRecord = selected ? investmentRecords.find((record) => record.investmentAccountId === selected.id && record.month === monthKey) : undefined;
  const [recordDraft, setRecordDraft] = useState({ monthEndValue: existingRecord?.monthEndValue ?? 0, additionalInvestment: existingRecord?.additionalInvestment ?? 0, note: existingRecord?.note ?? "" });
  useEffect(() => {
    setRecordDraft({ monthEndValue: existingRecord?.monthEndValue ?? 0, additionalInvestment: existingRecord?.additionalInvestment ?? 0, note: existingRecord?.note ?? "" });
  }, [selected?.id, monthKey, existingRecord?.id]);
  const summary = selected ? investmentSummary(state, selected.id, monthKey) : null;
  const rows = selected ? investmentRows(state, selected.id, monthKey) : [];
  const totalInvestments = investmentAssets(state, monthKey);

  async function saveAccount() {
    try {
      await createInvestmentAccount(state.householdId ?? "", accountDraft);
      await reload();
      setShowAccountForm(false);
      setNotice("投資口座を追加しました。");
    } catch (error) {
      setNotice(toJapaneseError(error, "投資口座の追加に失敗しました。"));
    }
  }

  async function saveRecord() {
    if (!selected) return;
    try {
      await upsertInvestmentRecord(state.householdId ?? "", {
        investmentAccountId: selected.id,
        month: monthKey,
        monthEndValue: recordDraft.monthEndValue,
        additionalInvestment: recordDraft.additionalInvestment,
        note: recordDraft.note
      });
      await reload();
      setNotice(`${formatMonthLabel(monthKey)}の投資実績を保存しました。`);
    } catch (error) {
      setNotice(toJapaneseError(error, "投資実績の保存に失敗しました。"));
    }
  }

  return (
    <div className="view-stack">
      <section className="panel investment-hero">
        <div className="section-title">
          <h2>投資管理</h2>
          <span>{formatMonthLabel(monthKey)}</span>
        </div>
        <div className="month-summary">
          <span>投資評価額 <strong>{yen.format(totalInvestments)}</strong></span>
          <span>月間損益 <strong>{yen.format(summary?.profit ?? 0)}</strong></span>
          <span>目標達成率 <strong>{Math.round(summary?.achievementRate ?? 0)}%</strong></span>
        </div>
      </section>

      <section className="panel">
        <div className="section-title"><h2>証券口座</h2><button className="mini-button" type="button" onClick={() => setShowAccountForm(!showAccountForm)}>{showAccountForm ? "閉じる" : "追加"}</button></div>
        {showAccountForm && (
          <div className="crud-form compact-form">
            <label>口座名<input value={accountDraft.name} onChange={(event) => setAccountDraft({ ...accountDraft, name: event.target.value })} /></label>
            <label>開始評価額<input type="number" value={numberInputValue(accountDraft.initialAmount)} onChange={(event) => setAccountDraft({ ...accountDraft, initialAmount: Number(event.target.value || 0) })} /></label>
            <label>毎月積立額<input type="number" value={numberInputValue(accountDraft.monthlyContribution)} onChange={(event) => setAccountDraft({ ...accountDraft, monthlyContribution: Number(event.target.value || 0) })} /></label>
            <label>目標月利(%)<input type="number" step="0.01" value={accountDraft.targetMonthlyRate} onChange={(event) => setAccountDraft({ ...accountDraft, targetMonthlyRate: Number(event.target.value || 0) })} /></label>
            <label>年間目標額<input type="number" value={numberInputValue(accountDraft.annualTargetAmount)} onChange={(event) => setAccountDraft({ ...accountDraft, annualTargetAmount: Number(event.target.value || 0) })} /></label>
            <label>色<input type="color" value={accountDraft.color} onChange={(event) => setAccountDraft({ ...accountDraft, color: event.target.value })} /></label>
            <button className="full-primary" type="button" onClick={saveAccount}>投資口座を追加</button>
          </div>
        )}
        {investmentAccounts.length === 0 ? (
          <div className="empty-state"><span>投資口座を追加すると、月次の評価額と損益を管理できます。</span></div>
        ) : (
          <div className="ledger-switch compact-switch">
            {investmentAccounts.map((account) => (
              <button className={selected?.id === account.id ? "active" : ""} key={account.id} type="button" onClick={() => setSelectedId(account.id)}>
                <span>{yen.format(latestInvestmentValue(state, account.id, monthKey))}</span>
                {account.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <>
          <section className="panel chart-panel">
            <div className="section-title"><h2>{selected.name}の推移</h2><span>予想と実績</span></div>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ded2" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip formatter={(value) => yen.format(Number(value))} />
                <Line type="monotone" dataKey="targetValue" name="予想資産" stroke="#2563eb" strokeWidth={2.5} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="monthEndValue" name="月末評価額" stroke={selected.color} strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="panel">
            <div className="section-title"><h2>{formatMonthLabel(monthKey)}の入力</h2><span>単月追加投資もここで入力</span></div>
            <div className="crud-form compact-form">
              <label>月末評価額<input type="number" value={numberInputValue(recordDraft.monthEndValue)} onChange={(event) => setRecordDraft({ ...recordDraft, monthEndValue: Number(event.target.value || 0) })} /></label>
              <label>追加投資額<input type="number" value={numberInputValue(recordDraft.additionalInvestment)} onChange={(event) => setRecordDraft({ ...recordDraft, additionalInvestment: Number(event.target.value || 0) })} /></label>
              <label>備考<input value={recordDraft.note} onChange={(event) => setRecordDraft({ ...recordDraft, note: event.target.value })} placeholder="例: S&P500追加購入" /></label>
              <button className="full-primary" type="button" onClick={saveRecord}>月次実績を保存</button>
              {existingRecord && <button className="google-button" type="button" onClick={async () => { try { await deleteInvestmentRecord(existingRecord.id); await reload(); setNotice("投資実績を削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "投資実績の削除に失敗しました。")); } }}>この月の実績を削除</button>}
            </div>
          </section>

          <section className="panel">
            <div className="section-title"><h2>月次成績</h2><span>{rows.length}ヶ月</span></div>
            <div className="investment-table">
              <div><strong>月</strong><strong>予想</strong><strong>評価額</strong><strong>月利</strong><strong>純利益</strong><strong>追加投資</strong><strong>達成率</strong></div>
              {rows.map((row) => (
                <div key={row.month}>
                  <span>{row.label}</span>
                  <span>{yen.format(row.targetValue)}</span>
                  <span>{yen.format(row.monthEndValue)}</span>
                  <span className={row.monthlyReturnRate >= 0 ? "positive" : "negative"}>{row.monthlyReturnRate.toFixed(2)}%</span>
                  <span className={row.profit >= 0 ? "positive" : "negative"}>{yen.format(row.profit)}</span>
                  <span>{yen.format(row.additionalInvestment)}</span>
                  <span>{Math.round(row.achievementRate)}%</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function latestInvestmentValue(state: LedgerState, accountId: string, monthKey: string) {
  const account = (state.investmentAccounts ?? []).find((item) => item.id === accountId);
  const latest = (state.investmentRecords ?? []).filter((record) => record.investmentAccountId === accountId && record.month <= monthKey).sort((a, b) => b.month.localeCompare(a.month))[0];
  return latest?.monthEndValue ?? account?.initialAmount ?? 0;
}

function investmentSummary(state: LedgerState, accountId: string, monthKey: string) {
  return investmentRows(state, accountId, monthKey).find((row) => row.month === monthKey);
}

function investmentRows(state: LedgerState, accountId: string, endMonthKey: string) {
  const account = (state.investmentAccounts ?? []).find((item) => item.id === accountId);
  if (!account) return [];
  const records = (state.investmentRecords ?? []).filter((record) => record.investmentAccountId === accountId);
  const months = new Set<string>();
  records.forEach((record) => {
    if (record.month <= endMonthKey) months.add(record.month);
  });
  months.add(endMonthKey);
  const sortedMonths = Array.from(months).sort();
  let previousActual = account.initialAmount;
  let previousTarget = account.initialAmount;
  return sortedMonths.map((month) => {
    const record = records.find((item) => item.month === month);
    const additionalInvestment = record?.additionalInvestment ?? 0;
    const contribution = account.monthlyContribution + additionalInvestment;
    const targetValue = Math.round(previousTarget * (1 + account.targetMonthlyRate / 100) + contribution);
    const monthEndValue = record?.monthEndValue ?? targetValue;
    const assetDelta = monthEndValue - previousActual;
    const profit = monthEndValue - previousActual - contribution;
    const monthlyReturnRate = previousActual + contribution > 0 ? (profit / (previousActual + contribution)) * 100 : 0;
    const achievementRate = targetValue > 0 ? (monthEndValue / targetValue) * 100 : 0;
    previousActual = monthEndValue;
    previousTarget = targetValue;
    return {
      month,
      label: `${Number(month.slice(5, 7))}月`,
      targetValue,
      monthEndValue,
      additionalInvestment,
      assetDelta,
      profit,
      monthlyReturnRate,
      achievementRate,
      note: record?.note ?? ""
    };
  });
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
      <div><span>{transaction.reflectedDate ? "使用日" : "日付"}</span><strong>{transaction.date}</strong></div>
      {transaction.reflectedDate && <div><span>引落日</span><strong>{transaction.reflectedDate}</strong></div>}
      <div><span>メモ</span><strong>{transaction.memo || "なし"}</strong></div>
    </div>
  );
}

function GoalsView({ state, monthKey, setNotice, reload }: { state: LedgerState; monthKey: string; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const firstAccountId = state.accounts.find((account) => account.type === "saving")?.id ?? state.accounts[0]?.id ?? "";
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", targetAmount: 1000000, accountId: firstAccountId, deadline: `${new Date().getFullYear() + 2}-12-31`, monthlyBoost: 0 });
  const primaryGoal = state.goals[0];
  const primaryProjection = primaryGoal ? goalProjection(primaryGoal, state) : null;
  const primaryDeadlinePlan = primaryGoal ? goalDeadlinePlan(primaryGoal, state) : null;
  const savingAverage = averageMonthlySaving(state);
  const topCategory = [...categoryExpense(state)].sort((a, b) => b.value - a.value)[0];
  const suggestedCut = primaryDeadlinePlan && topCategory ? Math.min(topCategory.value, Math.ceil(primaryDeadlinePlan.gap / 1000) * 1000) : 0;
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
          <span>AI年間貯金予測</span>
          <AnnualSavingsAi state={state} monthKey={monthKey} />
          <strong>{yen.format(savingAverage * 12)}</strong>
          <div className="mini-bars">{[0.38, 0.48, 0.58, 0.72, 0.86, 1].map((height) => <i key={height} style={{ height: `${height * 34}px` }} />)}</div>
        </div>
        <div className="insight-card orange">
          <Goal size={32} />
          <span>目標達成をAIがサポート</span>
          <p>{primaryGoal ? `期限は${primaryGoal.deadline}です。必要な月貯金は${yen.format(primaryDeadlinePlan?.requiredMonthly ?? 0)}、現在ペースでは${primaryProjection?.projectedDate}ごろ達成見込みです。` : "目標を設定すると、期限から逆算して必要な貯金額を自動判定します。"}</p>
          <strong>{primaryProjection ? `${Math.round(primaryProjection.progress)}%` : "未設定"}</strong>
          <div className="progress"><span style={{ width: `${primaryProjection ? primaryProjection.progress : 0}%` }} /></div>
        </div>
        <div className="insight-card warn">
          <Sparkles size={32} />
          <span>達成が難しい場合はアドバイス</span>
          <p>{primaryDeadlinePlan?.gap ? `${topCategory?.name ?? "支出"}を中心に月${yen.format(suggestedCut || primaryDeadlinePlan.gap)}改善すると、期限達成に近づきます。` : "現在の平均貯金ペースなら期限内に届く見込みです。"}</p>
          <strong>{primaryDeadlinePlan?.gap ? `不足 ${yen.format(primaryDeadlinePlan.gap)}/月` : "順調"}</strong>
        </div>
      </section>
      <section className="panel">
        <div className="section-title"><h2>目標貯金</h2><span>1つの目標を集中管理</span></div>
        {!primaryGoal && <button className="full-primary" type="button" onClick={() => { setShowForm(!showForm); setEditingId(null); }}>目標を設定する</button>}
        {showForm && (
          <GoalEditForm draft={draft} setDraft={setDraft} state={state} onSave={() => saveGoal()} onCancel={() => setShowForm(false)} />
        )}
      </section>
      {state.goals.slice(0, 1).map((goal) => {
        const projection = goalProjection(goal, state);
        const deadlinePlan = goalDeadlinePlan(goal, state);
        const isEditing = editingId === goal.id;
        return (
          <section className="panel goal-panel" key={goal.id}>
            <div className="section-title"><h2>{goal.name}</h2><span>期限 {goal.deadline}</span></div>
            {isEditing ? (
              <GoalEditForm draft={draft} setDraft={setDraft} state={state} onSave={() => saveGoal(goal.id)} onCancel={() => setEditingId(null)} onDelete={async () => { await deleteGoal(goal.id); await reload(); setEditingId(null); setNotice("目標を削除しました。"); }} />
            ) : (
            <>
            <div className="progress"><span style={{ width: `${projection.progress}%` }} /></div>
            <div className="goal-numbers">
              <strong>{Math.round(projection.progress)}%</strong>
              <span>不足 {yen.format(projection.remaining)} / 必要 {yen.format(deadlinePlan.requiredMonthly)}/月</span>
            </div>
            <section className="advice goal-advice"><Sparkles size={18} /><p>{goalAdvice(goal, state)}</p></section>
            <div className="goal-auto">
              <span>過去実績から見た月平均貯金 / 期限まで</span>
              <strong>{yen.format(averageMonthlySaving(state))}</strong>
              <span>{deadlinePlan.months}ヶ月</span>
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
      <label>目標金額<input type="number" value={numberInputValue(draft.targetAmount)} onChange={(event) => setDraft({ ...draft, targetAmount: Number(event.target.value || 0) })} /></label>
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
  const [joinDebug, setJoinDebug] = useState<string | null>(null);
  const [selectedLedgerId, setSelectedLedgerId] = useState(state.householdId ?? "");
  const [ledgerModalId, setLedgerModalId] = useState<string | null>(null);
  const [ledgerNameDraft, setLedgerNameDraft] = useState("");
  const [confirmDeleteLedger, setConfirmDeleteLedger] = useState(false);
  const [sharedMembers, setSharedMembers] = useState<HouseholdMember[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [openingBalances, setOpeningBalances] = useState<Record<string, { amount: number; date: string }>>(
    Object.fromEntries(state.accounts.filter((account) => account.type !== "credit").map((account) => [account.id, { amount: account.openingBalance, date: account.openingBalanceDate ?? todayIso() }]))
  );
  const [settingsTab, setSettingsTab] = useState<"ledger" | "accounts" | "snapshots" | "categories" | "fixed">("ledger");
  const firstBankAccountId = state.accounts.find((account) => account.type === "bank")?.id ?? state.accounts.find((account) => account.type !== "credit")?.id ?? "";
  const firstParentCategoryId = state.categories.find((category) => !category.parentId)?.id ?? "";
  const firstExpenseCategoryId = state.categories.find((category) => category.kind === "expense" && !category.parentId)?.id ?? state.categories.find((category) => category.kind === "expense")?.id ?? "";
  const firstIncomeCategoryId = state.categories.find((category) => category.kind === "income" && !category.parentId)?.id ?? state.categories.find((category) => category.kind === "income")?.id ?? "";
  const [newAccount, setNewAccount] = useState({ name: "", type: "bank" as AccountType, openingBalance: 0, openingBalanceDate: todayIso(), color: accountColorForType("bank"), closingDay: 25, withdrawalDay: 10, withdrawalAccountId: firstBankAccountId });
  const [categoryDraft, setCategoryDraft] = useState({ level: "main" as "main" | "sub", name: "", color: "#0f766e", kind: "expense" as "expense" | "income", parentId: firstParentCategoryId });
  const [newFixed, setNewFixed] = useState({ name: "", kind: "expense" as TransactionType, categoryId: firstExpenseCategoryId, accountId: firstBankAccountId, transferToAccountId: "", amount: 0, variable: false, dueDay: 1, status: "planned" as const, effectiveFrom: todayIso().slice(0, 7) + "-01" });
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showOpeningBalances, setShowOpeningBalances] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showFixedForm, setShowFixedForm] = useState(false);
  const [categoryModalId, setCategoryModalId] = useState<string | null>(null);
  const selectedLedger = (state.households ?? []).find((household) => household.id === selectedLedgerId);
  const modalLedger = (state.households ?? []).find((household) => household.id === ledgerModalId);
  const modalCategory = state.categories.find((category) => category.id === categoryModalId);
  const personalLedgerId = (state.households ?? []).find((household) => household.spaceType === "personal")?.id ?? state.householdId ?? "";

  useEffect(() => {
    if (!modalLedger) {
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
  }, [modalLedger?.id, setNotice]);

  useEffect(() => {
    if (modalLedger) setLedgerNameDraft(modalLedger.name);
    setConfirmDeleteLedger(false);
  }, [modalLedger?.id, modalLedger?.name]);

  return (
    <div className="view-stack">
      <div className="settings-tabs">
        {[
          ["ledger", "家計簿"],
          ["accounts", "口座"],
          ["snapshots", "月末資産"],
          ["categories", "カテゴリ"],
          ["fixed", "定期項目"]
        ].map(([id, label]) => (
          <button className={settingsTab === id ? "active" : ""} key={id} type="button" onClick={() => setSettingsTab(id as typeof settingsTab)}>{label}</button>
        ))}
      </div>
      <section className="settings-guide">
        <strong>{settingsTab === "ledger" ? "家計簿の作成・参加・共有メンバー" : settingsTab === "accounts" ? "口座・支払い方法・初期残高" : settingsTab === "snapshots" ? "月末資産の確定と再変更" : settingsTab === "categories" ? "収入・支出カテゴリとサブカテゴリー" : "毎月発生する支払い・収入"}</strong>
        <span>上のメニューから編集したい項目を選んでください。</span>
      </section>
      {settingsTab === "ledger" && (
      <>
      <section className="panel">
        <div className="section-title"><h2>家計簿管理</h2><span>{state.householdName ?? (state.activeSpace === "personal" ? "個人" : "共有")}</span></div>
        <div className="ledger-list">
          {(state.households ?? []).map((household) => (
            <button
              className={household.id === state.householdId ? "selected-ledger" : ""}
              key={household.id}
              type="button"
              onClick={() => {
                setLedgerModalId(household.id);
              }}
            >
              <span>{household.name}</span>
              <em>{household.spaceType === "personal" ? "個人" : "共有"} / {household.memberRole === "owner" ? "所有者" : "メンバー"}{household.id === state.householdId ? " / 表示中" : ""}</em>
            </button>
          ))}
        </div>
        {modalLedger && (
          <div className="sheet-backdrop center-backdrop" onClick={() => setLedgerModalId(null)}>
            <div className="ledger-detail" onClick={(event) => event.stopPropagation()}>
              <button className="modal-close" type="button" onClick={() => setLedgerModalId(null)}>閉じる</button>
              <div>
                <span>家計簿名</span>
                <strong>{modalLedger.name}</strong>
                <em>{modalLedger.spaceType === "personal" ? "個人家計簿" : "共有家計簿"} / {modalLedger.memberRole === "owner" ? "所有者" : "メンバー"}</em>
              </div>
            <>
                <div className="ledger-info-grid">
                  <div><span>家計簿ID</span><strong>{modalLedger.id}</strong></div>
                  <div><span>表示中</span><strong>{modalLedger.id === state.householdId ? "はい" : "いいえ"}</strong></div>
                </div>
                {modalLedger.memberRole === "owner" && modalLedger.spaceType === "shared" && (
                  <div className="rename-box">
                    <label>家計簿名<input value={ledgerNameDraft} onChange={(event) => setLedgerNameDraft(event.target.value)} /></label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (!ledgerNameDraft.trim()) {
                            setNotice("家計簿名を入力してください。");
                            return;
                          }
                          await renameSharedLedger(modalLedger.id, ledgerNameDraft);
                          await reloadHousehold(state.householdId ?? modalLedger.id);
                          setNotice("家計簿名を変更しました。");
                        } catch (error) {
                          setNotice(toJapaneseError(error, "家計簿名の変更に失敗しました。"));
                        }
                      }}
                    >
                      名前を保存
                    </button>
                  </div>
                )}
                {modalLedger.spaceType === "shared" && modalLedger.inviteCode && (
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
                  <div className="delete-confirm-box">
                    {!confirmDeleteLedger ? (
                      <button className="danger-button" type="button" onClick={() => setConfirmDeleteLedger(true)}>家計簿を削除</button>
                    ) : (
                      <>
                        <p>この家計簿を削除します。取引・口座・固定費・目標も見えなくなります。</p>
                        <div>
                          <button
                            className="danger-button"
                            type="button"
                            onClick={async () => {
                              try {
                                if (modalLedger.spaceType === "shared") {
                                  await deleteSharedLedger(modalLedger.id);
                                } else {
                                  await deleteOwnedLedger(modalLedger.id);
                                }
                                const nextLedgerId = (state.households ?? []).find((item) => item.id !== modalLedger.id)?.id ?? personalLedgerId;
                                await reloadHousehold(nextLedgerId);
                                setSelectedLedgerId(nextLedgerId);
                                setLedgerModalId(null);
                                setNotice("家計簿を削除しました。");
                              } catch (error) {
                                setNotice(toJapaneseError(error, "家計簿の削除に失敗しました。"));
                              }
                            }}
                          >
                            削除する
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteLedger(false)}>キャンセル</button>
                        </div>
                      </>
                    )}
                  </div>
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
            </div>
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
          {joinDebug && <div className="debug-box">{joinDebug}</div>}
          <button
            className="google-button"
            type="button"
            onClick={async () => {
              const normalizedCode = normalizeInviteCode(inviteCode);
              if (!inviteCode.trim()) {
                setNotice("共有IDを入力してください。");
                setJoinDebug(null);
                return;
              }
              try {
                setJoinDebug(`参加確認中: 入力=${inviteCode} / 判定ID=${normalizedCode}`);
                const householdId = await joinSharedLedger(inviteCode);
                await reloadHousehold(householdId);
                setInviteCode("");
                setJoinDebug(null);
                setNotice("共有家計簿に参加しました。");
              } catch (error) {
                console.error("共有家計簿参加エラー", error);
                const raw = extractErrorText(error, "詳細を取得できませんでした。");
                const message = toJapaneseError(error, "共有家計簿への参加に失敗しました。共有ID、ログイン状態、最新のschema.sqlが反映済みか確認してください。");
                setJoinDebug(`原因確認: 入力=${inviteCode} / 判定ID=${normalizedCode || "空"} / 詳細=${raw || message}`);
                setNotice(message);
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
        <div className="section-title with-action">
          <div><h2>口座・支払い方法</h2><span>{state.mode === "balance" ? "残高管理あり" : "収支のみ"}</span></div>
          <button type="button" onClick={() => setShowAccountForm(!showAccountForm)}>{showAccountForm ? "閉じる" : "追加する"}</button>
        </div>
        <p className="setting-copy">銀行口座・現金・貯金口座は「口座」、クレジットカードは「支払い方法」として分けて管理します。</p>
        {showAccountForm && <div className="crud-form">
          <label>口座名<input placeholder="例: 生活口座 / 楽天カード" value={newAccount.name} onChange={(event) => setNewAccount({ ...newAccount, name: event.target.value })} /></label>
          <label>種類<select value={newAccount.type} onChange={(event) => {
            const nextType = event.target.value as AccountType;
            setNewAccount({ ...newAccount, type: nextType, color: accountColorForType(nextType) });
          }}>
            <option value="bank">銀行口座</option><option value="cash">現金</option><option value="saving">貯金口座</option><option value="credit">クレジットカード</option>
          </select></label>
          <label>表示色<input type="color" value={newAccount.color} onChange={(event) => setNewAccount({ ...newAccount, color: event.target.value })} /></label>
          {newAccount.type !== "credit" && (
            <>
              <label>初期残高<input type="number" min="0" value={numberInputValue(newAccount.openingBalance)} onChange={(event) => setNewAccount({ ...newAccount, openingBalance: Number(event.target.value || 0) })} /></label>
              <label>初期残高の日付<input type="date" value={newAccount.openingBalanceDate} onChange={(event) => setNewAccount({ ...newAccount, openingBalanceDate: event.target.value })} /></label>
            </>
          )}
          {newAccount.type === "credit" && (
            <>
              <label>締め日<input type="number" min="1" max="31" value={numberInputValue(newAccount.closingDay)} onChange={(event) => setNewAccount({ ...newAccount, closingDay: Number(event.target.value || 0) })} /></label>
              <label>引落日<input type="number" min="1" max="31" value={numberInputValue(newAccount.withdrawalDay)} onChange={(event) => setNewAccount({ ...newAccount, withdrawalDay: Number(event.target.value || 0) })} /></label>
              <label>引落口座<select value={newAccount.withdrawalAccountId} onChange={(event) => setNewAccount({ ...newAccount, withdrawalAccountId: event.target.value })}><option value="">選択してください</option>{state.accounts.filter((account) => account.type !== "credit").map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
              <p className="setting-copy">このカードで支出登録すると、残高反映日が自動で次回引落日に設定され、未確定のクレカ支出として月末予測に反映されます。</p>
            </>
          )}
          <button className="full-primary" type="button" onClick={async () => {
            try {
              if (newAccount.type === "credit" && !newAccount.withdrawalAccountId) {
                setNotice("引落口座を選択してください。");
                return;
              }
              await createAccount(state.householdId ?? "", { ...newAccount, openingBalance: newAccount.type === "credit" ? 0 : newAccount.openingBalance });
              await reloadHousehold(state.householdId ?? "");
              setNewAccount({ name: "", type: "bank", openingBalance: 0, openingBalanceDate: todayIso(), color: accountColorForType("bank"), closingDay: 25, withdrawalDay: 10, withdrawalAccountId: firstBankAccountId });
              setShowAccountForm(false);
              setNotice("口座を追加しました。");
            } catch (error) { setNotice(toJapaneseError(error, "口座追加に失敗しました。")); }
          }}>口座を追加</button>
        </div>}
        <EditableAccountList state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />
      </section>
      <section className="panel">
        <div className="section-title"><h2>初期残高</h2><span>口座残高の基準</span></div>
        <p className="setting-copy">初回登録時の残高です。普段の月末残高調整は「月末資産」から行うのがおすすめです。</p>
        <button className="google-button" type="button" onClick={() => setShowOpeningBalances(!showOpeningBalances)}>{showOpeningBalances ? "初期残高を閉じる" : "初期残高を開く"}</button>
        {showOpeningBalances && <div className="opening-list">
          {state.accounts.filter((account) => account.type !== "credit").map((account) => (
            <label key={account.id}>{account.name}
              <input
                type="number"
                min="0"
                value={numberInputValue(openingBalances[account.id]?.amount ?? account.openingBalance)}
                onChange={(event) => setOpeningBalances({ ...openingBalances, [account.id]: { ...(openingBalances[account.id] ?? { date: todayIso() }), amount: Number(event.target.value || 0) } })}
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
        </div>}
      </section>
      </>
      )}
      {settingsTab === "snapshots" && (
        <AssetSnapshotSettings state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />
      )}
      {settingsTab === "categories" && (
      <section className="panel">
        <div className="section-title"><h2>カテゴリ管理</h2><span>カテゴリーとサブカテゴリー</span></div>
        <p className="setting-copy">カテゴリーは「食費」「住居」など大きな分類です。サブカテゴリーは「スーパー」「外食」などカテゴリー内の細かい分類です。</p>
        <button className="full-primary" type="button" onClick={() => setShowCategoryForm(!showCategoryForm)}>{showCategoryForm ? "追加を閉じる" : "カテゴリを追加する"}</button>
        {showCategoryForm && <div className="mini-panel category-add-panel">
          <label>追加するもの<select value={categoryDraft.level} onChange={(event) => {
            const nextLevel = event.target.value as "main" | "sub";
            const nextParent = categoryDraft.parentId || sortCategories(state.categories.filter((category) => !category.parentId && category.kind === categoryDraft.kind))[0]?.id || "";
            setCategoryDraft({ ...categoryDraft, level: nextLevel, parentId: nextLevel === "sub" ? nextParent : categoryDraft.parentId, color: nextLevel === "sub" ? nextSubcategoryColor(state.categories, nextParent) : categoryDraft.color });
          }}>
            <option value="main">カテゴリー</option>
            <option value="sub">サブカテゴリー</option>
          </select></label>
          <label>用途<select value={categoryDraft.kind} onChange={(event) => {
            const nextKind = event.target.value as "expense" | "income";
            const nextParent = sortCategories(state.categories.filter((category) => !category.parentId && category.kind === nextKind))[0];
            setCategoryDraft({ ...categoryDraft, kind: nextKind, parentId: nextParent?.id ?? "", color: categoryDraft.level === "sub" ? nextSubcategoryColor(state.categories, nextParent?.id ?? "") : categoryDraft.color });
          }}><option value="expense">支出</option><option value="income">収入</option></select></label>
          {categoryDraft.level === "sub" && (
            <label>所属カテゴリー<select value={categoryDraft.parentId} onChange={(event) => {
              setCategoryDraft({ ...categoryDraft, parentId: event.target.value, color: nextSubcategoryColor(state.categories, event.target.value) });
            }}>
              <option value="">選択してください</option>
              {sortCategories(state.categories.filter((category) => !category.parentId && category.kind === categoryDraft.kind)).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select></label>
          )}
          <label>{categoryDraft.level === "sub" ? "サブカテゴリー名" : "カテゴリー名"}<input placeholder={categoryDraft.level === "sub" ? "例: スーパー" : "例: 食費"} value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} /></label>
          <label>{categoryDraft.level === "sub" ? "色（自動グラデーション）" : "色"}<input type="color" value={categoryDraft.color} disabled={categoryDraft.level === "sub"} onChange={(event) => setCategoryDraft({ ...categoryDraft, color: event.target.value })} /></label>
          <button className="full-primary" type="button" onClick={async () => {
            try {
              if (!categoryDraft.name.trim()) {
                setNotice(categoryDraft.level === "sub" ? "サブカテゴリー名を入力してください。" : "カテゴリー名を入力してください。");
                return;
              }
              if (categoryDraft.level === "sub" && !categoryDraft.parentId) {
                setNotice("所属カテゴリーを選択してください。");
                return;
              }
              await createCategory(state.householdId ?? "", {
                name: categoryDraft.name,
                color: categoryDraft.color,
                kind: categoryDraft.kind,
                parentId: categoryDraft.level === "sub" ? categoryDraft.parentId : undefined
              });
              await reloadHousehold(state.householdId ?? "");
              const resetParent = state.categories.find((category) => !category.parentId && category.kind === categoryDraft.kind)?.id ?? "";
              setCategoryDraft({ ...categoryDraft, name: "", parentId: resetParent });
              setShowCategoryForm(false);
              setNotice(categoryDraft.level === "sub" ? "サブカテゴリーを追加しました。" : "カテゴリーを追加しました。");
            } catch (error) { setNotice(toJapaneseError(error, "カテゴリー追加に失敗しました。")); }
          }}>追加する</button>
        </div>}
        <div className="category-tree">
          {(["expense", "income"] as const).map((kind) => (
            <div className="category-kind-block" key={kind}>
              <strong>{kind === "expense" ? "支出カテゴリー" : "収入カテゴリー"}</strong>
              {sortCategories(state.categories.filter((category) => !category.parentId && category.kind === kind)).map((parent) => (
                <section key={parent.id}>
                  <button type="button" onClick={() => setCategoryModalId(parent.id)}><strong><i style={{ background: parent.color }} />{parent.name}</strong></button>
                  {sortSubcategories(state.categories.filter((category) => category.parentId === parent.id)).map((child) => <button type="button" key={child.id} onClick={() => setCategoryModalId(child.id)}><span><i style={{ background: categoryDisplayColor(child, state.categories) }} />{child.name}</span></button>)}
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
        <div className="section-title"><h2>定期項目管理</h2><span>支出・収入・振替</span></div>
        <p className="setting-copy">毎月ほぼ必ず発生する支払い・収入・口座間の振替です。家賃、通信費、給与、貯金口座への移動などを登録します。</p>
        <button className="full-primary" type="button" onClick={() => setShowFixedForm(!showFixedForm)}>{showFixedForm ? "追加を閉じる" : "固定項目を追加する"}</button>
        {showFixedForm && <div className="crud-form">
          <label>種類<select value={newFixed.kind} onChange={(event) => {
            const nextKind = event.target.value as TransactionType;
            setNewFixed({ ...newFixed, kind: nextKind, categoryId: nextKind === "income" ? firstIncomeCategoryId : nextKind === "expense" ? firstExpenseCategoryId : "", transferToAccountId: nextKind === "transfer" ? state.accounts.filter((account) => account.type !== "credit").find((account) => account.id !== newFixed.accountId)?.id ?? "" : "" });
          }}><option value="expense">定期支出</option><option value="income">定期収入</option><option value="transfer">定期振替</option></select></label>
          <label>名称<input placeholder={newFixed.kind === "income" ? "例: 給与 / 家賃収入" : newFixed.kind === "transfer" ? "例: 貯金口座へ移動" : "例: 家賃 / Netflix / 電気代"} value={newFixed.name} onChange={(event) => setNewFixed({ ...newFixed, name: event.target.value })} /></label>
          <label>金額<input type="number" min="0" value={numberInputValue(newFixed.amount)} onChange={(event) => setNewFixed({ ...newFixed, amount: Number(event.target.value || 0) })} /></label>
          {newFixed.kind !== "transfer" && <label>カテゴリ<select value={newFixed.categoryId} onChange={(event) => setNewFixed({ ...newFixed, categoryId: event.target.value })}><option value="">選択してください</option><CategoryOptions categories={state.categories} kind={newFixed.kind} /></select></label>}
          <label>{newFixed.kind === "income" ? "入金先" : newFixed.kind === "transfer" ? "振替元" : "支払元"}<select value={newFixed.accountId} onChange={(event) => setNewFixed({ ...newFixed, accountId: event.target.value, transferToAccountId: event.target.value === newFixed.transferToAccountId ? "" : newFixed.transferToAccountId })}>{state.accounts.filter((account) => newFixed.kind === "expense" || account.type !== "credit").map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
          {newFixed.kind === "transfer" && <label>振替先<select value={newFixed.transferToAccountId} onChange={(event) => setNewFixed({ ...newFixed, transferToAccountId: event.target.value })}><option value="">選択してください</option>{state.accounts.filter((account) => account.type !== "credit" && account.id !== newFixed.accountId).map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>}
          <label>{newFixed.kind === "income" ? "入金予定日" : newFixed.kind === "transfer" ? "振替予定日" : "支払予定日"}<input type="number" min="1" max="31" value={numberInputValue(newFixed.dueDay)} onChange={(event) => setNewFixed({ ...newFixed, dueDay: Number(event.target.value || 0) })} /></label>
          <label>開始月<input type="month" value={newFixed.effectiveFrom.slice(0, 7)} onChange={(event) => setNewFixed({ ...newFixed, effectiveFrom: `${event.target.value}-01` })} /></label>
          <button className="full-primary" type="button" onClick={async () => {
            try {
              if (newFixed.kind !== "transfer" && !newFixed.categoryId) {
                setNotice(newFixed.kind === "income" ? "固定収入のカテゴリを選択してください。" : "固定費のカテゴリを選択してください。");
                return;
              }
              if (!newFixed.accountId) {
                setNotice(newFixed.kind === "income" ? "固定収入の入金先を選択してください。" : "固定費の支払元を選択してください。");
                return;
              }
              if (newFixed.kind === "transfer" && !newFixed.transferToAccountId) {
                setNotice("定期振替の振替先を選択してください。");
                return;
              }
              await createFixedCost(state.householdId ?? "", newFixed);
              await reloadHousehold(state.householdId ?? "");
              setNewFixed({ name: "", kind: "expense", categoryId: firstExpenseCategoryId, accountId: firstBankAccountId, transferToAccountId: "", amount: 0, variable: false, dueDay: 1, status: "planned", effectiveFrom: todayIso().slice(0, 7) + "-01" });
              setShowFixedForm(false);
              setNotice(newFixed.kind === "income" ? "固定収入を追加しました。" : newFixed.kind === "transfer" ? "定期振替を追加しました。" : "固定費を追加しました。");
            } catch (error) { setNotice(toJapaneseError(error, "定期項目の追加に失敗しました。")); }
          }}>追加する</button>
        </div>}
        <EditableFixedCostList state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} />
      </section>
      </>
      )}
    </div>
  );
}

function AdminView() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState("");
  const [adminTab, setAdminTab] = useState<"summary" | "users" | "households">("summary");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"deleteHousehold" | "suspendUser" | "resumeUser" | "deleteUser" | null>(null);
  async function reloadDashboard() {
    setError("");
    setDashboard(await loadAdminDashboard());
  }
  useEffect(() => {
    let mounted = true;
    loadAdminDashboard()
      .then((data) => {
        if (mounted) setDashboard(data);
      })
      .catch((caught) => {
        if (mounted) setError(toJapaneseError(caught, "管理データの取得に失敗しました。"));
      });
    return () => {
      mounted = false;
    };
  }, []);
  const activeUsers = dashboard?.users.filter((user) => !user.deletedAt) ?? [];
  const stoppedUsers = dashboard?.users.filter((user) => user.deletedAt) ?? [];
  const activeHouseholds = dashboard?.households.filter((household) => !household.deletedAt) ?? [];
  const sharedHouseholds = activeHouseholds.filter((household) => household.spaceType === "shared");
  const selectedUser = dashboard?.users.find((user) => user.id === selectedUserId) ?? null;
  const selectedHousehold = activeHouseholds.find((household) => household.id === selectedHouseholdId) ?? null;
  const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" }) : "未設定";
  return (
    <div className="view-stack">
      <section className="panel admin-hero">
        <div className="section-title"><h2>管理者画面</h2><span>運用状況</span></div>
        {error && <div className="form-error">{error}</div>}
        {!dashboard && !error && <div className="empty-state"><span>管理データを読み込み中です。</span></div>}
        {dashboard && (
          <>
            <div className="admin-grid">
              <button type="button" onClick={() => setAdminTab("users")}><span>有効ユーザー</span><strong>{activeUsers.length}人</strong><em>停止中 {stoppedUsers.length}人</em></button>
              <button type="button" onClick={() => setAdminTab("households")}><span>有効家計簿</span><strong>{activeHouseholds.length}件</strong><em>共有 {sharedHouseholds.length}件</em></button>
              <button type="button" onClick={() => setAdminTab("households")}><span>共有率</span><strong>{activeHouseholds.length ? Math.round((sharedHouseholds.length / activeHouseholds.length) * 100) : 0}%</strong><em>共有家計簿 / 全家計簿</em></button>
            </div>
            <div className="admin-tabs">
              <button className={adminTab === "summary" ? "active" : ""} type="button" onClick={() => setAdminTab("summary")}>概要</button>
              <button className={adminTab === "users" ? "active" : ""} type="button" onClick={() => setAdminTab("users")}>ユーザー</button>
              <button className={adminTab === "households" ? "active" : ""} type="button" onClick={() => setAdminTab("households")}>家計簿</button>
            </div>
            {adminTab === "summary" && (
              <div className="admin-section">
                <div className="section-title"><h2>最近の状況</h2><span>削除済みは非表示</span></div>
                <div className="admin-overview-grid">
                  <div><span>最近のユーザー</span>{activeUsers.slice(0, 5).map((user) => <button key={user.id} type="button" onClick={() => setSelectedUserId(user.id)}>{user.displayName}<em>{formatDateTime(user.createdAt)}</em></button>)}</div>
                  <div><span>最近の家計簿</span>{activeHouseholds.slice(0, 5).map((household) => <button key={household.id} type="button" onClick={() => setSelectedHouseholdId(household.id)}>{household.name}<em>{household.spaceType === "shared" ? "共有" : "個人"}</em></button>)}</div>
                </div>
              </div>
            )}
            {adminTab === "users" && (
            <div className="admin-section">
              <div className="section-title"><h2>ユーザー管理</h2><span>{dashboard.users.length}件</span></div>
              <div className="admin-table">
                {dashboard.users.map((user) => (
                  <button
                    className="admin-list-button"
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setConfirmAction(null);
                    }}
                  >
                    <strong>{user.displayName}</strong>
                    <span>{user.role === "admin" ? "管理者" : "一般"} / {user.deletedAt ? "停止中" : "有効"}</span>
                    <em>{user.id.slice(0, 8)}</em>
                  </button>
                ))}
              </div>
            </div>
            )}
            {adminTab === "households" && (
            <div className="admin-section">
              <div className="section-title"><h2>家計簿管理</h2><span>{activeHouseholds.length}件</span></div>
              <div className="admin-table">
                {activeHouseholds.map((household) => (
                  <button
                    className="admin-list-button"
                    key={household.id}
                    type="button"
                    onClick={() => {
                      setSelectedHouseholdId(household.id);
                      setConfirmAction(null);
                    }}
                  >
                    <strong>{household.name}</strong>
                    <span>{household.spaceType === "shared" ? "共有" : "個人"} / 有効</span>
                    <em>{household.id.slice(0, 8)}</em>
                  </button>
                ))}
              </div>
            </div>
            )}
            {selectedUser && (
              <div className="sheet-backdrop center-backdrop" onClick={() => setSelectedUserId(null)}>
                <section className="modal-panel admin-household-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="section-title">
                    <h2>{selectedUser.displayName}</h2>
                    <span>{selectedUser.deletedAt ? "停止中" : selectedUser.role === "admin" ? "管理者" : "一般ユーザー"}</span>
                  </div>
                  <div className="ledger-info-grid">
                    <div><span>ユーザーID</span><strong>{selectedUser.id}</strong></div>
                    <div><span>権限</span><strong>{selectedUser.role === "admin" ? "管理者" : "一般"}</strong></div>
                    <div><span>作成日時</span><strong>{formatDateTime(selectedUser.createdAt)}</strong></div>
                    <div><span>停止日時</span><strong>{formatDateTime(selectedUser.deletedAt)}</strong></div>
                  </div>
                  <div className="member-list">
                    <span>参加中の家計簿</span>
                    {selectedUser.households.filter((household) => !household.deletedAt).length === 0 && <em>有効な家計簿がありません。</em>}
                    {selectedUser.households.filter((household) => !household.deletedAt).map((household) => (
                      <div key={household.id}>
                        <strong>{household.name}</strong>
                        <em>{household.spaceType === "shared" ? "共有" : "個人"} / {household.memberRole === "owner" ? "所有者" : "メンバー"} / {household.id.slice(0, 8)}</em>
                      </div>
                    ))}
                  </div>
                  <div className="delete-confirm-box">
                    {!confirmAction && (
                      <div>
                        {selectedUser.deletedAt ? (
                          <button type="button" onClick={() => setConfirmAction("resumeUser")}>アカウントを再開</button>
                        ) : (
                          <button type="button" onClick={() => setConfirmAction("suspendUser")}>アカウントを停止</button>
                        )}
                        <button className="danger-button" type="button" onClick={() => setConfirmAction("deleteUser")}>アカウントを削除</button>
                      </div>
                    )}
                    {confirmAction === "suspendUser" && (
                      <>
                        <p>「{selectedUser.displayName}」のアカウントを停止しますか？</p>
                        <div>
                          <button className="danger-button" type="button" onClick={async () => { try { await adminSuspendUser(selectedUser.id); await reloadDashboard(); setSelectedUserId(null); setConfirmAction(null); } catch (caught) { setError(toJapaneseError(caught, "アカウント停止に失敗しました。")); } }}>停止する</button>
                          <button type="button" onClick={() => setConfirmAction(null)}>キャンセル</button>
                        </div>
                      </>
                    )}
                    {confirmAction === "resumeUser" && (
                      <>
                        <p>「{selectedUser.displayName}」のアカウントを再開しますか？</p>
                        <div>
                          <button type="button" onClick={async () => { try { await adminResumeUser(selectedUser.id); await reloadDashboard(); setSelectedUserId(null); setConfirmAction(null); } catch (caught) { setError(toJapaneseError(caught, "アカウント再開に失敗しました。")); } }}>再開する</button>
                          <button type="button" onClick={() => setConfirmAction(null)}>キャンセル</button>
                        </div>
                      </>
                    )}
                    {confirmAction === "deleteUser" && (
                      <>
                        <p>「{selectedUser.displayName}」を削除しますか？ 所有している有効な家計簿も削除されます。</p>
                        <div>
                          <button className="danger-button" type="button" onClick={async () => { try { await adminDeleteUser(selectedUser.id); await reloadDashboard(); setSelectedUserId(null); setConfirmAction(null); } catch (caught) { setError(toJapaneseError(caught, "アカウント削除に失敗しました。")); } }}>削除する</button>
                          <button type="button" onClick={() => setConfirmAction(null)}>キャンセル</button>
                        </div>
                      </>
                    )}
                  </div>
                  <button type="button" onClick={() => setSelectedUserId(null)}>閉じる</button>
                </section>
              </div>
            )}
            {selectedHousehold && (
              <div className="sheet-backdrop center-backdrop" onClick={() => setSelectedHouseholdId(null)}>
                <section className="modal-panel admin-household-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="section-title">
                    <h2>{selectedHousehold.name}</h2>
                    <span>{selectedHousehold.spaceType === "shared" ? "共有家計簿" : "個人家計簿"}</span>
                  </div>
                  <div className="ledger-info-grid">
                    <div><span>家計簿ID</span><strong>{selectedHousehold.id}</strong></div>
                    <div><span>状態</span><strong>{selectedHousehold.deletedAt ? "削除済み" : "有効"}</strong></div>
                    <div><span>作成日時</span><strong>{formatDateTime(selectedHousehold.createdAt)}</strong></div>
                    <div><span>削除日時</span><strong>{formatDateTime(selectedHousehold.deletedAt)}</strong></div>
                  </div>
                  <div className="member-list">
                    <span>ユーザー</span>
                    {selectedHousehold.members.length === 0 && <em>ユーザー情報がありません。</em>}
                    {selectedHousehold.members.map((member) => (
                      <div key={member.userId}>
                        <strong>{member.displayName}</strong>
                        <em>{member.memberRole === "owner" ? "所有者" : "メンバー"} / {member.userId.slice(0, 8)}</em>
                      </div>
                    ))}
                  </div>
                  <div className="delete-confirm-box">
                    {confirmAction !== "deleteHousehold" ? (
                      <button className="danger-button" type="button" onClick={() => setConfirmAction("deleteHousehold")}>この家計簿を削除</button>
                    ) : (
                      <>
                        <p>本当に「{selectedHousehold.name}」を削除しますか？ 取引・口座・固定費・目標も見えなくなります。</p>
                        <div>
                          <button
                            className="danger-button"
                            type="button"
                            onClick={async () => {
                              try {
                                await adminDeleteHousehold(selectedHousehold.id);
                                await reloadDashboard();
                                setSelectedHouseholdId(null);
                                setConfirmAction(null);
                              } catch (caught) {
                                setError(toJapaneseError(caught, "家計簿の削除に失敗しました。"));
                              }
                            }}
                          >
                            削除する
                          </button>
                          <button type="button" onClick={() => setConfirmAction(null)}>キャンセル</button>
                        </div>
                      </>
                    )}
                  </div>
                  <button type="button" onClick={() => setSelectedHouseholdId(null)}>閉じる</button>
                </section>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function AssetSnapshotSettings({ state, setNotice, reloadHousehold }: { state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  const defaultMonth = state.assetSnapshots[0]?.month ?? todayIso().slice(0, 7);
  const currentMonth = todayIso().slice(0, 7);
  const [targetMonth, setTargetMonth] = useState(defaultMonth > currentMonth ? currentMonth : defaultMonth);
  const months = Array.from(new Set([
    targetMonth,
    currentMonth,
    ...state.assetSnapshots.map((snapshot) => snapshot.month)
  ])).filter((month) => month <= currentMonth).sort((a, b) => b.localeCompare(a));
  return (
    <section className="panel">
      <div className="section-title"><h2>月末資産一覧</h2><span>確定・再変更</span></div>
      <p className="setting-copy">確定済みの月末資産を確認できます。金額を変更すると、その月以降の残高計算にも反映されます。</p>
      <label>追加・変更する月<input type="month" value={targetMonth} max={currentMonth} onChange={(event) => setTargetMonth(event.target.value > currentMonth ? currentMonth : event.target.value)} /></label>
      <div className="snapshot-settings-list">
        {months.map((month) => {
          const count = state.assetSnapshots.filter((snapshot) => snapshot.month === month).length;
          const total = totalAssets(state, month);
          return (
            <details key={month} open={month === targetMonth}>
              <summary>
                <strong>{formatMonthLabel(month)}</strong>
                <span>{count > 0 ? "確定済み" : "未確定"} / {yen.format(total)}</span>
              </summary>
              <AssetSnapshotEditor state={state} monthKey={month} setNotice={setNotice} reload={() => reloadHousehold(state.householdId ?? "")} />
            </details>
          );
        })}
      </div>
    </section>
  );
}

function EditableAccountList({ state, setNotice, reloadHousehold }: { state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const renderAccount = (account: LedgerState["accounts"][number]) => {
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
                <span>現在残高: {yen.format(calculateAccountBalance(account, state.transactions))}</span>
                <button type="button" onClick={() => setEditingId(account.id)}>編集する</button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`${account.name}を削除しますか？`)) return;
                    try {
                      await deleteAccount(account.id);
                      await reloadHousehold(state.householdId ?? "");
                      setSelectedId(null);
                      setNotice("口座を削除しました。");
                    } catch (error) {
                      setNotice(toJapaneseError(error, "口座削除に失敗しました。"));
                    }
                  }}
                >
                  削除する
                </button>
              </div>
            )}
            {isOpen && isEditing && <EditableAccountRow account={account} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} onDone={() => setEditingId(null)} />}
          </div>
        );
  };
  return (
    <div className="category-edit-columns">
      <div>
        <h3>口座</h3>
        <div className="detail-card-list">{state.accounts.filter((account) => account.type !== "credit").map(renderAccount)}</div>
      </div>
      <div>
        <h3>支払い方法</h3>
        <div className="detail-card-list">{state.accounts.filter((account) => account.type === "credit").map(renderAccount)}</div>
      </div>
    </div>
  );
}

function EditableAccountRow({ account, state, setNotice, reloadHousehold, onDone }: { account: LedgerState["accounts"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onDone: () => void }) {
  const [name, setName] = useState(account.name);
  const [openingBalance, setOpeningBalance] = useState(account.openingBalance);
  const [openingBalanceDate, setOpeningBalanceDate] = useState(account.openingBalanceDate ?? todayIso());
  const [color, setColor] = useState(account.color);
  const [closingDay, setClosingDay] = useState(account.closingDay ?? 25);
  const [withdrawalDay, setWithdrawalDay] = useState(account.withdrawalDay ?? 10);
  const [withdrawalAccountId, setWithdrawalAccountId] = useState(account.withdrawalAccountId ?? state.accounts.find((item) => item.type !== "credit")?.id ?? "");
  return (
    <div className="edit-row balanced-edit">
      <label>口座名<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>表示色<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      {account.type !== "credit" && (
        <>
          <label>初期残高<input type="number" value={numberInputValue(openingBalance)} onChange={(event) => setOpeningBalance(Number(event.target.value || 0))} /></label>
          <label>基準日<input type="date" value={openingBalanceDate} onChange={(event) => setOpeningBalanceDate(event.target.value)} /></label>
        </>
      )}
      {account.type === "credit" && (
        <>
          <label>締め日<input type="number" min="1" max="31" value={numberInputValue(closingDay)} onChange={(event) => setClosingDay(Number(event.target.value || 0))} /></label>
          <label>引落日<input type="number" min="1" max="31" value={numberInputValue(withdrawalDay)} onChange={(event) => setWithdrawalDay(Number(event.target.value || 0))} /></label>
          <label>引落口座<select value={withdrawalAccountId} onChange={(event) => setWithdrawalAccountId(event.target.value)}><option value="">選択してください</option>{state.accounts.filter((item) => item.type !== "credit").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </>
      )}
      <button
        onClick={async () => {
          try {
            if (!name.trim()) {
              setNotice("口座名を入力してください。");
              return;
            }
            if (account.type === "credit" && !withdrawalAccountId) {
              setNotice("引落口座を選択してください。");
              return;
            }
            await updateAccount(account.id, {
              name,
              color,
              openingBalance: account.type === "credit" ? 0 : openingBalance,
              openingBalanceDate: account.type === "credit" ? account.openingBalanceDate ?? todayIso() : openingBalanceDate,
              closingDay: account.type === "credit" ? closingDay : undefined,
              withdrawalDay: account.type === "credit" ? withdrawalDay : undefined,
              withdrawalAccountId: account.type === "credit" ? withdrawalAccountId : undefined
            });
            await reloadHousehold(state.householdId ?? "");
            onDone();
            setNotice("口座を更新しました。");
          } catch (error) {
            setNotice(toJapaneseError(error, "口座更新に失敗しました。"));
          }
        }}
      >
        変更を保存
      </button>
      <button onClick={async () => { try { await deleteAccount(account.id); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice("口座を削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "口座削除に失敗しました。")); } }}>口座を削除</button>
      <button type="button" onClick={onDone}>編集をやめる</button>
    </div>
  );
}

function CategoryModal({ category, state, setNotice, reloadHousehold, onClose }: { category: LedgerState["categories"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onClose: () => void }) {
  const parent = state.categories.find((item) => item.id === category.parentId);
  const children = sortSubcategories(state.categories.filter((item) => item.parentId === category.id));
  const [editing, setEditing] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [subName, setSubName] = useState("");
  const [subColor, setSubColor] = useState(nextSubcategoryColor(state.categories, category.id));
  const [draggingChildId, setDraggingChildId] = useState<string | null>(null);
  async function moveSubcategory(targetId: string) {
    if (!draggingChildId || draggingChildId === targetId) return;
    const currentIds = children.map((child) => child.id);
    const fromIndex = currentIds.indexOf(draggingChildId);
    const toIndex = currentIds.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextIds = [...currentIds];
    const [moved] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, moved);
    try {
      await updateSubcategoryOrder(category.id, nextIds, category.color);
      await reloadHousehold(state.householdId ?? "");
      setNotice("サブカテゴリーの並び順を更新しました。");
    } catch (error) {
      setNotice(toJapaneseError(error, "サブカテゴリーの並び替えに失敗しました。"));
    } finally {
      setDraggingChildId(null);
    }
  }
  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-title"><h2>{category.name}</h2><span>{category.parentId ? "サブカテゴリー" : "カテゴリー"}</span></div>
        {!editing ? (
          <div className="fixed-detail">
            <span>用途: {category.kind === "income" ? "収入" : "支出"}</span>
            <span>分類: {category.parentId ? `サブカテゴリー（${parent?.name ?? "カテゴリー未設定"}）` : "カテゴリー"}</span>
            {!category.parentId && (
              <div className="subcategory-order-list">
                {children.length === 0 ? <span>サブカテゴリー: なし</span> : children.map((child) => (
                  <button
                    draggable
                    key={child.id}
                    type="button"
                    onDragStart={() => setDraggingChildId(child.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveSubcategory(child.id)}
                  >
                    <i style={{ background: categoryDisplayColor(child, state.categories) }} />
                    <span>{child.name}</span>
                    <small>ドラッグで並び替え</small>
                  </button>
                ))}
              </div>
            )}
            {!category.parentId && (
              <div className="sub-category-add">
                <button type="button" onClick={() => setShowSubForm(!showSubForm)}>{showSubForm ? "サブカテゴリー追加を閉じる" : "サブカテゴリーを追加する"}</button>
                {showSubForm && (
                  <div className="mini-panel">
                    <label>サブカテゴリー名<input placeholder={`例: ${category.kind === "income" ? "副業" : "スーパー"}`} value={subName} onChange={(event) => setSubName(event.target.value)} /></label>
                    <label>色（自動グラデーション）<input type="color" value={subColor} disabled onChange={(event) => setSubColor(event.target.value)} /></label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (!subName.trim()) {
                            setNotice("サブカテゴリー名を入力してください。");
                            return;
                          }
                          await createCategory(state.householdId ?? "", {
                            name: subName,
                            parentId: category.id,
                            color: subColor,
                            kind: category.kind
                          });
                          await reloadHousehold(state.householdId ?? "");
                          setSubName("");
                          setSubColor(nextSubcategoryColor(state.categories, category.id));
                          setShowSubForm(false);
                          setNotice("サブカテゴリーを追加しました。");
                        } catch (error) {
                          setNotice(toJapaneseError(error, "サブカテゴリー追加に失敗しました。"));
                        }
                      }}
                    >
                      サブカテゴリーを登録
                    </button>
                  </div>
                )}
              </div>
            )}
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
  const parents = sortCategories(state.categories.filter((category) => !category.parentId));
  const children = sortSubcategories(state.categories.filter((category) => category.parentId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  function renderCategory(category: LedgerState["categories"][number]) {
    const isOpen = selectedId === category.id;
    const isEditing = editingId === category.id;
    const parent = state.categories.find((item) => item.id === category.parentId);
    return (
      <div className="detail-card" key={category.id}>
        <button className="detail-card-head" type="button" onClick={() => { setSelectedId(isOpen ? null : category.id); setEditingId(null); }}>
          <span><i style={{ background: categoryDisplayColor(category, state.categories) }} />{category.name}</span>
        </button>
        {isOpen && !isEditing && (
          <div className="fixed-detail">
            <span>分類: {category.parentId ? `小カテゴリ（${parent?.name ?? "親カテゴリ未設定"}）` : "親カテゴリ"}</span>
            {!category.parentId && <span>小カテゴリ: {sortSubcategories(children.filter((child) => child.parentId === category.id)).map((child) => child.name).join("、") || "なし"}</span>}
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
  return <div className="edit-row balanced-edit"><label>{category.parentId ? "サブカテゴリー名" : "カテゴリー名"}<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>用途<select value={kind} onChange={(event) => setKind(event.target.value as "expense" | "income")}><option value="expense">支出</option><option value="income">収入</option></select></label><label>分類<select value={parentId} onChange={(event) => { const nextParentId = event.target.value; setParentId(nextParentId); const parent = state.categories.find((item) => item.id === nextParentId); if (parent) { setKind(parent.kind); setColor(nextSubcategoryColor(state.categories.filter((item) => item.id !== category.id), nextParentId)); } }}><option value="">カテゴリーにする</option>{sortCategories(state.categories.filter((item) => !item.parentId && item.id !== category.id && item.kind === kind)).map((item) => <option value={item.id} key={item.id}>{item.name} のサブカテゴリーにする</option>)}</select></label><label>{parentId ? "色（自動グラデーション）" : "色"}<input type="color" value={color} disabled={Boolean(parentId)} onChange={(event) => setColor(event.target.value)} /></label><button onClick={async () => { try { if (!name.trim()) { setNotice("カテゴリー名を入力してください。"); return; } await updateCategory(category.id, { name, parentId, color, kind }); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice(parentId ? "サブカテゴリーを更新しました。" : "カテゴリーを更新しました。サブカテゴリーをグラデーションに揃えました。"); } catch (error) { setNotice(toJapaneseError(error, "カテゴリー更新に失敗しました。")); } }}>変更を保存</button><button onClick={async () => { try { await deleteCategory(category.id); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice("カテゴリーを削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "カテゴリー削除に失敗しました。")); } }}>カテゴリーを削除</button><button type="button" onClick={onDone}>編集をやめる</button></div>;
}

function EditableFixedCostList({ state, setNotice, reloadHousehold }: { state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const currentMonth = todayIso().slice(0, 7);
  const activeCosts = state.fixedCosts.filter((cost) => !cost.effectiveTo || cost.effectiveTo.slice(0, 7) >= currentMonth);
  const endedCosts = state.fixedCosts.filter((cost) => cost.effectiveTo && cost.effectiveTo.slice(0, 7) < currentMonth);
  const renderCost = (cost: LedgerState["fixedCosts"][number]) => {
    const isOpen = selectedId === cost.id;
    const isEditing = editingId === cost.id;
    const category = state.categories.find((item) => item.id === cost.categoryId);
    const account = state.accounts.find((item) => item.id === cost.accountId);
    const transferToAccount = state.accounts.find((item) => item.id === cost.transferToAccountId);
    const ended = Boolean(cost.effectiveTo && cost.effectiveTo.slice(0, 7) < currentMonth);
    const meta = fixedKindMeta(cost.kind);
    return (
      <div className={`fixed-editor-card${ended ? " ended" : ""}`} key={cost.id}>
        <button className="fixed-editor-head" type="button" onClick={() => { setSelectedId(isOpen ? null : cost.id); setEditingId(null); }}>
          <span><b className={`kind-badge ${meta.className}`}>{meta.label}</b>{cost.name}</span>
          <strong>{meta.sign}{yen.format(cost.amount)}</strong>
          {ended && <em>終了済み</em>}
        </button>
        {isOpen && !isEditing && (
          <div className="fixed-detail">
            <span>種類: {meta.label}</span>
            <span>{cost.kind === "income" ? "入金日" : cost.kind === "transfer" ? "振替日" : "支払日"}: 毎月{cost.dueDay}日</span>
            {cost.kind !== "transfer" && <span>カテゴリ: {category?.name ?? "未設定"}</span>}
            <span>{cost.kind === "income" ? "入金先" : cost.kind === "transfer" ? "振替元" : "支払元"}: {account?.name ?? "未設定"}</span>
            {cost.kind === "transfer" && <span>振替先: {transferToAccount?.name ?? "未設定"}</span>}
            <span>反映期間: {cost.effectiveFrom ? cost.effectiveFrom.slice(0, 7) : "開始月なし"} から {cost.effectiveTo ? cost.effectiveTo.slice(0, 7) : "継続中"}</span>
            <button type="button" onClick={() => setEditingId(cost.id)}>編集する</button>
          </div>
        )}
        {isOpen && isEditing && <EditableFixedCostRow cost={cost} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} onDone={() => setEditingId(null)} />}
      </div>
    );
  };
  return (
    <div className="fixed-editor-list">
      {activeCosts.map(renderCost)}
      {endedCosts.length > 0 && (
        <div className="ended-fixed-section">
          <strong>終了済みの定期項目</strong>
          {endedCosts.map(renderCost)}
        </div>
      )}
    </div>
  );
}

function EditableFixedCostRow({ cost, state, setNotice, reloadHousehold, onDone }: { cost: LedgerState["fixedCosts"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onDone: () => void }) {
  const [draft, setDraft] = useState(cost);
  const [scope, setScope] = useState<"all" | "future">("all");
  const [fromMonth, setFromMonth] = useState(todayIso().slice(0, 7));
  const onlyEndMonthChanged = (
    draft.name === cost.name &&
    draft.amount === cost.amount &&
    draft.categoryId === cost.categoryId &&
    draft.accountId === cost.accountId &&
    (draft.transferToAccountId ?? "") === (cost.transferToAccountId ?? "") &&
    draft.dueDay === cost.dueDay &&
    draft.variable === cost.variable &&
    (draft.effectiveFrom ?? "") === (cost.effectiveFrom ?? "") &&
    (draft.effectiveTo ?? "") !== (cost.effectiveTo ?? "")
  );
  return (
    <div className="edit-row">
      <label>項目名<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>金額<input type="number" value={numberInputValue(draft.amount)} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value || 0) })} /></label>
      {draft.kind !== "transfer" && <label>カテゴリ<select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">選択してください</option><CategoryOptions categories={state.categories} kind={draft.kind} /></select></label>}
      <label>{draft.kind === "income" ? "入金先" : draft.kind === "transfer" ? "振替元" : "支払元"}<select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value, transferToAccountId: event.target.value === draft.transferToAccountId ? "" : draft.transferToAccountId })}><option value="">選択してください</option>{state.accounts.filter((account) => draft.kind === "expense" || account.type !== "credit").map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
      {draft.kind === "transfer" && <label>振替先<select value={draft.transferToAccountId ?? ""} onChange={(event) => setDraft({ ...draft, transferToAccountId: event.target.value })}><option value="">選択してください</option>{state.accounts.filter((account) => account.type !== "credit" && account.id !== draft.accountId).map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label>}
      <label>{draft.kind === "income" ? "入金日" : draft.kind === "transfer" ? "振替日" : "支払日"}<input type="number" min="1" max="31" value={numberInputValue(draft.dueDay)} onChange={(event) => setDraft({ ...draft, dueDay: Number(event.target.value || 0) })} /></label>
      <label>開始月<input type="month" value={(draft.effectiveFrom ?? todayIso()).slice(0, 7)} onChange={(event) => setDraft({ ...draft, effectiveFrom: `${event.target.value}-01` })} /></label>
      <label>終了月<input type="month" value={(draft.effectiveTo ?? "").slice(0, 7)} onChange={(event) => setDraft({ ...draft, effectiveTo: event.target.value ? `${event.target.value}-01` : undefined })} /></label>
      <label>削除・変更の範囲<select value={scope} onChange={(event) => setScope(event.target.value as "all" | "future")}><option value="all">過去分も含めてすべてに反映</option><option value="future">指定した月以降だけに反映</option></select></label>
      {scope === "future" && <label>指定月<input type="month" value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} /></label>}
      <button onClick={async () => { try { if (draft.kind !== "transfer" && !draft.categoryId) { setNotice(draft.kind === "income" ? "固定収入のカテゴリを選択してください。" : "固定費のカテゴリを選択してください。"); return; } if (!draft.accountId) { setNotice(draft.kind === "income" ? "固定収入の入金先を選択してください。" : draft.kind === "transfer" ? "定期振替の振替元を選択してください。" : "固定費の支払元を選択してください。"); return; } if (draft.kind === "transfer" && !draft.transferToAccountId) { setNotice("定期振替の振替先を選択してください。"); return; } const updateScope = onlyEndMonthChanged ? "all" : scope; await updateFixedCost(cost.id, { ...draft, status: "planned" }, updateScope, fromMonth); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice(updateScope === "future" ? "指定月以降の固定項目を更新しました。" : "固定項目を更新しました。"); } catch (error) { setNotice(toJapaneseError(error, "固定項目更新に失敗しました。")); } }}>変更を保存</button>
      <button onClick={async () => { try { await deleteFixedCost(cost.id, scope, fromMonth); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice(scope === "future" ? "指定月以降の定期項目を削除しました。" : "定期項目を削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "定期項目の削除に失敗しました。")); } }}>定期項目を削除</button>
      <button type="button" onClick={onDone}>編集をやめる</button>
    </div>
  );
}

function Metric({ icon: Icon, label, value, active, onClick }: { icon: React.ElementType; label: string; value: string; active?: boolean; onClick?: () => void }) {
  const content = <><Icon size={19} /><span>{label}</span><strong>{value}</strong></>;
  if (onClick) return <button type="button" className={`metric metric-button${active ? " active" : ""}`} onClick={onClick}>{content}</button>;
  return <section className="metric">{content}</section>;
}

function shouldShowAssetSnapshotPanel(monthKey: string, confirmed: boolean) {
  const currentMonth = todayIso().slice(0, 7);
  const day = Number(todayIso().slice(8, 10));
  if (confirmed) return false;
  if (monthKey < currentMonth) return true;
  return monthKey === currentMonth && !confirmed && day >= 25;
}

function isAssetSnapshotConfirmed(state: LedgerState, monthKey: string) {
  const assetAccounts = state.accounts.filter((account) => account.type !== "credit");
  if (assetAccounts.length === 0) return false;
  return assetAccounts.every((account) => state.assetSnapshots.some((snapshot) => snapshot.month === monthKey && snapshot.accountId === account.id));
}

function suggestedAssetSnapshotMonth(state: LedgerState) {
  const currentMonth = todayIso().slice(0, 7);
  const day = Number(todayIso().slice(8, 10));
  const previous = shiftMonthKey(currentMonth, -1);
  const month = day <= 5 ? previous : day >= 25 ? currentMonth : "";
  if (!month) return null;
  return isAssetSnapshotConfirmed(state, month) ? null : month;
}

function MonthControl({
  monthKey,
  setMonthKey,
  setSelectedDate,
  label,
  compact = false
}: {
  monthKey: string;
  setMonthKey: (value: string) => void;
  setSelectedDate: (value: string) => void;
  label: string;
  compact?: boolean;
}) {
  function updateMonth(nextMonth: string) {
    setMonthKey(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  }
  return (
    <section className={`month-control ${compact ? "compact" : ""}`} aria-label={label}>
      <span>{label}</span>
      <button type="button" onClick={() => updateMonth(shiftMonthKey(monthKey, -1))}>前月</button>
      <input type="month" value={monthKey} onChange={(event) => updateMonth(event.target.value)} />
      <button type="button" onClick={() => updateMonth(shiftMonthKey(monthKey, 1))}>翌月</button>
    </section>
  );
}

function formatMonthLabel(monthKey: string) {
  return `${Number(monthKey.slice(0, 4))}年${Number(monthKey.slice(5, 7))}月`;
}

function shiftMonthKey(monthKey: string, delta: number) {
  const next = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeInviteCode(value: string) {
  return value
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

function numberInputValue(value: number) {
  return value === 0 ? "" : value;
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
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(transaction);
  const category = state.categories.find((item) => item.id === transaction.categoryId);
  const account = state.accounts.find((item) => item.id === transaction.accountId);
  const normalAccounts = state.accounts.filter((item) => item.type !== "credit");
  const draftCreditAccount = state.accounts.find((item) => item.id === draft.accountId && item.type === "credit");
  const isDraftCreditExpense = draft.type === "expense" && Boolean(draftCreditAccount);
  const autoWithdrawalDate = isDraftCreditExpense && draftCreditAccount ? nextWithdrawalDate(draftCreditAccount, draft.date) : undefined;
  async function saveDraft() {
    if (draft.type !== "transfer" && !draft.categoryId) {
      setNotice("カテゴリーを選択してください。");
      return;
    }
    if (!draft.accountId) {
      setNotice(draft.type === "income" ? "入金先を選択してください。" : draft.type === "transfer" ? "振替元を選択してください。" : "支払元を選択してください。");
      return;
    }
    if (draft.type === "income" && state.accounts.find((item) => item.id === draft.accountId)?.type === "credit") {
      setNotice("収入の入金先にクレジットカードは選択できません。");
      return;
    }
    if (draft.type === "transfer" && !draft.transferToAccountId) {
      setNotice("振替先を選択してください。");
      return;
    }
    if (draft.type === "transfer" && draft.accountId === draft.transferToAccountId) {
      setNotice("振替元と振替先は別の口座を選択してください。");
      return;
    }
    const creditAccount = state.accounts.find((item) => item.id === draft.accountId && item.type === "credit");
    const withdrawalDate = draft.type === "expense" && creditAccount ? draft.reflectedDate : undefined;
    const payload = {
      ...draft,
      categoryId: draft.type === "transfer" ? undefined : draft.categoryId || undefined,
      transferToAccountId: draft.type === "transfer" ? draft.transferToAccountId || normalAccounts.find((item) => item.id !== draft.accountId)?.id : undefined,
      creditStatus: draft.type === "expense" && creditAccount ? draft.creditStatus ?? "unconfirmed" as const : undefined,
      date: draft.date,
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
        <div className="tx-edit-head">
          <strong>取引を編集</strong>
          <button type="button" onClick={() => setEditing(false)}>閉じる</button>
        </div>
        <div className="tx-edit-grid">
          <label>取引の種類<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as TransactionType, categoryId: "", accountId: "", transferToAccountId: "", reflectedDate: undefined, creditStatus: undefined })}><option value="expense">支出</option><option value="income">収入</option><option value="transfer">振替</option></select></label>
          <label>金額<input type="number" value={numberInputValue(draft.amount)} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value || 0) })} /></label>
          {draft.type !== "transfer" && <label>カテゴリ<select value={draft.categoryId ?? ""} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">選択してください</option><CategoryOptions categories={state.categories} kind={draft.type === "income" ? "income" : "expense"} /></select></label>}
          <label>{draft.type === "income" ? "入金先" : draft.type === "transfer" ? "振替元" : "支払元"}<select value={draft.accountId} onChange={(event) => {
            const nextAccountId = event.target.value;
            const nextCreditAccount = state.accounts.find((item) => item.id === nextAccountId && item.type === "credit");
            setDraft({
              ...draft,
              accountId: nextAccountId,
              transferToAccountId: nextAccountId === draft.transferToAccountId ? "" : draft.transferToAccountId,
              reflectedDate: draft.type === "expense" && nextCreditAccount ? nextWithdrawalDate(nextCreditAccount, draft.date) : undefined,
              creditStatus: draft.type === "expense" && nextCreditAccount ? draft.creditStatus ?? "unconfirmed" : undefined
            });
          }}><option value="">選択してください</option>{(draft.type === "income" || draft.type === "transfer" ? normalAccounts : state.accounts).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {draft.type === "transfer" && <label>振替先<select value={draft.transferToAccountId ?? ""} onChange={(event) => setDraft({ ...draft, transferToAccountId: event.target.value })}><option value="">選択してください</option>{normalAccounts.filter((item) => item.id !== draft.accountId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label>{isDraftCreditExpense ? "使用日" : "日付"}<input type="date" value={draft.date} onChange={(event) => {
            const nextDate = event.target.value;
            const nextAutoDate = draftCreditAccount ? nextWithdrawalDate(draftCreditAccount, nextDate) : undefined;
            setDraft({ ...draft, date: nextDate, reflectedDate: isDraftCreditExpense ? nextAutoDate : undefined });
          }} /></label>
        </div>
        {isDraftCreditExpense && (
          <div className="credit-date-editor">
            <div className="date-adjust-actions" aria-label="計上日の選択">
              <button type="button" onClick={() => setDraft({ ...draft, reflectedDate: undefined })}>使用日に計上</button>
              <button type="button" onClick={() => setDraft({ ...draft, reflectedDate: autoWithdrawalDate })}>引落日に計上</button>
            </div>
            <label>引落日<input type="date" value={draft.reflectedDate ?? autoWithdrawalDate ?? ""} onChange={(event) => setDraft({ ...draft, reflectedDate: event.target.value })} /></label>
            <div className="date-adjust-actions" aria-label="引落日の調整">
              <button type="button" onClick={() => setDraft({ ...draft, reflectedDate: shiftMonth(draft.reflectedDate ?? autoWithdrawalDate ?? draft.date, -1) })}>前月へ</button>
              <button type="button" onClick={() => setDraft({ ...draft, reflectedDate: autoWithdrawalDate })}>自動計算</button>
              <button type="button" onClick={() => setDraft({ ...draft, reflectedDate: shiftMonth(draft.reflectedDate ?? autoWithdrawalDate ?? draft.date, 1) })}>翌月へ</button>
            </div>
          </div>
        )}
        <label>メモ<input value={draft.memo ?? ""} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} /></label>
        <div className="tx-edit-actions">
          <button className="full-primary" type="button" onClick={async () => { try { await saveDraft(); } catch (error) { setNotice(toJapaneseError(error, "取引更新に失敗しました。")); } }}>変更を保存</button>
          <button type="button" onClick={() => setEditing(false)}>編集をやめる</button>
        </div>
      </article>
    );
  }
  return (
    <article className={`tx-row${expanded ? " expanded" : ""}`}>
      <button className="tx-main" type="button" onClick={() => setExpanded(!expanded)}>
        <div className={`tx-icon ${transaction.type}`}><ArrowDownUp size={16} /></div>
        <div><strong>{transaction.memo || category?.name || transactionTypeLabel[transaction.type]}</strong><span>{transactionLedgerDate(transaction)} / {account?.name}{transaction.reflectedDate ? ` / 使用日 ${transaction.date}` : ""}{transaction.creditStatus ? ` / ${creditStatusLabel[transaction.creditStatus]}` : ""}</span></div>
        <em>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "-" : ""}{yen.format(transaction.amount)}</em>
      </button>
      {expanded && (
        <div className="tx-row-actions">
          <button className="mini-button" type="button" onClick={() => setEditing(true)}>編集する</button>
          <button className="mini-button danger" type="button" onClick={async () => { try { await deleteTransaction(transaction.id); await reload(); setNotice("取引を削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "取引削除に失敗しました。")); } }}>削除する</button>
        </div>
      )}
    </article>
  );
}

function nextWithdrawalDate(account: LedgerState["accounts"][number], occurredOn: string) {
  const closingDay = account.closingDay ?? 25;
  const withdrawalDay = account.withdrawalDay ?? 10;
  const usedAt = new Date(`${occurredOn}T00:00:00`);
  const monthsToAdd = usedAt.getDate() <= closingDay ? 1 : 2;
  const targetMonth = new Date(usedAt.getFullYear(), usedAt.getMonth() + monthsToAdd, 1);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  const target = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(withdrawalDay, lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

function shiftMonth(date: string, delta: number) {
  const base = new Date(`${date}T00:00:00`);
  const targetMonth = new Date(base.getFullYear(), base.getMonth() + delta, 1);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  const target = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(base.getDate(), lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}
