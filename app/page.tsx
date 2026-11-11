"use client";

import { Children, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Copy,
  Goal,
  HelpCircle,
  Home,
  Landmark,
  LineChart as LineChartIcon,
  LogOut,
  Moon,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Settings,
  Sparkles,
  Sun,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Palette,
  Tag,
  Repeat,
  Stamp,
  BookMarked,
  Download,
  ShieldCheck,
  Banknote,
  SlidersHorizontal,
  BookText,
  Star,
  X,
  ChevronDown,
  MoreHorizontal,
  Check,
  Wallet,
  Eye,
  EyeOff
} from "lucide-react";
import {
  balanceTrend,
  calculateAccountBalance,
  accountBalanceOnDate,
  accountBalanceBreakdown,
  isFixedCostActiveInMonth,
  futureSnapshotMonths,
  calculateAccountBalanceInState,
  confirmedAccountBalance,
  categoryExpense,
  creditStatusLabel,
  fixedCostOccurrencesForMonth,
  fixedCostForecast,
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
import { FixedCost, LedgerState, Transaction, TransactionType } from "@/lib/types";
import type { AdminDashboard } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  createSharedLedger,
  adminDeleteHousehold,
  adminDeleteUser,
  adminResumeUser,
  adminSuspendUser,
  adminToggleUserRole,
  adminUpdateUserDisplayName,
  createAccount,
  createInvestmentAccount,
  createCategory,
  createFixedCost,
  deleteAccount,
  deleteInvestmentAccount,
  deleteInvestmentContributionChange,
  deleteCategory,
  reassignCategoryTransactions,
  deleteInvestmentRecord,
  deleteFixedCost,
  deleteSharedLedger,
  deleteOwnedLedger,
  deleteTransaction,
  insertRemoteTransaction,
  joinSharedLedger,
  leaveSharedLedger,
  loadAdminDashboard,
  loadHouseholdMembers,
  updateLedgerPurpose,
  setFixedCostTaxKind,
  createTaxInstallments,
  loadLedgerAccountsAndCategories,
  createLedgerTransfer,
  updateLedgerTransfer,
  deleteLedgerTransfer,
  createLedgerFixedTransfer,
  updateLedgerFixedTransfer,
  deleteLedgerFixedTransfer,
  upsertLedgerFixedOverride,
  saveLedgerFixedMemo,
  saveLedgerFixedMemoFromMonth,
  loadRemoteState,
  removeSharedLedgerMember,
  renameSharedLedger,
  saveHouseholdThemeColor,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  updateAccount,
  updateInvestmentAccount,
  updateCategory,
  updateFixedCost,
  updateOpeningBalances,
  updateSubcategoryOrder,
  updateTransaction,
  upsertInvestmentContributionChange,
  upsertInvestmentRecord,
  upsertFixedCostOverride,
  upsertAssetSnapshots,
  deleteAssetSnapshotsForMonth,
  extractErrorText,
  toJapaneseError
} from "@/lib/db";
import { AccountType } from "@/lib/types";
import type { HouseholdMember, HouseholdSummary, LedgerPurpose, TaxKind } from "@/lib/types";

type Tab = "home" | "transactions" | "analysis" | "cashflow" | "investments" | "taxes" | "settings" | "admin";
type SettingsPage = "top" | "ledger" | "accounts" | "categories" | "fixed" | "templates" | "snapshots" | "investment" | "cover" | "export";

const SETTINGS_PAGE_TITLES: Record<SettingsPage, string> = {
  top: "設定",
  ledger: "家計簿を管理",
  accounts: "口座・カード",
  categories: "カテゴリ",
  fixed: "定期項目",
  templates: "テンプレート",
  snapshots: "月末資産の確定",
  investment: "投資口座",
  cover: "表紙の色",
  export: "データの書き出し"
};

// 通帳の表紙の色
const DEFAULT_COVER_COLOR = "#1C2A4A";
const LEDGER_PRESET_COLORS = [
  { label: "紺", value: "#1C2A4A" },
  { label: "藍", value: "#2C4F8F" },
  { label: "青緑", value: "#0F6B62" },
  { label: "若竹", value: "#3C7A3A" },
  { label: "からし", value: "#9A6F12" },
  { label: "小豆", value: "#7A3A48" },
  { label: "江戸紫", value: "#5A4386" },
  { label: "墨", value: "#3B3F45" },
];

// 旧デザインの明るいテーマカラーを、近い表紙の色に置き換える
const LEGACY_COVER_COLORS: Record<string, string> = {
  "#7c5cff": "#1C2A4A",
  "#06b6d4": "#0F6B62",
  "#10b981": "#3C7A3A",
  "#f97316": "#9A6F12",
  "#ec4899": "#7A3A48",
  "#ef4444": "#7A3A48",
  "#f59e0b": "#9A6F12",
  "#64748b": "#3B3F45",
};

// 家計簿の種類（個人／共有／事業）
type LedgerKind = "personal" | "shared" | "business";
function ledgerKindOf(ledger: { spaceType?: string; purpose?: string } | undefined): LedgerKind {
  if (!ledger || ledger.spaceType !== "shared") return "personal";
  return ledger.purpose === "business" ? "business" : "shared";
}
const LEDGER_KIND_LABEL: Record<LedgerKind, string> = { personal: "個人", shared: "共有", business: "事業" };

function LedgerPurposeChoice({ ledger, onChanged, setNotice }: { ledger: HouseholdSummary; onChanged: (purpose: LedgerPurpose) => Promise<void>; setNotice: (message: string) => void }) {
  const current: LedgerPurpose = ledger.purpose === "business" ? "business" : "household";
  const [saving, setSaving] = useState(false);
  const isOwner = ledger.memberRole === "owner";
  async function choose(purpose: LedgerPurpose) {
    if (purpose === current || !isOwner || saving) return;
    setSaving(true);
    try {
      await updateLedgerPurpose(ledger.id, purpose);
      await onChanged(purpose);
    } catch (error) {
      setNotice(toJapaneseError(error, "家計簿の使い方の変更に失敗しました。"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="ledger-purpose">
      <div className="ledger-purpose-h">家計簿の使い方</div>
      {([
        ["household", "生活費", "shared", "ふだんの家計簿。食費や日用品などの支出を管理します。"],
        ["business", "事業用", "business", "事業口座とプール金を管理します。資産に「税金」タブが出て、納税の予定が残高見込みに入ります。"]
      ] as const).map(([value, label, kind, text]) => (
        <button key={value} type="button" className={`ledger-purpose-option ${value}${current === value ? " selected" : ""}`} disabled={!isOwner || saving} onClick={() => choose(value)} aria-pressed={current === value}>
          <span className="ledger-purpose-radio" aria-hidden="true" />
          <span><b>{label}<LedgerKindTag kind={kind} /></b><small>{text}</small></span>
        </button>
      ))}
      <p className="settings-note">{isOwner ? "あとから何度でも切り替えられます。取引やカテゴリはそのまま残ります。" : "使い方を変えられるのは、この家計簿のオーナーだけです。"}</p>
    </div>
  );
}

function LedgerKindTag({ kind, className = "" }: { kind: LedgerKind; className?: string }) {
  return (
    <span className={`ledger-kind-tag ${kind} ${className}`}>
      {kind === "business" && <Briefcase size={11} strokeWidth={2.4} aria-hidden="true" />}
      {LEDGER_KIND_LABEL[kind]}
    </span>
  );
}

function coverColor(themeColor?: string | null) {
  if (!themeColor) return DEFAULT_COVER_COLOR;
  return LEGACY_COVER_COLORS[themeColor.toLowerCase()] ?? themeColor;
}

const baseTabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "ホーム", icon: Home },
  { id: "transactions", label: "取引", icon: BookText },
  { id: "analysis", label: "総資産", icon: Wallet },
  { id: "cashflow", label: "収支", icon: BarChart3 },
  { id: "investments", label: "投資", icon: Landmark },
  { id: "settings", label: "設定", icon: Settings }
];

const ASSET_TABS: Tab[] = ["analysis", "cashflow", "investments", "taxes"];

const TAB_TITLES: Record<Tab, string> = {
  home: "ホーム",
  transactions: "取引",
  analysis: "資産",
  cashflow: "資産",
  investments: "資産",
  taxes: "資産",
  settings: "設定",
  admin: "管理"
};

const accountColorForType = (type: AccountType) => {
  if (type === "saving") return "#059669";
  if (type === "cash") return "#d97706";
  if (type === "credit") return "#7c3aed";
  return "#2563eb";
};

type ThemeMode = "dark" | "light";

function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  useEffect(() => {
    const stored = window.localStorage.getItem("mirai-ledger-theme");
    const value: ThemeMode = stored === "dark" ? "dark" : "light";
    setTheme(value);
    document.documentElement.setAttribute("data-theme", value);
  }, []);
  function toggle(next: ThemeMode) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("mirai-ledger-theme", next);
  }
  return { theme, setTheme: toggle };
}

// ============================================================
// 日本の祝日
// ============================================================
function isoDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const HOLIDAY_CACHE = new Map<number, Set<string>>();

function getJapaneseHolidays(year: number): Set<string> {
  if (HOLIDAY_CACHE.has(year)) return HOLIDAY_CACHE.get(year)!;
  const h = new Set<string>();

  const addFixed = (m: number, d: number) => h.add(isoDateStr(year, m, d));

  const nthWeekday = (m: number, weekday: number, n: number): string => {
    let count = 0;
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(year, m - 1, d);
      if (dt.getMonth() !== m - 1) break;
      if (dt.getDay() === weekday && ++count === n) return isoDateStr(year, m, d);
    }
    return "";
  };

  // 固定祝日
  addFixed(1, 1);   // 元日
  addFixed(2, 11);  // 建国記念の日
  addFixed(2, 23);  // 天皇誕生日
  addFixed(4, 29);  // 昭和の日
  addFixed(5, 3);   // 憲法記念日
  addFixed(5, 4);   // みどりの日
  addFixed(5, 5);   // こどもの日
  addFixed(8, 11);  // 山の日
  addFixed(11, 3);  // 文化の日
  addFixed(11, 23); // 勤労感謝の日

  // ハッピーマンデー
  const seijin = nthWeekday(1, 1, 2); if (seijin) h.add(seijin);   // 成人の日
  const umi = nthWeekday(7, 1, 3); if (umi) h.add(umi);             // 海の日
  const keiro = nthWeekday(9, 1, 3); if (keiro) h.add(keiro);       // 敬老の日
  const sports = nthWeekday(10, 1, 2); if (sports) h.add(sports);   // スポーツの日

  // 春分の日・秋分の日（内閣府公表の計算式、1980年以降有効）
  const vernalDay = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const autumnalDay = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  addFixed(3, vernalDay);
  addFixed(9, autumnalDay);

  // 国民の休日（祝日に挟まれた平日）
  for (let m = 1; m <= 12; m++) {
    const daysInMonth = new Date(year, m, 0).getDate();
    for (let d = 2; d < daysInMonth; d++) {
      const date = isoDateStr(year, m, d);
      if (h.has(date)) continue;
      const dow = new Date(year, m - 1, d).getDay();
      if (dow === 0 || dow === 6) continue;
      if (h.has(isoDateStr(year, m, d - 1)) && h.has(isoDateStr(year, m, d + 1))) h.add(date);
    }
  }

  // 振替休日（日曜日に当たった祝日の振替）
  const snapshot = Array.from(h);
  for (const hd of snapshot) {
    const [y, m, d] = hd.split("-").map(Number);
    if (new Date(y, m - 1, d).getDay() !== 0) continue;
    let next = new Date(y, m - 1, d + 1);
    while (true) {
      const iso = isoDateStr(next.getFullYear(), next.getMonth() + 1, next.getDate());
      if (next.getDay() !== 0 && !h.has(iso)) { h.add(iso); break; }
      next = new Date(next.getTime() + 86400000);
    }
  }

  HOLIDAY_CACHE.set(year, h);
  return h;
}

function isJapaneseHoliday(dateIso: string): boolean {
  const year = Number(dateIso.slice(0, 4));
  return getJapaneseHolidays(year).has(dateIso);
}

// ============================================================
// カレンダー週始まり設定
// ============================================================
function useWeekStart(): [number, (v: number) => void] {
  const [weekStart, setWeekStartState] = useState<number>(0);
  useEffect(() => {
    const stored = window.localStorage.getItem("calendar-week-start");
    if (stored !== null) setWeekStartState(Number(stored));
  }, []);
  const setWeekStart = (v: number) => {
    setWeekStartState(v);
    window.localStorage.setItem("calendar-week-start", String(v));
  };
  return [weekStart, setWeekStart];
}

export default function App() {
  const [state, setState] = useState<LedgerState | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [showTour, setShowTour] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("top");
  const [ledgerMenuOpen, setLedgerMenuOpen] = useState(false);
  const [quickDate, setQuickDate] = useState(todayIso());
  const [quickType, setQuickType] = useState<TransactionType>("expense");
  const [calendarMonth, setCalendarMonth] = useState(todayIso().slice(0, 7));
  // 画面を左右にスワイプして月を移動する
  const [monthSlide, setMonthSlide] = useState<"next" | "prev" | null>(null);
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  useEffect(() => {
    if (!monthSlide) return;
    const timer = window.setTimeout(() => setMonthSlide(null), 320);
    return () => window.clearTimeout(timer);
  }, [monthSlide, calendarMonth]);
  function onMonthSwipeStart(event: React.TouchEvent) {
    const target = event.target as HTMLElement;
    // 登録画面や詳細などのシート・モーダルが開いている間は、後ろの画面の月を動かさない
    if (document.querySelector(".sheet-backdrop, .settings-sheet, .modal-panel")) {
      swipeStart.current = null;
      return;
    }
    // 横にスクロールする部品や入力欄、開いているシートの上では月を動かさない
    if (event.touches.length !== 1 || target.closest("input, textarea, select, .bottom-sheet, .sheet-backdrop, .modal-panel, .chip-rows-scroll, .template-strip, .recharts-wrapper, .table-scroll, [data-no-swipe]")) {
      swipeStart.current = null;
      return;
    }
    // 横スクロールできる場所（表・チップ列など）の上では、その中のスクロールを優先する
    for (let node: HTMLElement | null = target; node && node !== event.currentTarget; node = node.parentElement) {
      const overflowX = window.getComputedStyle(node).overflowX;
      if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1) {
        swipeStart.current = null;
        return;
      }
    }
    const touch = event.touches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  }
  function onMonthSwipeEnd(event: React.TouchEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || tab === "settings" || tab === "admin") return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - start.t > 700) return;
    const direction = dx < 0 ? "next" : "prev";
    const next = shiftMonthKey(calendarMonth, direction === "next" ? 1 : -1);
    setCalendarMonth(next);
    setCalendarDate(`${next}-01`);
    setMonthSlide(direction);
  }
  const [calendarDate, setCalendarDate] = useState(todayIso());
  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [notice, setNotice] = useState("");
  const [isSwitchingHousehold, setIsSwitchingHousehold] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState<string>("");
  const { theme, setTheme } = useTheme();
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return window.localStorage.getItem("mirai-ledger-household-id") || undefined;
  });
  const selectedHouseholdRef = useRef<string | undefined>(selectedHouseholdId);
  const ledgerCover = coverColor(state?.themeColor);

  // 表紙の色はページ全体（ポータルのモーダル含む）に効かせる
  useEffect(() => {
    document.documentElement.style.setProperty("--ledger-color", ledgerCover);
  }, [ledgerCover]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  // 初回ログイン時にチュートリアルを自動表示
  useEffect(() => {
    if (typeof window === "undefined" || !isAuthed || !state) return;
    if (!window.localStorage.getItem("mirai-ledger-tour-done")) {
      setShowTour(true);
    }
  }, [isAuthed, state]);

  const closeTour = () => {
    setShowTour(false);
    if (typeof window !== "undefined") window.localStorage.setItem("mirai-ledger-tour-done", "1");
  };
  const openTour = () => {
    setTab("home");
    setShowTour(true);
  };

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
        const displayName = session.user.user_metadata?.display_name || session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "ユーザー";
        setUserDisplayName(displayName);
        setTimeout(() => {
          refreshRemoteState().catch((error) => setNotice(toJapaneseError(error, "家計簿データの読み込みに失敗しました。")));
        }, 0);
      } else {
        setState(null);
        setUserDisplayName("");
      }
    });

    async function bootAuth() {
      const sessionResult = await withTimeout(supabase!.auth.getSession(), 8000, "ログイン状態の確認がタイムアウトしました。");
      if (!mounted) return;
      setIsAuthed(Boolean(sessionResult.data.session));
      if (sessionResult.data.session) {
        const displayName = sessionResult.data.session.user.user_metadata?.display_name || sessionResult.data.session.user.user_metadata?.full_name || sessionResult.data.session.user.email?.split("@")[0] || "ユーザー";
        setUserDisplayName(displayName);
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
    if (isSwitchingHousehold) return;
    if (householdId === selectedHouseholdRef.current) return;
    setIsSwitchingHousehold(true);
    try {
      rememberHouseholdId(householdId);
      const next = await loadRemoteState(householdId);
      // 税金タブは事業用の家計簿だけにあるので、そうでない家計簿では総資産へ
      if (!(next.activeSpace === "shared" && next.ledgerPurpose === "business")) setTab((current) => (current === "taxes" ? "analysis" : current));
      rememberHouseholdId(next.householdId);
      setState(next);
    } finally {
      setIsSwitchingHousehold(false);
    }
  }

  if (!authReady) return <main className="boot"><div><strong>Mirai Ledger</strong><span>あなたのお金のデータを読み込んでいます…</span></div></main>;

  if (supabase && !isAuthed) {
    return <AuthScreen notice={notice} setNotice={setNotice} theme={theme} />;
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
  const isBusinessLedger = state.activeSpace === "shared" && state.ledgerPurpose === "business";
  const ledgerTabs = isBusinessLedger
    ? [...baseTabs.slice(0, 5), { id: "taxes" as const, label: "税金", icon: Receipt }, ...baseTabs.slice(5)]
    : baseTabs;
  const visibleTabs = state.profileRole === "admin"
    ? [...ledgerTabs, { id: "admin" as const, label: "管理", icon: UserPlus }]
    : ledgerTabs;


  function openQuick(date = todayIso(), type: TransactionType = "expense") {
    setQuickDate(date);
    setQuickType(type);
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

  const displayName = userDisplayName || (state?.householdName ?? "ようこそ").replace(/家計簿$/, "");
  const greetingText = greetingByHour(new Date());

  return (
    <main
      className={`app-shell ${state.activeSpace === "shared" ? "shared-ledger" : ""}`}
    >
      {/* Desktop sidebar */}
      <aside className="app-sidebar" aria-label="メインメニュー">
        <div>
          <div className="brand-row">
            <div className="brand-mark"><img src="/mirai-ledger-logo.svg" alt="Mirai Ledger" style={{ width: "32px", height: "32px" }} /></div>
            <div className="brand-text">
              <strong>Mirai Ledger</strong>
              <small>未来の残高がわかる家計簿</small>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {visibleTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={tab === item.id ? "active" : ""} onClick={() => { if (item.id === "settings") setSettingsPage("top"); setTab(item.id); }}>
                <Icon size={18} /> {item.label}
              </button>
            );
          })}
          <button type="button" onClick={openTour}>
            <HelpCircle size={18} /> 使い方ガイド
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="theme-toggle">
            <span>テーマ</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button className={theme === "dark" ? "active" : ""} type="button" onClick={() => setTheme("dark")} aria-label="ダークテーマ"><Moon size={14} /> 夜</button>
              <button className={theme === "light" ? "active" : ""} type="button" onClick={() => setTheme("light")} aria-label="ライトテーマ"><Sun size={14} /> 昼</button>
            </div>
          </div>
          <div className="user-chip">
            <div className="avatar">{displayName.slice(0, 1)}</div>
            <div className="name">{displayName}<span>{state.profileRole === "admin" ? "管理者" : "ユーザー"}</span></div>
            <button className="icon-btn" type="button" onClick={() => signOut().catch((error) => setNotice(toJapaneseError(error)))} aria-label="ログアウト"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className={`app-main${monthSlide ? ` month-slide-${monthSlide}` : ""}`} onTouchStart={onMonthSwipeStart} onTouchEnd={onMonthSwipeEnd} onAnimationEnd={() => setMonthSlide(null)}>
        <section className="app-topbar">
          <button
            type="button"
            className="ledger-switch"
            onClick={() => setLedgerMenuOpen((v) => !v)}
            aria-label="家計簿を切り替え"
          >
            <span className="ledger-mark" aria-hidden="true">{(state.householdName ?? "家").slice(0, 1)}</span>
            <span className="ledger-switch-name">{state.householdName ?? "家計簿"}</span>
            <LedgerKindTag kind={ledgerKindOf({ spaceType: state.activeSpace, purpose: state.ledgerPurpose })} />
            <ChevronDown size={16} />
          </button>
          {ledgerMenuOpen && (
            <div className="topbar-popover left" onClick={(e) => e.stopPropagation()}>
              <div className="tcp-title">家計簿を切り替え</div>
              {(state.households ?? []).map((household) => (
                <button
                  key={household.id}
                  type="button"
                  className="popover-item"
                  disabled={isSwitchingHousehold}
                  onClick={() => {
                    setLedgerMenuOpen(false);
                    if (household.id === state.householdId) return;
                    switchHousehold(household.id).catch((error) => setNotice(toJapaneseError(error, "家計簿の切替に失敗しました。")));
                  }}
                >
                  <LedgerKindTag kind={ledgerKindOf(household)} />
                  <span className="popover-item-label">{household.name}</span>
                  {household.id === state.householdId && <Check size={16} />}
                </button>
              ))}
              <button type="button" className="popover-item manage" onClick={() => { setLedgerMenuOpen(false); setSettingsPage("ledger"); setTab("settings"); }}>
                <Settings size={16} /><span className="popover-item-label">家計簿を管理</span><ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>
        {ledgerMenuOpen && <div className="sheet-backdrop" style={{ background: "transparent" }} onClick={() => setLedgerMenuOpen(false)} />}

        {(state.households ?? []).length > 1 && (
          <section className="household-pills desktop-only" aria-label="家計簿切替">
            {(state.households ?? []).map((household) => (
              <button
                className={`household-pill ${household.id === state.householdId ? "active" : ""} ${isSwitchingHousehold && household.id !== state.householdId ? "loading" : ""}`}
                key={household.id}
                type="button"
                disabled={isSwitchingHousehold}
                onClick={() => switchHousehold(household.id).catch((error) => setNotice(toJapaneseError(error, "家計簿の切替に失敗しました。")))}
              >
                <LedgerKindTag kind={ledgerKindOf(household)} />
                {household.name}
              </button>
            ))}
          </section>
        )}

        {!(tab === "settings" && settingsPage !== "top") && <header className="page-head">
          <h1>{TAB_TITLES[tab]}</h1>
          {tab !== "settings" && tab !== "admin" && (
            <MonthSwitcher monthKey={calendarMonth} setMonthKey={setCalendarMonth} setSelectedDate={setCalendarDate} />
          )}
        </header>}

        {ASSET_TABS.includes(tab) && (
          <nav className="segment-tabs mobile-only" aria-label="資産メニュー">
            {([["analysis", "総資産"], ["cashflow", "収支"], ["investments", "投資"], ...(isBusinessLedger ? [["taxes", "税金"]] as const : [])] as const).map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
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
            onNavigate={setTab}
          />
        )}
        {tab === "transactions" && (
          <TransactionsView
            state={state}
            monthKey={calendarMonth}
            setNotice={setNotice}
            reload={() => refreshRemoteState()}
            onQuick={openQuick}
          />
        )}
        {(tab === "analysis" || tab === "cashflow") && (
          <AnalysisView
            section={tab === "analysis" ? "total" : "flow"}
            state={state}
            monthKey={calendarMonth}
            stats={stats}
            setNotice={setNotice}
            reload={() => refreshRemoteState()}
            onNavigate={setTab}
          />
        )}
        {tab === "investments" && <InvestmentsView state={state} monthKey={calendarMonth} setNotice={setNotice} reload={() => refreshRemoteState()} />}
        {tab === "taxes" && !isBusinessLedger && <p className="settings-note">この家計簿は事業用ではないため、税金タブはありません。設定 › 家計簿を管理 で「事業用」にすると使えます。</p>}
        {tab === "taxes" && isBusinessLedger && <TaxesView state={state} monthKey={calendarMonth} setNotice={setNotice} reload={() => refreshRemoteState()} />}
        {tab === "settings" && (
          <SettingsView
            state={state}
            setNotice={setNotice}
            reloadHousehold={switchHousehold}
            reload={() => refreshRemoteState()}
            page={settingsPage}
            setPage={(next) => { setSettingsPage(next); window.scrollTo(0, 0); }}
            theme={theme}
            setTheme={setTheme}
            onOpenTour={openTour}
            onOpenAdmin={() => setTab("admin")}
            onOpenTaxes={() => { setTab("taxes"); window.scrollTo(0, 0); }}
            onSignOut={() => signOut().catch((error) => setNotice(toJapaneseError(error)))}
          />
        )}
        {tab === "admin" && state.profileRole === "admin" && <AdminView />}
      </div>

      <button className="fab" type="button" onClick={() => openQuick()} aria-label="取引を追加">
        <Plus size={24} />
      </button>

      <nav className="bottom-bar" aria-label="メインメニュー">
        <div className="bottom-nav">
          {([
            { id: "home" as Tab, label: "ホーム", icon: Home },
            { id: "transactions" as Tab, label: "取引", icon: BookText },
            null,
            { id: "analysis" as Tab, label: "資産", icon: Wallet },
            { id: "settings" as Tab, label: "設定", icon: Settings }
          ]).map((item) => {
            if (!item) {
              return (
                <button key="add" type="button" className="nav-add" onClick={() => openQuick()} aria-label="取引を追加">
                  <span><Plus size={26} /></span>
                </button>
              );
            }
            const Icon = item.icon;
            const active = item.id === "analysis" ? ASSET_TABS.includes(tab) : tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={active ? "active" : ""}
                onClick={() => { if (item.id === "settings") setSettingsPage("top"); setTab(item.id); }}
                aria-label={item.label}
              >
                <Icon size={21} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {quickOpen && <QuickTransactionSheet state={state} initialDate={quickDate} initialType={quickType} onClose={() => setQuickOpen(false)} onSubmit={addTransaction} onLedgerTransferDone={async () => { setQuickOpen(false); await refreshRemoteState(); setNotice("資金移動を登録しました。相手の家計簿にも記録されています。"); }} />}
      {showTour && <GuidedTour isAdmin={state.profileRole === "admin"} setTab={setTab} onClose={closeTour} />}
    </main>
  );
}

type TourStep = {
  tab?: Tab;
  adminOnly?: boolean;
  icon: React.ElementType;
  title: string;
  body: string;
  tip?: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    icon: Sparkles,
    title: "Mirai Ledger へようこそ",
    body: "日々の収支から口座残高・投資まで、ひとつの画面で管理できる家計簿アプリです。これから主な使い方をひと通り案内します。所要1〜2分です。",
    tip: "この案内はいつでも右上の「…」メニュー →「使い方ガイド」から見直せます。",
  },
  {
    tab: "home",
    icon: Home,
    title: "ホーム：今の状態をひと目で",
    body: "一番上に今月の支出、その下に収入・収支・カード引落が表示されます。月は画面上部の「‹ ›」で切り替えられます。総資産は下のカードから確認できます。",
  },
  {
    tab: "transactions",
    icon: Plus,
    title: "取引を登録する",
    body: "下のメニュー中央の「＋」ボタンから、支出・収入・振替を登録できます。よく使う取引は上部のチップから1タップで呼び出せます。クレジットカード払いは、後で引落日に自動で反映されます。",
    tip: "まずは1件、今日の支出を登録してみると流れがつかめます。",
  },
  {
    tab: "transactions",
    icon: Receipt,
    title: "取引：履歴の確認と検索",
    body: "登録した取引はこの「取引」タブに一覧表示されます。メモ・カテゴリ・口座・金額で検索でき、タップすれば編集・削除も可能です。",
  },
  {
    tab: "analysis",
    icon: Wallet,
    title: "資産 ▶ 口座・収支：残高と内訳",
    body: "銀行・現金・クレジットカードなど、口座ごとの残高や収支の内訳を確認できます。カードの締め日・引落日を登録しておくと、いつ・いくら引き落とされるかが自動で計算されます。",
  },
  {
    tab: "investments",
    icon: Landmark,
    title: "資産 ▶ 投資：資産の成長を管理",
    body: "投資口座を追加し、毎月の積立額や評価額を記録できます。年利の推移グラフで、資産がどう増えているかを振り返れます。",
  },
  {
    tab: "settings",
    icon: Settings,
    title: "設定：すべての登録はここから",
    body: "「設定」タブの上部メニュー（家計簿・口座・投資・月末資産・カテゴリ・定期項目・表示設定）から各種登録・編集を行います。次の画面から主な項目を順に説明します。",
  },
  {
    tab: "settings",
    icon: Wallet,
    title: "設定 ▶ 口座",
    body: "最初に「口座」メニューから、銀行・現金・カードなどを登録しましょう。初期残高を入れておくと、以降の資産計算が正確になります。カードは締め日・引落日も設定できます。",
    tip: "ここを設定しておくことが、正確な家計管理の第一歩です。",
  },
  {
    tab: "settings",
    icon: Goal,
    title: "設定 ▶ カテゴリ",
    body: "「カテゴリ」メニューで、支出・収入の分類を自分好みに追加・編集できます。大分類の下にサブカテゴリも作れるので、食費→外食/食料品 のように細かく管理できます。",
  },
  {
    tab: "settings",
    icon: CalendarDays,
    title: "設定 ▶ 定期項目",
    body: "家賃・サブスク・給料など、毎月決まって発生する収入・支出を「定期項目」に登録しておくと、毎回入力しなくても自動で見込みに反映されます。",
  },
  {
    tab: "settings",
    icon: PiggyBank,
    title: "設定 ▶ 月末資産",
    body: "月末・月初は実残高とアプリの残高がズレやすい時期です。「月末資産」で口座残高を確定すると、翌月以降の資産推移が正確になります。通帳と違う場合はここで調整します。",
  },
  {
    tab: "settings",
    icon: Users,
    title: "設定 ▶ 共有家計簿",
    body: "家族やパートナーと家計を共有したいときは「家計簿」メニューの『共有家計簿を作成』から作成します。発行される共有IDを相手に伝えれば、招待コードで参加してもらえます。",
    tip: "画面左上の家計簿名をタップすると、個人／共有の家計簿を切り替えられます。",
  },
  {
    tab: "settings",
    icon: Eye,
    title: "設定 ▶ 表示設定",
    body: "週の開始曜日やテーマ（昼/夜）、資産額の表示/非表示など、見た目や使い勝手を「表示設定」で調整できます。人前で開くときは資産を隠すこともできます。",
  },
  {
    adminOnly: true,
    tab: "admin",
    icon: UserPlus,
    title: "管理：全体の状況を把握",
    body: "管理者は右上の「…」メニューから「管理画面」を開き、利用状況や共有家計簿の統計などを確認できます。",
  },
  {
    icon: Sparkles,
    title: "準備完了です！",
    body: "まずは『設定 ▶ 口座』で口座を登録し、下の「＋」から取引を入れてみましょう。困ったら右上の「…」メニューからいつでもこの案内を見直せます。",
  },
];

function GuidedTour({ isAdmin, setTab, onClose }: { isAdmin: boolean; setTab: (tab: Tab) => void; onClose: () => void }) {
  const steps = useMemo(() => TOUR_STEPS.filter((step) => !step.adminOnly || isAdmin), [isAdmin]);
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const Icon = step.icon;

  useEffect(() => {
    if (step.tab) setTab(step.tab);
  }, [index, step.tab, setTab]);

  return createPortal(
    <div className="tour-overlay" onClick={onClose}>
      <div className="tour-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button className="tour-skip" type="button" onClick={onClose}>スキップ</button>
        <div className="tour-icon"><Icon size={26} /></div>
        <div className="tour-step-count">{index + 1} / {steps.length}</div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        {step.tip && <div className="tour-tip"><Sparkles size={14} /><span>{step.tip}</span></div>}
        <div className="tour-dots">
          {steps.map((_, i) => (
            <span key={i} className={i === index ? "active" : ""} />
          ))}
        </div>
        <div className="tour-actions">
          <button className="tour-back" type="button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            <ChevronLeft size={16} />戻る
          </button>
          {isLast ? (
            <button className="tour-next" type="button" onClick={onClose}>はじめる</button>
          ) : (
            <button className="tour-next" type="button" onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}>
              次へ<ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function greetingByHour(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return "こんばんは";
  if (hour < 11) return "おはようございます";
  if (hour < 17) return "こんにちは";
  return "こんばんは";
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
      <section className="auth-hero">
        <div className="brand">
          <div className="brand-mark"><img src="/mirai-ledger-logo.svg" alt="Mirai Ledger" style={{ width: "40px", height: "40px" }} /></div>
          Mirai Ledger
        </div>
        <div>
          <h1>未来の残高を、<br />今日の手元で。</h1>
          <p className="lead">資産・収支・固定費・カード引落まで、ひとつの画面で管理できる新しい家計OS。</p>
        </div>
        <div className="auth-foot">© Mirai Ledger</div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-card">
          <p className="eyebrow">初期設定が必要です</p>
          <h2>接続情報を設定してください</h2>
          <p className="sub">アプリを動かすために <code>.env.local</code> に Supabase の接続情報を入力してください。</p>
          <div className="setup-code">
            <code>NEXT_PUBLIC_SUPABASE_URL=...</code>
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY=...</code>
          </div>
        </div>
      </section>
    </main>
  );
}

function AuthScreen({ notice, setNotice, theme }: { notice: string; setNotice: (message: string) => void; theme: ThemeMode }) {
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
      <section className="auth-hero">
        <div className="brand">
          <div className="brand-mark"><img src="/mirai-ledger-logo.svg" alt="Mirai Ledger" style={{ width: "40px", height: "40px" }} /></div>
          Mirai Ledger
        </div>
        <div>
          <h1>収支も資産も、<br />ひとつで管理。</h1>
          <p className="lead">日々の取引・固定費・クレカ引落・投資まで、個人でも家族でも使えるシンプルな家計簿アプリ。</p>
          <div className="auth-hero-features">
            <div className="auth-hero-feature">
              <div className="feat-icon"><CreditCard size={20} /></div>
              <div>
                <strong>クレカの引落日を自動計算</strong>
                <span>締め日・引落日を登録すれば、使用日から引落日を自動算出。カードと現金・口座をまとめて管理できます。</span>
              </div>
            </div>
            <div className="auth-hero-feature">
              <div className="feat-icon"><Receipt size={20} /></div>
              <div>
                <strong>固定費・定期収入を一括登録</strong>
                <span>家賃・サブスク・給与などの定期的なお金の動きを登録すると、毎月自動で収支に反映されます。</span>
              </div>
            </div>
            <div className="auth-hero-feature">
              <div className="feat-icon"><Users size={20} /></div>
              <div>
                <strong>パートナー・家族と共有</strong>
                <span>共有家計簿を作成して招待するだけ。個人の家計簿と切り替えながら使い分けることもできます。</span>
              </div>
            </div>
          </div>
        </div>
        <div className="auth-foot">© Mirai Ledger　未来の残高がわかる家計簿</div>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-card">
          <p className="eyebrow">おかえりなさい</p>
          <h2>{mode === "login" ? "ログイン" : "アカウントを作成"}</h2>
          <p className="sub">{mode === "login" ? "メールアドレスまたはGoogleアカウントで続行できます。" : "数十秒で開始できます。すでにご利用中ならログインへ。"}</p>
          {notice && <div className="notice" role="status">{notice}</div>}
          <form className="auth-form" onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }}>
            {mode === "signup" && (
              <label>表示名<input name="displayName" autoComplete="name" placeholder="例: 山田 太郎" /></label>
            )}
            <label>メールアドレス<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
            <label>パスワード<input name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder="8文字以上" /></label>
            {mode === "signup" && (
              <label>確認用パスワード<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required placeholder="もう一度入力" /></label>
            )}
            <button className="primary-btn" type="submit" disabled={busy} style={{ marginTop: 6 }}>{busy ? "処理中…" : mode === "login" ? "ログインする" : "アカウントを作成する"}</button>
          </form>
          <div className="divider">または</div>
          <button className="google-btn" type="button" disabled={googleBusy} onClick={continueWithGoogle}>
            <GoogleLogo />{googleBusy ? "Googleへ移動中…" : "Googleで続ける"}
          </button>
          <div className="auth-switch">
            {mode === "login" ? "アカウントをお持ちでないですか？" : "すでにアカウントをお持ちですか？"}
            <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "新規作成" : "ログインへ"}</button>
          </div>
        </div>
      </section>
    </main>
  );
}

function GoogleLogo() {
  return (
    <svg className="google-mark" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.96v2.331A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.708V4.96H.96A9 9 0 0 0 0 9c0 1.452.348 2.827.96 4.04l3.004-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A9 9 0 0 0 .96 4.96l3.004 2.332C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function DbErrorScreen({ notice, onRetry }: { notice: string; onRetry: () => void }) {
  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="brand">
          <div className="brand-mark"><Wallet size={20} /></div>
          Mirai Ledger
        </div>
        <div>
          <h1>データの読み込みで<br />止まりました。</h1>
          <p className="lead">家計簿データの取得または初期作成で失敗しています。時間をおいて再試行してください。</p>
        </div>
        <div className="auth-foot">© Mirai Ledger</div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-card">
          <p className="eyebrow">接続エラー</p>
          <h2>もう一度試してみましょう</h2>
          <p className="sub">回線または Supabase の状態を確認してから再読み込みしてください。</p>
          {notice && <div className="notice" role="status">{notice}</div>}
          <button className="primary-btn" type="button" onClick={onRetry}>再読み込み</button>
          <button className="switch-auth" type="button" onClick={() => signOut()}>ログアウト</button>
        </div>
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
  setCalendarDate,
  onNavigate
}: {
  state: LedgerState;
  stats: Record<string, number>;
  setNotice: (message: string) => void;
  reload: () => Promise<void>;
  onQuick: (date?: string, type?: TransactionType) => void;
  calendarMonth: string;
  setCalendarMonth: (value: string) => void;
  calendarDate: string;
  setCalendarDate: (value: string) => void;
  onNavigate: (tab: Tab) => void;
}) {
  const monthLabel = formatMonthLabel(calendarMonth);
  const isCurrentMonth = calendarMonth === todayIso().slice(0, 7);
  const confirmedSnapshots = state.assetSnapshots.filter((snapshot) => snapshot.month === calendarMonth);
  const isSnapshotConfirmed = isAssetSnapshotConfirmed(state, calendarMonth);
  const shouldShowSnapshotPanel = shouldShowAssetSnapshotPanel(calendarMonth, isSnapshotConfirmed);
  const suggestedPromptMonth = suggestedAssetSnapshotMonth(state);
  const [promptMonth, setPromptMonth] = useState<string | null>(null);
  const [homeEntryModal, setHomeEntryModal] = useState<"expense" | "income" | "credit" | null>(null);
  const [accountHistoryId, setAccountHistoryId] = useState<string | null>(null);
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [showRecentTxModal, setShowRecentTxModal] = useState(false);
  const [assetsHidden, setAssetsHidden] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("assetsHidden") === "true");
  const toggleAssetsHidden = () => { const next = !assetsHidden; setAssetsHidden(next); window.localStorage.setItem("assetsHidden", String(next)); };
  // hide() no longer used — blur is applied via CSS .assets-hidden class
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
  const investmentTotal = investmentAssets(state, calendarMonth);
  const liquidAccounts = state.accounts.filter((account) => account.type !== "credit");
  const accountAssets = liquidAccounts.reduce((sum, account) => sum + confirmedAccountBalance(account, state, calendarMonth), 0);
  const displayAssets = accountAssets + investmentTotal;

  const trend = useMemo(() => balanceTrend(state, calendarMonth), [state, calendarMonth]);
  const lastActual = trend.filter((point) => point.actual != null).slice(-2);
  const monthChange = lastActual.length === 2 ? (lastActual[1].actual ?? 0) - (lastActual[0].actual ?? 0) : 0;
  const monthChangePct = lastActual.length === 2 && lastActual[0].actual ? (monthChange / Math.max(Math.abs(lastActual[0].actual), 1)) * 100 : 0;
  const recentTx = [...state.transactions].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date)).slice(0, 5);
  const upcoming = useMemo(() => upcomingBills(state, 14), [state]);

  return (
    <div className="view-stack">
      <section className={`home-summary${assetsHidden ? " assets-hidden" : ""}`}>
        <div className="home-summary-head">
          <span>{monthLabel}の支出</span>
          <button type="button" className="eye-toggle" onClick={toggleAssetsHidden} aria-label={assetsHidden ? "金額を表示" : "金額を隠す"}>
            {assetsHidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button type="button" className="amount home-summary-amount" onClick={() => setHomeEntryModal("expense")}>
          <span className="yen">¥</span>{plainAmount(stats.expense)}
        </button>
        <div className="home-summary-sub">固定費 {yen.format(stats.fixed)} を含む</div>
        <div className="home-summary-stats">
          <button type="button" onClick={() => setHomeEntryModal("income")}>
            <span>収入</span>
            <strong className="kpi-value income">{plainAmount(stats.income)}</strong>
          </button>
          <div>
            <span>収支</span>
            <strong className={`kpi-value ${savingAmount >= 0 ? "income" : "expense"}`}>{savingAmount > 0 ? "+" : savingAmount < 0 ? "−" : ""}{plainAmount(savingAmount)}</strong>
          </div>
          <button type="button" onClick={() => setHomeEntryModal("credit")}>
            <span>カード引落</span>
            <strong className="kpi-value">{plainAmount(stats.credit)}</strong>
          </button>
        </div>
      </section>

      <section className={`panel asset-link${assetsHidden ? " assets-hidden" : ""}`}>
        {isSnapshotConfirmed && (
          <div className="hanko" aria-label={`${monthLabel}の月末資産は確定済み`}>
            <b>確定</b>
            <i>{Number(calendarMonth.slice(5, 7))}.{new Date(Number(calendarMonth.slice(0, 4)), Number(calendarMonth.slice(5, 7)), 0).getDate()}</i>
          </div>
        )}
        <div className="panel-title">
          <h2>{isSnapshotConfirmed ? `${monthLabel}末の総資産` : isCurrentMonth ? "月末の予定総資産" : `${monthLabel}の総資産`}</h2>
          {!assetsHidden && Math.abs(monthChange) > 0 && (
            <span className={`delta-chip ${monthChange > 0 ? "up" : "down"}`}>
              {monthChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {monthChange > 0 ? "+" : ""}{yen.format(monthChange)}
            </span>
          )}
        </div>
        <div className="amount asset-link-amount"><span className="yen">¥</span>{balanceAmount(displayAssets)}</div>
        <div className="asset-link-rows">
          <button type="button" onClick={() => setShowAllAccounts(true)}>
            <Wallet size={16} /><span>口座</span><strong className="kpi-value">{balanceAmount(accountAssets)}</strong><ChevronRight size={16} />
          </button>
          <button type="button" onClick={() => onNavigate("investments")}>
            <LineChartIcon size={16} /><span>投資</span><strong className="kpi-value">{balanceAmount(investmentTotal)}</strong><ChevronRight size={16} />
          </button>
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

      <section className="panel">
        <div className="panel-title">
          <h2>最近の取引</h2>
          <button className="panel-action" type="button" onClick={() => setShowRecentTxModal(true)}>すべて見る <ChevronRight size={14} /></button>
        </div>
        {recentTx.length === 0 ? (
          <div className="empty-state"><div className="empty-illustration"><Receipt size={20} /></div>下の ＋ ボタンから最初の取引を登録してみましょう。</div>
        ) : (
          <TransactionList state={{ ...state, transactions: recentTx }} setNotice={setNotice} reload={reload} />
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="panel">
          <div className="panel-title"><h2>これからの引落・予定</h2><span className="panel-meta">2週間以内</span></div>
          <div className="ledger-lines">
            {upcoming.slice(0, 3).map((item, index) => (
              <div className="ledger-line" key={`${item.id}-${item.date}-${index}`}>
                <div className="tx-lead">{shortDate(item.date)}<small>{item.daysLeft <= 0 ? "今日" : `あと${item.daysLeft}日`}</small></div>
                <div className="ledger-line-body"><strong>{item.name}</strong>{item.installment && <small className={item.installment.startsWith("最終回") ? "last" : ""}>{item.installment}</small>}</div>
                <div className={`ledger-line-amount ${item.kind}`}>{item.kind === "income" ? "+" : ""}{plainAmount(item.amount)}</div>
              </div>
            ))}
          </div>
        </section>
      )}


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
      {accountHistoryId && (
        <AccountHistoryModal
          accountId={accountHistoryId}
          state={state}
          onClose={() => setAccountHistoryId(null)}
        />
      )}
      {showAllAccounts && (
        <AllAccountsModal
          state={state}
          monthKey={calendarMonth}
          onClose={() => setShowAllAccounts(false)}
          onSelect={(id) => { setShowAllAccounts(false); setAccountHistoryId(id); }}
        />
      )}
      {showRecentTxModal && (
        <RecentTransactionsModal
          state={state}
          setNotice={setNotice}
          reload={reload}
          onClose={() => setShowRecentTxModal(false)}
        />
      )}
    </div>
  );
}

function RecentTransactionsModal({ state, setNotice, reload, onClose }: { state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const allByRegistration = [...state.transactions].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date));

  const filtered = query.trim() === "" ? allByRegistration : allByRegistration.filter((t) => {
    const q = query.trim().toLowerCase();
    const category = state.categories.find((c) => c.id === t.categoryId);
    const account = state.accounts.find((a) => a.id === t.accountId);
    return (
      t.memo?.toLowerCase().includes(q) ||
      category?.name.toLowerCase().includes(q) ||
      account?.name.toLowerCase().includes(q) ||
      String(t.amount).includes(q) ||
      t.date.includes(q)
    );
  });

  const displayed = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = displayed.length < filtered.length;

  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 540px)", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div className="section-title">
          <h2>最近登録した取引</h2>
          <span>{filtered.length}件</span>
        </div>
        <input
          type="search"
          placeholder="メモ・カテゴリ・口座・金額で検索"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          style={{ margin: "0 0 12px", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--input-bg, var(--panel))", color: "var(--text)", fontSize: 14, width: "100%", boxSizing: "border-box" }}
          autoFocus
        />
        <div style={{ overflowY: "auto", flex: 1 }}>
          {displayed.length === 0 ? (
            <div className="empty-state">該当する取引がありません。</div>
          ) : (
            <>
              <TransactionList state={{ ...state, transactions: displayed }} setNotice={setNotice} reload={reload} />
              {hasMore && (
                <button className="google-button" type="button" style={{ marginTop: 8, width: "100%" }} onClick={() => setPage((p) => p + 1)}>
                  さらに表示（残り {filtered.length - displayed.length} 件）
                </button>
              )}
            </>
          )}
        </div>
        <button className="google-button" type="button" style={{ marginTop: 12 }} onClick={onClose}>閉じる</button>
      </section>
    </div>
  );
}

function KpiCard({ tone, icon: Icon, label, value, sub, subPrivate, onClick }: { tone: "income" | "expense" | "saving" | "credit"; icon: React.ElementType; label: string; value: string; sub?: string; subPrivate?: string; onClick?: () => void }) {
  const content = (
    <>
      <div className="kpi-head">
        {label}
        <span className="kpi-icon"><Icon size={14} /></span>
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {subPrivate && <div className="kpi-sub kpi-sub-private">{subPrivate}</div>}
    </>
  );
  return (
    <button type="button" className={`kpi-card ${tone}`} onClick={onClick}>{content}</button>
  );
}

function AllAccountsModal({ state, monthKey, onClose, onSelect }: { state: LedgerState; monthKey: string; onClose: () => void; onSelect: (id: string) => void }) {
  const accounts = state.accounts.filter((a) => a.type !== "credit");
  const total = accounts.reduce((sum, a) => sum + confirmedAccountBalance(a, state, monthKey), 0);
  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 480px)" }}>
        <div className="section-title">
          <h2>口座残高一覧</h2>
          <span>合計 {yen.format(total)}</span>
        </div>
        <div className="account-list" style={{ marginTop: 8 }}>
          {accounts.map((account) => {
            const balance = confirmedAccountBalance(account, state, monthKey);
            const ratio = total > 0 ? Math.max(Math.min(balance / total, 1), 0) : 0;
            return (
              <div className="account-row account-row-clickable" key={account.id} onClick={() => onSelect(account.id)} role="button" tabIndex={0}>
                <div className="account-mark" style={{ background: account.color }}>{account.name.slice(0, 1)}</div>
                <div className="account-name"><strong>{account.name}</strong><small>{accountTypeLabel(account.type)}</small></div>
                <div className="balance">{yen.format(balance)}</div>
                <div className="account-bar"><i style={{ width: `${ratio * 100}%`, background: account.color }} /></div>
              </div>
            );
          })}
        </div>
        <button className="google-button" type="button" onClick={onClose} style={{ marginTop: 16 }}>閉じる</button>
      </section>
    </div>
  );
}

function AccountHistoryModal({ accountId, state, onClose, monthKey }: { accountId: string; state: LedgerState; onClose: () => void; monthKey?: string }) {
  const account = state.accounts.find((a) => a.id === accountId);
  const [breakdownMonth, setBreakdownMonth] = useState(monthKey ?? todayIso().slice(0, 7));
  if (!account) return null;
  const breakdown = accountBalanceBreakdown(account, state, breakdownMonth);

  // Build last 13 months of balance data
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  const months: string[] = [];
  for (let i = 12; i >= 0; i--) {
    const d = new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)) - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  // 現在月も confirmedAccountBalance を使うことで固定費（定期収入・定期支出）を含めた計算になる
  const currentBalanceNow = confirmedAccountBalance(account, state, currentMonth);
  const chartData = months.map((month) => ({
    label: `${Number(month.slice(5, 7))}月`,
    fullLabel: `${month.slice(0, 4)}/${Number(month.slice(5, 7))}月`,
    value: confirmedAccountBalance(account, state, month)
  }));
  const latest = currentBalanceNow;
  const earliest = chartData[0].value;
  const change = latest - earliest;

  return (
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 560px)" }}>
        <div className="section-title">
          <h2>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: account.color, marginRight: 8, verticalAlign: "middle" }} />
            {account.name}
          </h2>
          <span>{accountTypeLabel(account.type)}</span>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 11, color: "var(--muted)" }}>現在残高</div><div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-num)" }}>{yen.format(latest)}</div></div>
          <div><div style={{ fontSize: 11, color: "var(--muted)" }}>12ヶ月変動</div><div style={{ fontSize: 18, fontWeight: 700, color: change >= 0 ? "var(--income)" : "var(--expense)", fontFamily: "var(--font-num)" }}>{change >= 0 ? "+" : ""}{yen.format(change)}</div></div>
        </div>
        <div style={{ marginTop: 4 }}>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="acctGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={account.color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={account.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted)" }} />
              <YAxis hide />
              <Tooltip formatter={(v) => yen.format(Number(v))} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ""} />
              <Area type="monotone" dataKey="value" name="残高" stroke={account.color} strokeWidth={2.5} fill="url(#acctGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <section className="balance-breakdown" aria-label="月末残高の内訳">
          <div className="balance-breakdown-head">
            <button type="button" aria-label="前の月" onClick={() => setBreakdownMonth(addMonthsKey(breakdownMonth, -1))}><ChevronLeft size={16} /></button>
            <b>{formatMonthLabel(breakdownMonth)}末の残高の内訳</b>
            <button type="button" aria-label="次の月" onClick={() => setBreakdownMonth(addMonthsKey(breakdownMonth, 1))}><ChevronRight size={16} /></button>
          </div>
          <div className="balance-breakdown-list">
            <div className="bb-row base"><span>{breakdown.baseLabel}</span><b className="num">{breakdown.baseAmount < 0 ? "−" : ""}{plainAmount(breakdown.baseAmount)}</b></div>
            {breakdown.earlierCount > 0 && <div className="bb-row"><span>{formatMonthLabel(breakdown.monthKey).replace(/^\d+年/, "")}より前の動き（{breakdown.earlierCount}件）</span><b className={`num ${breakdown.earlierAmount >= 0 ? "pos" : ""}`}>{breakdown.earlierAmount >= 0 ? "+" : "−"}{plainAmount(breakdown.earlierAmount)}</b></div>}
            {breakdown.items.map((item, index) => (
              <div className="bb-row" key={`${item.date}-${index}`}>
                <span><small className="num">{shortDate(item.date)}</small>{item.label}<em>{item.detail}</em></span>
                <b className={`num ${item.amount >= 0 ? "pos" : ""}`}>{item.amount >= 0 ? "+" : "−"}{plainAmount(item.amount)}</b>
              </div>
            ))}
            {!breakdown.confirmed && breakdown.items.length === 0 && <div className="bb-row empty"><span>この月の動きはありません</span></div>}
            <div className="bb-row total"><span>月末の残高</span><b className="num">{breakdown.total < 0 ? "−" : ""}{plainAmount(breakdown.total)}</b></div>
          </div>
        </section>
        <div className="account-history-list">
          {[...chartData].reverse().slice(0, 7).map((row, i) => {
            const prev = [...chartData].reverse()[i + 1];
            const diff = prev ? row.value - prev.value : 0;
            return (
              <div key={row.fullLabel} className="account-history-row">
                <span className="acct-hist-label">{row.fullLabel}</span>
                <span className="acct-hist-value">{yen.format(row.value)}</span>
                {prev && <span className={`acct-hist-diff ${diff >= 0 ? "positive" : "negative"}`}>{diff >= 0 ? "+" : ""}{yen.format(diff)}</span>}
              </div>
            );
          })}
        </div>
        <button className="google-button" type="button" onClick={onClose}>閉じる</button>
      </section>
    </div>
  );
}

function accountTypeLabel(type: AccountType) {
  if (type === "bank") return "銀行口座";
  if (type === "saving") return "貯金口座";
  if (type === "cash") return "現金";
  return "クレジットカード";
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 通帳の印字風：¥ を付けない桁区切りの数字
// 残高や総資産のように、マイナスもありうる金額（マイナスなら「−」を付ける）
function balanceAmount(value: number) {
  return `${Math.round(value) < 0 ? "−" : ""}${plainAmount(value)}`;
}

function plainAmount(value: number) {
  return Math.abs(Math.round(value)).toLocaleString("ja-JP");
}

function shortDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function weekdayOf(date: string) {
  return WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
}

function categoryPathLabel(state: LedgerState, categoryId?: string) {
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return "";
  const parent = category.parentId ? state.categories.find((item) => item.id === category.parentId) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

function txKindLabel(transaction: Transaction, state: LedgerState) {
  if (transaction.type === "income") return "収入";
  if (transaction.transferGroupId) return "移動";
  if (transaction.type === "transfer") return "振替";
  const account = state.accounts.find((item) => item.id === transaction.accountId);
  if (account?.type === "credit") return "カード";
  if (account?.type === "cash") return "現金";
  return "支出";
}

function formatDayLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}（${["日","月","火","水","木","金","土"][d.getDay()]}）`;
}


// ============================================================
// これから出ていくカードの引落（取引＋カード払いの定期項目）
// 口座残高の計算では、カード支出は「計上日（引落日 or 使用日）」、カード払いの定期項目は「支払日」に
// 引落口座から引いている。月末の予定残高にまだ入っていない分（notInBalance）を別に持つ。
// ============================================================
type CardWithdrawal = {
  card: LedgerState["accounts"][number];
  date: string;
  amount: number;
  notInBalance: number;
  fixedCount: number;
  txCount: number;
  transactions: Transaction[];
  fixed: FixedCostOccurrence[];
};

function upcomingCardWithdrawals(state: LedgerState, today = todayIso()): CardWithdrawal[] {
  const currentMonth = today.slice(0, 7);
  const monthEnd = `${currentMonth}-${String(new Date(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;
  const cards = state.accounts.filter((account) => account.type === "credit");
  const groups = new Map<string, CardWithdrawal>();
  const add = (card: LedgerState["accounts"][number], date: string, amount: number, inBalance: boolean, item: { tx?: Transaction; fixed?: FixedCostOccurrence }) => {
    const key = `${card.id}|${date}`;
    const group = groups.get(key) ?? { card, date, amount: 0, notInBalance: 0, fixedCount: 0, txCount: 0, transactions: [], fixed: [] };
    group.amount += amount;
    if (!inBalance) group.notInBalance += amount;
    if (item.fixed) { group.fixedCount += 1; group.fixed.push(item.fixed); }
    if (item.tx) { group.txCount += 1; group.transactions.push(item.tx); }
    groups.set(key, group);
  };
  cards.forEach((card) => {
    state.transactions
      .filter((tx) => tx.accountId === card.id && tx.type === "expense" && tx.creditStatus !== "withdrawn")
      .forEach((tx) => {
        const withdrawal = tx.reflectedDate ?? nextWithdrawalDate(card, tx.date);
        if (withdrawal < today) return;
        add(card, withdrawal, tx.amount, transactionLedgerDate(tx) <= monthEnd, { tx });
      });
    // カード払いの定期項目：前々月〜今月に計上された分で、引落がまだ先のもの
    [-2, -1, 0].map((delta) => shiftMonthKey(currentMonth, delta)).forEach((month) => {
      fixedCostOccurrencesForMonth(state.fixedCosts, month, state)
        .filter((cost) => cost.kind === "expense" && cost.accountId === card.id)
        .forEach((cost) => {
          const withdrawal = nextWithdrawalDate(card, cost.date);
          if (withdrawal < today) return;
          add(card, withdrawal, cost.amount, cost.date <= monthEnd, { fixed: cost });
        });
    });
  });
  groups.forEach((group) => {
    group.transactions.sort((a, b) => b.date.localeCompare(a.date));
    group.fixed.sort((a, b) => b.date.localeCompare(a.date));
  });
  return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date) || a.card.name.localeCompare(b.card.name));
}

// カード引落の明細（取引は編集・削除、定期項目はこの月だけ変更）
function CardWithdrawalSheet({ state, cardId, date, setNotice, reload, onClose }: { state: LedgerState; cardId: string; date: string; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void }) {
  // 編集後の最新データで組み直す
  const group = upcomingCardWithdrawals(state).find((item) => item.card.id === cardId && item.date === date);
  const card = state.accounts.find((item) => item.id === cardId);
  const withdrawal = state.accounts.find((item) => item.id === card?.withdrawalAccountId);
  return (
    <SettingsSheet title={`${card?.name ?? "カード"}　${shortDate(date)} 引落`} onClose={onClose}>
      <div className="withdrawal-summary">
        {card && <AccountMark account={card} size="lg" />}
        <span><small>{withdrawal?.name ?? "引落口座未設定"}から引き落とし</small><b className="num">{plainAmount(group?.amount ?? 0)}</b></span>
        <em>{group ? `${group.txCount + group.fixedCount}件` : "0件"}</em>
      </div>
      {!group && <div className="empty-state">この引落の明細はありません。</div>}
      {group && group.fixed.length > 0 && (
        <div className="withdrawal-block">
          <div className="settings-sec-h"><span>定期項目</span><b className="num">{plainAmount(group.fixed.reduce((sum, row) => sum + row.amount, 0))}</b></div>
          <div className="withdrawal-list">
            {group.fixed.map((row) => <FixedCostOccurrenceRow key={`${row.id}-${row.occurrenceMonth}`} row={row} state={state} setNotice={setNotice} reload={reload} />)}
          </div>
        </div>
      )}
      {group && group.transactions.length > 0 && (
        <div className="withdrawal-block">
          <div className="settings-sec-h"><span>カードで払った取引</span><b className="num">{plainAmount(group.transactions.reduce((sum, tx) => sum + tx.amount, 0))}</b></div>
          <div className="withdrawal-list">
            <TransactionList state={{ ...state, transactions: group.transactions }} setNotice={setNotice} reload={reload} />
          </div>
        </div>
      )}
      <p className="sheet-hint">取引はタップして「編集」「削除」、定期項目は「この月だけ変更」で直せます。定期項目そのものの変更は 設定 › 定期項目 から行えます。</p>
    </SettingsSheet>
  );
}

function upcomingBills(state: LedgerState, days: number) {
  const today = todayIso();
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() + days);
  const fromMonth = today.slice(0, 7);
  const toMonth = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  const months = fromMonth === toMonth ? [fromMonth] : [fromMonth, toMonth];
  const occurrences = months.flatMap((month) => fixedCostOccurrencesForMonth(state.fixedCosts, month, state));
  return occurrences
    .filter((cost) => cost.date >= today && cost.date <= `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`)
    .map((cost) => ({
      id: cost.id,
      installment: fixedRowTag(state, cost),
      name: cost.taxKind === "pension" || cost.payDateMoved ? `${cost.name} ${monthNumber(cost.occurrenceMonth)}月分` : cost.name,
      amount: cost.amount,
      kind: cost.kind,
      date: cost.date,
      daysLeft: Math.max(0, Math.ceil((new Date(`${cost.date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / (24 * 60 * 60 * 1000)))
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  return createPortal(
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel asset-confirm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="section-title"><h2>{formatMonthLabel(monthKey)}の月末資産確認</h2><span>残高確定</span></div>
        <p className="setting-copy">月末・月初は実残高とアプリ残高がズレやすい時期です。口座残高を確定すると、翌月以降の資産推移が正確になります。</p>
        <button className="full-primary" type="button" onClick={onClose}>あとで確認</button>
        <AssetSnapshotEditor state={state} monthKey={monthKey} setNotice={setNotice} reload={reload} onDone={onClose} />
      </section>
    </div>,
    document.body
  );
}

function AssetSnapshotModal({ state, monthKey, setNotice, reload, onClose }: { state: LedgerState; monthKey: string; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void }) {
  return createPortal(
    <div className="sheet-backdrop center-backdrop" onClick={onClose}>
      <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="section-title"><h2>{formatMonthLabel(monthKey)}の資産確定</h2><span>翌月以降の基準</span></div>
        <p className="setting-copy">ここで保存した口座別残高を、翌月以降の資産計算の起点にします。通帳や実残高と違う場合は調整して保存してください。</p>
        <AssetSnapshotEditor state={state} monthKey={monthKey} setNotice={setNotice} reload={reload} onDone={onClose} />
        <button className="google-button" type="button" onClick={onClose}>閉じる</button>
      </section>
    </div>,
    document.body
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
  initialType,
  onClose,
  onSubmit,
  onLedgerTransferDone
}: {
  state: LedgerState;
  initialDate: string;
  initialType: TransactionType;
  onClose: () => void;
  onSubmit: (transaction: { type: TransactionType; amount: number; categoryId?: string; accountId: string; transferToAccountId?: string; date: string; memo?: string; creditPostingMode?: "used" | "withdrawal" }) => Promise<void>;
  onLedgerTransferDone?: () => Promise<void>;
}) {
  const usableAccounts = state.accounts;
  const normalAccounts = state.accounts.filter((account) => account.type !== "credit");
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [transferToAccountId, setTransferToAccountId] = useState("");
  const [date, setDate] = useState(initialDate);
  const [memo, setMemo] = useState("");
  const [creditPostingMode, setCreditPostingMode] = useState<"used" | "withdrawal">("used");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [overdraft, setOverdraft] = useState<OverdraftInfo | null>(null);
  useEffect(() => { setOverdraft(null); }, [amount, accountId, date, type]);
  const selectedAccount = state.accounts.find((account) => account.id === accountId);
  const isCreditExpense = type === "expense" && selectedAccount?.type === "credit";
  const accountChoices = type === "income" || type === "transfer" ? normalAccounts : usableAccounts;

  // 別の家計簿への資金移動
  const otherLedgers = (state.households ?? []).filter((ledger) => ledger.id !== state.householdId);
  const [transferScope, setTransferScope] = useState<"self" | "ledger">("self");
  const [ledgerTarget, setLedgerTarget] = useState(() => readLedgerTransferMemory(state.householdId));
  const [targetLedgerData, setTargetLedgerData] = useState<{ householdId: string; accounts: LedgerState["accounts"]; categories: LedgerState["categories"] } | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const isLedgerTransfer = type === "transfer" && transferScope === "ledger" && otherLedgers.length > 0;
  const targetHouseholdId = otherLedgers.some((ledger) => ledger.id === ledgerTarget.toHouseholdId) ? ledgerTarget.toHouseholdId : otherLedgers[0]?.id ?? "";
  const targetLedger = otherLedgers.find((ledger) => ledger.id === targetHouseholdId);
  useEffect(() => {
    if (!isLedgerTransfer || !targetHouseholdId || targetLedgerData?.householdId === targetHouseholdId) return;
    let cancelled = false;
    setTargetLoading(true);
    loadLedgerAccountsAndCategories(targetHouseholdId)
      .then((data) => { if (!cancelled) setTargetLedgerData({ householdId: targetHouseholdId, ...data }); })
      .catch((loadError) => { if (!cancelled) setError(toJapaneseError(loadError, "相手の家計簿を読み込めませんでした。")); })
      .finally(() => { if (!cancelled) setTargetLoading(false); });
    return () => { cancelled = true; };
  }, [isLedgerTransfer, targetHouseholdId]);
  const targetAccounts = targetLedgerData?.householdId === targetHouseholdId ? targetLedgerData.accounts.filter((account) => account.type !== "credit") : [];
  const targetCategories = targetLedgerData?.householdId === targetHouseholdId ? targetLedgerData.categories : [];
  const targetAccountId = targetAccounts.some((account) => account.id === ledgerTarget.toAccountId) ? ledgerTarget.toAccountId : "";
  const fromCategoryId = state.categories.some((category) => category.id === ledgerTarget.fromCategoryId) ? ledgerTarget.fromCategoryId : "";
  const toCategoryId = targetCategories.some((category) => category.id === ledgerTarget.toCategoryId) ? ledgerTarget.toCategoryId : "";
  function patchLedgerTarget(patch: Partial<LedgerTransferMemory>) {
    setLedgerTarget((current) => ({ ...current, ...patch }));
  }
  useEffect(() => {
    // 前回の移動元口座を初期値にする
    if (isLedgerTransfer && !accountId && ledgerTarget.fromAccountId && normalAccounts.some((account) => account.id === ledgerTarget.fromAccountId)) {
      setAccountId(ledgerTarget.fromAccountId);
    }
  }, [isLedgerTransfer]);

  async function submitLedgerTransfer(value: number, allowOverdraft: boolean) {
    if (!accountId) return setError("移動元の口座を選択してください。");
    if (!targetHouseholdId) return setError("移動先の家計簿を選択してください。");
    if (!targetAccountId) return setError("移動先の口座を選択してください。");
    setError("");
    if (!allowOverdraft) {
      const info = overdraftFor(state, accountId, value, date);
      if (info) return setOverdraft(info);
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await createLedgerTransfer({
        fromHouseholdId: state.householdId ?? "",
        fromAccountId: accountId,
        fromCategoryId: fromCategoryId || undefined,
        toHouseholdId: targetHouseholdId,
        toAccountId: targetAccountId,
        toCategoryId: toCategoryId || undefined,
        amount: value,
        date,
        memo,
        countAsExpense: ledgerTarget.countAsExpense,
        countAsIncome: ledgerTarget.countAsIncome
      });
      storeLedgerTransferMemory(state.householdId, { ...ledgerTarget, toHouseholdId: targetHouseholdId, toAccountId: targetAccountId, fromAccountId: accountId });
      await onLedgerTransferDone?.();
    } catch (submitError) {
      setError(toJapaneseError(submitError, "資金移動の登録に失敗しました。"));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    setType(initialType);
    setDate(initialDate);
    setCategoryId("");
    setAccountId("");
    setTransferToAccountId("");
    setCreditPostingMode("used");
    setError("");
  }, [initialDate, initialType]);

  const [savedTemplates, setSavedTemplates] = useState<TxTemplate[]>(() => loadTxTemplates(state.householdId));
  const [templateMessage, setTemplateMessage] = useState("");
  useEffect(() => {
    if (!templateMessage) return;
    const timer = window.setTimeout(() => setTemplateMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [templateMessage]);
  const frequentTemplates = useMemo(() => frequentTxTemplates(state, savedTemplates), [state, savedTemplates]);
  const templates = [...savedTemplates, ...frequentTemplates].filter((tpl) => tpl.type === type);

  function applyTemplate(tpl: TxTemplate) {
    setType(tpl.type);
    setCategoryId(tpl.categoryId ?? "");
    setAccountId(tpl.accountId);
    setTransferToAccountId(tpl.transferToAccountId ?? "");
    setAmount(tpl.amount ? String(tpl.amount) : "");
    setMemo(tpl.memo ?? "");
    const acc = state.accounts.find((a) => a.id === tpl.accountId);
    setCreditPostingMode(tpl.type === "expense" && acc?.type === "credit" ? "withdrawal" : "used");
    setError("");
  }

  function saveCurrentAsTemplate() {
    const value = Number(amount);
    if (!accountId || (type !== "transfer" && !categoryId)) {
      setError("テンプレートに保存するには、カテゴリと口座を選んでください。");
      return;
    }
    const label = memo.trim() || state.categories.find((c) => c.id === categoryId)?.name || transactionTypeLabel[type];
    const draftKey = txTemplateSignature({ type, categoryId: categoryId || undefined, accountId, transferToAccountId: transferToAccountId || undefined, memo });
    const duplicate = savedTemplates.find((tpl) => txTemplateSignature(tpl) === draftKey && tpl.amount === (value > 0 ? value : 0));
    if (duplicate) {
      setError("");
      setTemplateMessage(`「${duplicate.label}」はすでにテンプレートに保存されています。`);
      return;
    }
    const next: TxTemplate[] = [
      ...savedTemplates,
      { id: `tpl-${Date.now()}`, saved: true, label, type, amount: value > 0 ? value : 0, categoryId: categoryId || undefined, accountId, transferToAccountId: transferToAccountId || undefined, memo: memo || undefined }
    ];
    setSavedTemplates(next);
    storeTxTemplates(state.householdId, next);
    setError("");
    setTemplateMessage(`「${label}」をテンプレートに保存しました。次回から上のボタンで呼び出せます。`);
  }

  function removeTemplate(id: string) {
    const next = savedTemplates.filter((tpl) => tpl.id !== id);
    setSavedTemplates(next);
    storeTxTemplates(state.householdId, next);
  }

  function changeType(nextType: TransactionType) {
    setType(nextType);
    setCategoryId("");
    setAccountId("");
    setTransferToAccountId("");
    setCreditPostingMode("used");
    setError("");
  }

  async function submit(allowOverdraft = false) {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("金額を入力してください。");
      return;
    }
    if (isLedgerTransfer) {
      await submitLedgerTransfer(value, allowOverdraft);
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
    if (type === "transfer" && !allowOverdraft) {
      const info = overdraftFor(state, accountId, value, date);
      if (info) return setOverdraft(info);
    }
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
        <div className="section-title"><h2>記録する</h2><span className="num">{date.replace(/-/g, ".")}</span></div>
        <div className="segmented" role="tablist" aria-label="取引種別">
          {(["expense", "income", "transfer"] as TransactionType[]).map((item) => (
            <button className={type === item ? "selected" : ""} key={item} type="button" onClick={() => changeType(item)}>
              {transactionTypeLabel[item]}
            </button>
          ))}
        </div>
        {type === "transfer" && otherLedgers.length > 0 && (
          <div className="segmented compact transfer-scope" role="tablist" aria-label="移動先">
            <button type="button" className={transferScope === "self" ? "selected" : ""} onClick={() => { setTransferScope("self"); setError(""); }}>自分の口座間</button>
            <button type="button" className={transferScope === "ledger" ? "selected" : ""} onClick={() => { setTransferScope("ledger"); setError(""); }}>別の家計簿へ</button>
          </div>
        )}
        {!isLedgerTransfer && templates.length > 0 && (
          <div className="template-strip" aria-label="よく使う取引">
            {templates.map((tpl) => (
              <span key={tpl.id} className={`template-chip${tpl.saved ? " saved" : ""}`}>
                <button type="button" onClick={() => applyTemplate(tpl)}>
                  {tpl.saved && <Star size={12} />}
                  <span className="template-chip-label">{tpl.label}</span>
                  {tpl.amount > 0 && <small>{yen.format(tpl.amount)}</small>}
                </button>
                {tpl.saved && (
                  <button type="button" className="template-chip-remove" onClick={() => removeTemplate(tpl.id)} aria-label={`${tpl.label}を削除`}><X size={12} /></button>
                )}
              </span>
            ))}
          </div>
        )}
        <input className="amount-input" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="1" placeholder="0" required />
        {type !== "transfer" && (
          <CategoryPicker
            categories={state.categories}
            kind={type === "income" ? "income" : "expense"}
            value={categoryId}
            onChange={setCategoryId}
          />
        )}
        {isLedgerTransfer && (
          <div className="ledger-transfer">
            <div className="ledger-transfer-side">
              <div className="ledger-transfer-head"><span className="ledger-transfer-badge" style={{ background: coverColor(state.themeColor) }} />{state.householdName ?? "この家計簿"}<small>から</small></div>
              <label>移動元の口座<AccountSelect value={accountId} onChange={(nextId: string) => setAccountId(nextId)} accounts={sortAccountsByType(normalAccounts)} placeholder="選択してください" /></label>
              <CategoryPicker categories={state.categories} kind="expense" value={fromCategoryId} onChange={(id) => patchLedgerTarget({ fromCategoryId: id })} label="この家計簿のカテゴリ" optional />
              <label className="ledger-transfer-toggle">
                <input type="checkbox" checked={ledgerTarget.countAsExpense} onChange={(event) => patchLedgerTarget({ countAsExpense: event.target.checked })} />
                <span><b>この家計簿の支出として数える</b><small>{ledgerTarget.countAsExpense ? "移動した金額が、この家計簿の今月の支出に入ります。" : "支出には入れず、残高だけが動きます。"}</small></span>
              </label>
            </div>
            <div className="ledger-transfer-arrow" aria-hidden="true"><ArrowDown size={16} /></div>
            <div className="ledger-transfer-side">
              <div className="ledger-transfer-head"><span className="ledger-transfer-badge" style={{ background: coverColor(targetLedger?.themeColor) }} />{targetLedger?.name ?? "相手の家計簿"}<small>に入れる</small></div>
              {otherLedgers.length > 1 && (
                <div className="cat-chips">
                  {otherLedgers.map((ledger) => (
                    <button key={ledger.id} type="button" className={`cat-chip${ledger.id === targetHouseholdId ? " active" : ""}`} onClick={() => patchLedgerTarget({ toHouseholdId: ledger.id, toAccountId: "", toCategoryId: "" })}>
                      <span className="cat-chip-dot" style={{ background: coverColor(ledger.themeColor) }} />{ledger.name}
                    </button>
                  ))}
                </div>
              )}
              <label>移動先の口座{targetLoading ? <span className="account-select-placeholder ledger-loading">読み込み中…</span> : <AccountSelect value={targetAccountId} onChange={(nextId: string) => patchLedgerTarget({ toAccountId: nextId })} accounts={sortAccountsByType(targetAccounts)} placeholder="選択してください" />}</label>
              {targetCategories.some((category) => category.kind === "income") && (
                <CategoryPicker categories={targetCategories} kind="income" value={toCategoryId} onChange={(id) => patchLedgerTarget({ toCategoryId: id })} label={`${targetLedger?.name ?? "相手"}のカテゴリ`} optional />
              )}
              <label className="ledger-transfer-toggle">
                <input type="checkbox" checked={ledgerTarget.countAsIncome} onChange={(event) => patchLedgerTarget({ countAsIncome: event.target.checked })} />
                <span><b>{`${targetLedger?.name ?? "相手の家計簿"}の収入として数える`}</b><small>{ledgerTarget.countAsIncome ? "受け取った金額が、相手の家計簿の収入に入ります。" : "収入には入れず、残高だけが増えます。"}</small></span>
              </label>
            </div>
            <label>日付<input value={date} onChange={(event) => setDate(event.target.value)} type="date" /></label>
          </div>
        )}
        {!isLedgerTransfer && <div className="form-grid">
          <label>{type === "income" ? "入金先" : type === "transfer" ? "振替元" : "支払元"}<AccountSelect value={accountId} onChange={(nextId: string) => { setAccountId(nextId); if (nextId === transferToAccountId) setTransferToAccountId(""); const nextAccount = state.accounts.find((a) => a.id === nextId); setCreditPostingMode(type === "expense" && nextAccount?.type === "credit" ? "withdrawal" : "used"); }} accounts={sortAccountsByType(accountChoices)} placeholder="選択してください" /></label>
          {type === "transfer" && (
            <label>振替先<AccountSelect value={transferToAccountId} onChange={(nextId: string) => setTransferToAccountId(nextId)} accounts={normalAccounts.filter((account) => account.id !== accountId)} placeholder="選択してください" /></label>
          )}
          <label>{isCreditExpense ? "使用日" : "日付"}<input value={date} onChange={(event) => setDate(event.target.value)} type="date" /></label>
        </div>}
        {isCreditExpense && (
          <div className="credit-posting-mode">
            <span>計上する日付</span>
            <div className="segmented compact">
              <button className={creditPostingMode === "withdrawal" ? "selected" : ""} type="button" onClick={() => setCreditPostingMode("withdrawal")}>引落日</button>
              <button className={creditPostingMode === "used" ? "selected" : ""} type="button" onClick={() => setCreditPostingMode("used")}>使用日</button>
            </div>
            <small>{creditPostingMode === "withdrawal" ? `${nextWithdrawalDate(selectedAccount, date)} に収支へ反映します。` : "使用日に収支へ反映します。"}</small>
          </div>
        )}
        <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="メモ" />
        {error && <p className="form-error">{error}</p>}
        {overdraft
          ? <OverdraftConfirm info={overdraft} busy={submitting} onConfirm={() => submit(true)} onCancel={() => setOverdraft(null)} />
          : <button className="full-primary" type="submit" disabled={submitting}>{submitting ? "登録中…" : isLedgerTransfer ? "資金移動を登録する" : "登録する"}</button>}
        {isLedgerTransfer && <p className="settings-note">両方の家計簿に1件ずつ記録されます。金額・日付・メモはどちらから直しても両方に反映されます。</p>}
        {templateMessage && <p className="form-success" role="status"><Check size={14} /> {templateMessage}</p>}
        {!isLedgerTransfer && <button className="template-save" type="button" onClick={saveCurrentAsTemplate}><Star size={14} /> この内容をテンプレートに保存</button>}
      </form>
    </div>
  );
}

type OverdraftInfo = { accountName: string; balance: number; amount: number; date: string; recurring?: boolean };

// 口座（カード以外）から出ていく額が、その日の残高を超えるかどうか
function overdraftFor(state: LedgerState, accountId: string, amount: number, date: string, excludeTransactionId?: string, recurring = false): OverdraftInfo | null {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account || account.type === "credit" || !amount || !date) return null;
  const balance = accountBalanceOnDate(account, state, date, excludeTransactionId);
  return amount > balance ? { accountName: account.name, balance, amount, date, recurring } : null;
}

// 定期項目の次の実行日（今日以降、期間内）
function nextFixedOccurrenceDate(dueDay: number, effectiveFrom?: string, effectiveTo?: string) {
  const today = todayIso();
  let month = effectiveFrom && effectiveFrom.slice(0, 7) > today.slice(0, 7) ? effectiveFrom.slice(0, 7) : today.slice(0, 7);
  for (let i = 0; i < 3; i += 1) {
    const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const date = `${month}-${String(Math.min(Math.max(dueDay, 1), lastDay)).padStart(2, "0")}`;
    if (effectiveTo && month > effectiveTo.slice(0, 7)) return null;
    if (date >= today) return date;
    month = addMonthsKey(month, 1);
  }
  return null;
}

function OverdraftConfirm({ info, busy, onConfirm, onCancel }: { info: OverdraftInfo; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const after = info.balance - info.amount;
  return (
    <div className="overdraft-confirm" role="alertdialog" aria-label="残高がマイナスになります">
      <div className="overdraft-head"><AlertTriangle size={18} /><b>{info.accountName}の残高がマイナスになります</b></div>
      <dl className="overdraft-figures">
        <div><dt>{shortDate(info.date)}{info.recurring ? "（次回）" : ""}時点の残高</dt><dd className="num">{info.balance < 0 ? "−" : ""}{plainAmount(info.balance)}</dd></div>
        <div><dt>{info.recurring ? "毎月の振替額" : "振替額"}</dt><dd className="num">−{plainAmount(info.amount)}</dd></div>
        <div className="after"><dt>振替後</dt><dd className="num">−{plainAmount(Math.abs(after))}</dd></div>
      </dl>
      <p>予定している定期項目も含めた見込みの残高です。このまま登録しますか？</p>
      <div className="overdraft-actions">
        <button type="button" className="google-button" onClick={onCancel}>金額を見直す</button>
        <button type="button" className="full-primary danger" disabled={busy} onClick={onConfirm}>{busy ? "登録中…" : "このまま登録"}</button>
      </div>
    </div>
  );
}

type LedgerDestination = { toHouseholdId: string; toAccountId: string; fromCategoryId: string; toCategoryId: string; countAsExpense: boolean; countAsIncome: boolean };

// 別の家計簿への移動先（家計簿・口座・それぞれのカテゴリ・支出として数えるか）
function LedgerDestinationFields({ state, value, onChange, recurring = false }: { state: LedgerState; value: LedgerDestination; onChange: (next: LedgerDestination) => void; recurring?: boolean }) {
  const otherLedgers = (state.households ?? []).filter((ledger) => ledger.id !== state.householdId);
  const targetHouseholdId = otherLedgers.some((ledger) => ledger.id === value.toHouseholdId) ? value.toHouseholdId : otherLedgers[0]?.id ?? "";
  const targetLedger = otherLedgers.find((ledger) => ledger.id === targetHouseholdId);
  const [data, setData] = useState<{ householdId: string; accounts: LedgerState["accounts"]; categories: LedgerState["categories"] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (targetHouseholdId && value.toHouseholdId !== targetHouseholdId) onChange({ ...value, toHouseholdId: targetHouseholdId });
  }, [targetHouseholdId]);
  useEffect(() => {
    if (!targetHouseholdId || data?.householdId === targetHouseholdId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    loadLedgerAccountsAndCategories(targetHouseholdId)
      .then((next) => { if (!cancelled) setData({ householdId: targetHouseholdId, ...next }); })
      .catch((error) => { if (!cancelled) setLoadError(toJapaneseError(error, "相手の家計簿を読み込めませんでした。")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [targetHouseholdId]);
  const accounts = data?.householdId === targetHouseholdId ? data.accounts.filter((account) => account.type !== "credit") : [];
  const categories = data?.householdId === targetHouseholdId ? data.categories : [];
  return (
    <div className="ledger-transfer">
      <div className="ledger-transfer-side">
        <div className="ledger-transfer-head"><span className="ledger-transfer-badge" style={{ background: coverColor(targetLedger?.themeColor) }} />{targetLedger?.name ?? "相手の家計簿"}<small>に入れる</small></div>
        {otherLedgers.length > 1 && (
          <div className="cat-chips">
            {otherLedgers.map((ledger) => (
              <button key={ledger.id} type="button" className={`cat-chip${ledger.id === targetHouseholdId ? " active" : ""}`} onClick={() => onChange({ ...value, toHouseholdId: ledger.id, toAccountId: "", toCategoryId: "" })}>
                <span className="cat-chip-dot" style={{ background: coverColor(ledger.themeColor) }} />{ledger.name}
              </button>
            ))}
          </div>
        )}
        <label>移動先の口座{loading ? <span className="account-select-placeholder ledger-loading">読み込み中…</span> : <AccountSelect value={value.toAccountId} onChange={(nextId: string) => onChange({ ...value, toAccountId: nextId })} accounts={sortAccountsByType(accounts)} placeholder="選択してください" />}</label>
        {loadError && <p className="form-error">{loadError}</p>}
        {categories.some((category) => category.kind === "income") && (
          <CategoryPicker categories={categories} kind="income" value={value.toCategoryId} onChange={(id) => onChange({ ...value, toCategoryId: id })} label={`${targetLedger?.name ?? "相手"}のカテゴリ`} optional />
        )}
        <label className="ledger-transfer-toggle">
                <input type="checkbox" checked={value.countAsIncome} onChange={(event) => onChange({ ...value, countAsIncome: event.target.checked })} />
                <span><b>{`${targetLedger?.name ?? "相手の家計簿"}の収入として数える`}</b><small>{value.countAsIncome ? "受け取った金額が、相手の家計簿の収入に入ります。" : "収入には入れず、残高だけが増えます。"}</small></span>
              </label>
      </div>
      <CategoryPicker categories={state.categories} kind="expense" value={value.fromCategoryId} onChange={(id) => onChange({ ...value, fromCategoryId: id })} label="この家計簿のカテゴリ" optional />
      <label className="ledger-transfer-toggle">
        <input type="checkbox" checked={value.countAsExpense} onChange={(event) => onChange({ ...value, countAsExpense: event.target.checked })} />
        <span><b>この家計簿の支出として数える</b><small>{value.countAsExpense ? `移動した金額が、この家計簿の${recurring ? "毎月の" : ""}支出に入ります。` : "支出には入れず、残高だけが動きます。"}</small></span>
      </label>
    </div>
  );
}

type LedgerTransferMemory = { toHouseholdId: string; toAccountId: string; fromAccountId: string; fromCategoryId: string; toCategoryId: string; countAsExpense: boolean; countAsIncome: boolean };

function readLedgerTransferMemory(householdId?: string): LedgerTransferMemory {
  const empty: LedgerTransferMemory = { toHouseholdId: "", toAccountId: "", fromAccountId: "", fromCategoryId: "", toCategoryId: "", countAsExpense: true, countAsIncome: true };
  try {
    const raw = window.localStorage.getItem(`mirai-ledger-transfer:${householdId ?? "local"}`);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

function storeLedgerTransferMemory(householdId: string | undefined, memory: LedgerTransferMemory) {
  try { window.localStorage.setItem(`mirai-ledger-transfer:${householdId ?? "local"}`, JSON.stringify(memory)); } catch { /* 保存できなくても登録は続ける */ }
}

type TxTemplate = {
  id: string;
  saved?: boolean;
  label: string;
  type: TransactionType;
  amount: number;
  categoryId?: string;
  accountId: string;
  transferToAccountId?: string;
  memo?: string;
};

function txTemplateKey(householdId?: string) {
  return `mirai-ledger-templates-${householdId ?? "local"}`;
}

function loadTxTemplates(householdId?: string): TxTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(txTemplateKey(householdId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((tpl) => ({ ...tpl, saved: true })) : [];
  } catch {
    return [];
  }
}

function storeTxTemplates(householdId: string | undefined, templates: TxTemplate[]) {
  try {
    window.localStorage.setItem(txTemplateKey(householdId), JSON.stringify(templates));
  } catch {
    // ignore storage errors (private mode etc.)
  }
}

function templateFromTransaction(tx: Transaction, state: LedgerState): TxTemplate {
  const category = state.categories.find((c) => c.id === tx.categoryId);
  return {
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    saved: true,
    label: tx.memo?.trim() || category?.name || transactionTypeLabel[tx.type],
    type: tx.type,
    amount: tx.amount,
    categoryId: tx.type === "transfer" ? undefined : tx.categoryId,
    accountId: tx.accountId,
    transferToAccountId: tx.type === "transfer" ? tx.transferToAccountId : undefined,
    memo: tx.memo?.trim() || undefined
  };
}

// 取引をテンプレートとして保存する。同じ内容が既にあれば保存せず既存のものを返す
function saveTransactionAsTemplate(tx: Transaction, state: LedgerState): { template: TxTemplate; duplicate: boolean } {
  const current = loadTxTemplates(state.householdId);
  const template = templateFromTransaction(tx, state);
  const existing = current.find((tpl) => txTemplateSignature(tpl) === txTemplateSignature(template) && tpl.amount === template.amount);
  if (existing) return { template: existing, duplicate: true };
  storeTxTemplates(state.householdId, [...current, template]);
  return { template, duplicate: false };
}

function txTemplateSignature(tpl: { type: TransactionType; categoryId?: string; accountId: string; transferToAccountId?: string; memo?: string }) {
  return [tpl.type, tpl.categoryId ?? "", tpl.accountId, tpl.transferToAccountId ?? "", (tpl.memo ?? "").trim()].join("|");
}

// 直近300件の取引から「よく使う組み合わせ」を自動で抽出する
function frequentTxTemplates(state: LedgerState, saved: TxTemplate[], limit = 6): TxTemplate[] {
  const groups = new Map<string, { count: number; latest: Transaction }>();
  const recent = [...state.transactions].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date)).slice(0, 300);
  for (const tx of recent) {
    if (!state.accounts.some((a) => a.id === tx.accountId)) continue;
    const key = [tx.type, tx.categoryId ?? "", tx.accountId, tx.transferToAccountId ?? "", (tx.memo ?? "").trim()].join("|");
    const current = groups.get(key);
    if (!current) groups.set(key, { count: 1, latest: tx });
    else {
      current.count += 1;
      if ((tx.createdAt ?? tx.date) > (current.latest.createdAt ?? current.latest.date)) current.latest = tx;
    }
  }
  const savedKeys = new Set(saved.map((tpl) => txTemplateSignature(tpl)));
  return Array.from(groups.entries())
    .filter(([key, group]) => group.count >= 2 && !savedKeys.has(key))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([key, { latest }]) => {
      const category = state.categories.find((c) => c.id === latest.categoryId);
      return {
        id: `auto-${key}`,
        label: latest.memo?.trim() || category?.name || transactionTypeLabel[latest.type],
        type: latest.type,
        amount: latest.amount,
        categoryId: latest.categoryId,
        accountId: latest.accountId,
        transferToAccountId: latest.transferToAccountId,
        memo: latest.memo
      };
    });
}

function TemplateSettings({ state, setNotice }: { state: LedgerState; setNotice: (message: string) => void }) {
  const [templates, setTemplates] = useState<TxTemplate[]>(() => loadTxTemplates(state.householdId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TxTemplate | null>(null);
  const [formError, setFormError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyLimit, setHistoryLimit] = useState(20);

  // 取引履歴（同じ内容は最新の1件にまとめる）
  const historyRows = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    const seen = new Set<string>();
    const rows: Transaction[] = [];
    const sorted = [...state.transactions].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date));
    for (const tx of sorted) {
      const key = `${txTemplateSignature(tx)}|${tx.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (q) {
        const cat = state.categories.find((c) => c.id === tx.categoryId)?.name ?? "";
        const acc = state.accounts.find((a) => a.id === tx.accountId)?.name ?? "";
        if (![tx.memo ?? "", cat, acc, String(tx.amount)].some((v) => v.toLowerCase().includes(q))) continue;
      }
      rows.push(tx);
    }
    return rows;
  }, [state.transactions, state.categories, state.accounts, historyQuery]);
  const savedSignatures = new Set(templates.map((tpl) => `${txTemplateSignature(tpl)}|${tpl.amount}`));

  function addFromHistory(tx: Transaction) {
    const { template, duplicate } = saveTransactionAsTemplate(tx, state);
    setTemplates(loadTxTemplates(state.householdId));
    setNotice(duplicate ? `「${template.label}」はすでに保存されています。` : `「${template.label}」をテンプレートに追加しました。`);
  }

  useEffect(() => {
    setTemplates(loadTxTemplates(state.householdId));
    setEditingId(null);
    setDraft(null);
  }, [state.householdId]);

  function persist(next: TxTemplate[]) {
    setTemplates(next);
    storeTxTemplates(state.householdId, next);
  }

  function emptyDraft(): TxTemplate {
    const firstAccount = state.accounts.find((a) => a.type !== "credit") ?? state.accounts[0];
    return { id: `tpl-${Date.now()}`, saved: true, label: "", type: "expense", amount: 0, accountId: firstAccount?.id ?? "", memo: "" };
  }

  function startNew() {
    setEditingId("new");
    setDraft(emptyDraft());
    setFormError("");
  }

  function startEdit(tpl: TxTemplate) {
    setEditingId(tpl.id);
    setDraft({ ...tpl });
    setFormError("");
  }

  function cancel() {
    setEditingId(null);
    setDraft(null);
    setFormError("");
  }

  function save() {
    if (!draft) return;
    if (draft.type !== "transfer" && !draft.categoryId) return setFormError("カテゴリを選んでください。");
    if (!draft.accountId) return setFormError("口座を選んでください。");
    if (draft.type === "transfer" && (!draft.transferToAccountId || draft.transferToAccountId === draft.accountId)) return setFormError("振替先は振替元と別の口座を選んでください。");
    const label = draft.label.trim() || draft.memo?.trim() || state.categories.find((c) => c.id === draft.categoryId)?.name || transactionTypeLabel[draft.type];
    const cleaned: TxTemplate = {
      ...draft,
      label,
      amount: draft.amount > 0 ? draft.amount : 0,
      categoryId: draft.type === "transfer" ? undefined : draft.categoryId,
      transferToAccountId: draft.type === "transfer" ? draft.transferToAccountId : undefined,
      memo: draft.memo?.trim() || undefined
    };
    const next = editingId === "new" ? [...templates, cleaned] : templates.map((tpl) => (tpl.id === editingId ? cleaned : tpl));
    persist(next);
    setNotice(editingId === "new" ? `テンプレート「${label}」を追加しました。` : `テンプレート「${label}」を更新しました。`);
    cancel();
  }

  function remove(tpl: TxTemplate) {
    persist(templates.filter((t) => t.id !== tpl.id));
    setNotice(`テンプレート「${tpl.label}」を削除しました。`);
    if (editingId === tpl.id) cancel();
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= templates.length) return;
    const next = [...templates];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  function describe(tpl: TxTemplate) {
    const account = state.accounts.find((a) => a.id === tpl.accountId)?.name ?? "口座未設定";
    if (tpl.type === "transfer") {
      const to = state.accounts.find((a) => a.id === tpl.transferToAccountId)?.name ?? "?";
      return `振替・${account} → ${to}`;
    }
    const category = state.categories.find((c) => c.id === tpl.categoryId);
    const parent = category?.parentId ? state.categories.find((c) => c.id === category.parentId) : undefined;
    return `${transactionTypeLabel[tpl.type]}・${parent ? `${parent.name} › ` : ""}${category?.name ?? "カテゴリ未設定"}・${account}`;
  }

  const form = draft && (
    <div className="crud-form template-form">
      <label>種類
        <div className="segmented compact">
          {(["expense", "income", "transfer"] as TransactionType[]).map((kind) => (
            <button key={kind} type="button" className={draft.type === kind ? "selected" : ""} onClick={() => setDraft({ ...draft, type: kind, categoryId: undefined, transferToAccountId: undefined, accountId: kind === "expense" ? draft.accountId : (state.accounts.find((a) => a.id === draft.accountId)?.type === "credit" ? state.accounts.find((a) => a.type !== "credit")?.id ?? "" : draft.accountId) })}>
              {transactionTypeLabel[kind]}
            </button>
          ))}
        </div>
      </label>
      <label>ボタンの名前<input placeholder="例: ランチ / コンビニ / 給料" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
      <label>金額（空欄なら毎回入力）<input type="number" inputMode="numeric" min="0" value={numberInputValue(draft.amount)} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value || 0) })} /></label>
      {draft.type !== "transfer" && (
        <label>カテゴリ<select value={draft.categoryId ?? ""} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || undefined })}>
          <option value="">選択してください</option>
          <CategoryOptions categories={state.categories} kind={draft.type === "income" ? "income" : "expense"} />
        </select></label>
      )}
      <label>{draft.type === "income" ? "入金先" : draft.type === "transfer" ? "振替元" : "支払元"}<AccountSelect value={draft.accountId} onChange={(nextId: string) => setDraft({ ...draft, accountId: nextId })} accounts={sortAccountsByType(draft.type === "expense" ? state.accounts : state.accounts.filter((a) => a.type !== "credit"))} placeholder="選択してください" /></label>
      {draft.type === "transfer" && (
        <label>振替先<AccountSelect value={draft.transferToAccountId ?? ""} onChange={(nextId: string) => setDraft({ ...draft, transferToAccountId: nextId || undefined })} accounts={state.accounts.filter((a) => a.type !== "credit" && a.id !== draft.accountId)} placeholder="選択してください" /></label>
      )}
      <label>メモ（任意）<input placeholder="取引に入るメモ" value={draft.memo ?? ""} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} /></label>
      {formError && <p className="form-error">{formError}</p>}
      <div className="template-form-actions">
        <button className="full-primary" type="button" onClick={save}>{editingId === "new" ? "追加する" : "保存する"}</button>
        <button className="ghost-btn" type="button" onClick={cancel}>キャンセル</button>
      </div>
    </div>
  );

  return (
    <section className="panel">
      <p className="setting-copy">よく使う取引を登録しておくと、クイック入力（下の＋）の上部にボタンで表示され、1タップで内容を入力できます。この端末に保存されます。</p>
      {editingId !== "new" && (
        <div className="template-add-buttons">
          <button className="full-primary" type="button" onClick={() => { startNew(); setShowHistory(false); }}><Plus size={16} /> 新しく作る</button>
          <button className="ghost-btn" type="button" onClick={() => setShowHistory((v) => !v)}><Receipt size={16} /> {showHistory ? "履歴を閉じる" : "履歴から追加"}</button>
        </div>
      )}
      {editingId === "new" && form}
      {showHistory && editingId !== "new" && (
        <div className="template-history">
          <input type="search" placeholder="メモ・カテゴリ・口座・金額で検索" value={historyQuery} onChange={(e) => { setHistoryQuery(e.target.value); setHistoryLimit(20); }} />
          {historyRows.length === 0 && <div className="empty-state">該当する取引がありません。</div>}
          {historyRows.slice(0, historyLimit).map((tx) => {
            const added = savedSignatures.has(`${txTemplateSignature(tx)}|${tx.amount}`);
            const label = tx.memo?.trim() || state.categories.find((c) => c.id === tx.categoryId)?.name || transactionTypeLabel[tx.type];
            return (
              <div key={tx.id} className="template-row">
                <div className="template-row-main">
                  <strong>{label}</strong>
                  <small>{tx.date}・{describe({ ...templateFromTransaction(tx, state) })}</small>
                </div>
                <span className="template-row-amount">{yen.format(tx.amount)}</span>
                <button type="button" className={added ? "mini-button" : "mini-button-active"} disabled={added} onClick={() => addFromHistory(tx)}>{added ? "保存済み" : "追加"}</button>
              </div>
            );
          })}
          {historyRows.length > historyLimit && (
            <button className="ghost-btn" type="button" onClick={() => setHistoryLimit((n) => n + 20)}>さらに表示（残り {historyRows.length - historyLimit} 件）</button>
          )}
        </div>
      )}
      {templates.length === 0 && editingId !== "new" && (
        <div className="empty-state"><div className="empty-illustration"><Star size={20} /></div>まだテンプレートがありません。</div>
      )}
      <div className="template-list">
        {templates.map((tpl, index) => (
          <div key={tpl.id} className="template-row-wrap">
            <div className="template-row">
              <div className="template-row-main">
                <strong><Star size={13} /> {tpl.label}</strong>
                <small>{describe(tpl)}</small>
              </div>
              <span className="template-row-amount">{tpl.amount > 0 ? yen.format(tpl.amount) : "金額なし"}</span>
              <div className="template-row-actions">
                <button type="button" className="icon-button" aria-label="上へ" disabled={index === 0} onClick={() => move(index, -1)}><ChevronLeft size={16} style={{ transform: "rotate(90deg)" }} /></button>
                <button type="button" className="icon-button" aria-label="下へ" disabled={index === templates.length - 1} onClick={() => move(index, 1)}><ChevronRight size={16} style={{ transform: "rotate(90deg)" }} /></button>
                <button type="button" className="mini-button" onClick={() => (editingId === tpl.id ? cancel() : startEdit(tpl))}>{editingId === tpl.id ? "閉じる" : "編集"}</button>
                <button type="button" className="mini-button danger-text" onClick={() => remove(tpl)}>削除</button>
              </div>
            </div>
            {editingId === tpl.id && form}
          </div>
        ))}
      </div>
    </section>
  );
}

function CategoryOptions({ categories, kind }: { categories: LedgerState["categories"]; kind: "expense" | "income" }) {
  const parents = sortCategories(categories.filter((category) => !category.parentId && category.kind === kind));
  return (
    <>
      {parents.map((parent) => {
        const children = sortSubcategories(categories.filter((category) => category.parentId === parent.id && category.kind === kind));
        const hasChildren = children.length > 0;
        return (
          <optgroup key={parent.id} label={parent.name}>
            {!hasChildren && <option value={parent.id}>{parent.name}</option>}
            {children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

// チップが多いときは最大2行にして横スクロール（少ないときは折り返し）
function ChipRows({ className, children, activeKey, resetKey }: { className: string; children: React.ReactNode; activeKey?: string; resetKey?: string }) {
  const items = Children.toArray(children).filter(Boolean);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollable = items.length > 6;
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    // 選択中のチップが見えるように（縦にはスクロールさせない）
    const target = activeKey ? box.querySelector<HTMLElement>(`[data-chip="${CSS.escape(activeKey)}"]`) : null;
    if (!target) { box.scrollLeft = 0; return; }
    const left = target.offsetLeft - box.clientWidth / 2 + target.offsetWidth / 2;
    box.scrollLeft = Math.max(0, left);
  }, [scrollable, resetKey]);
  if (!scrollable) return <div className={className}>{items}</div>;
  const half = Math.ceil(items.length / 2);
  return (
    <div className={`${className} chip-rows`}>
      <div className="chip-rows-scroll" ref={scrollRef}>
        <div className="chip-rows-line">{items.slice(0, half)}</div>
        <div className="chip-rows-line">{items.slice(half)}</div>
      </div>
    </div>
  );
}

function CategoryPicker({
  categories,
  kind,
  value,
  onChange,
  label = "カテゴリー",
  optional = false
}: {
  categories: LedgerState["categories"];
  kind: "expense" | "income";
  value: string;
  onChange: (id: string) => void;
  label?: string;
  optional?: boolean;
}) {
  const parents = sortCategories(categories.filter((c) => !c.parentId && c.kind === kind));
  const selectedCat = categories.find((c) => c.id === value);
  const initParentId = selectedCat ? (selectedCat.parentId ?? selectedCat.id) : "";
  const [selectedParentId, setSelectedParentId] = useState(initParentId);
  // 外部から value が変わったとき（テンプレート適用など）に親カテゴリも追従させる
  useEffect(() => {
    if (initParentId && initParentId !== selectedParentId) setSelectedParentId(initParentId);
  }, [initParentId]);

  const children = selectedParentId
    ? sortSubcategories(categories.filter((c) => c.parentId === selectedParentId && c.kind === kind))
    : [];

  function handleParentClick(parentId: string) {
    const hasChildren = categories.some((c) => c.parentId === parentId && c.kind === kind);
    if (parentId !== selectedParentId) {
      setSelectedParentId(parentId);
      if (!hasChildren) {
        onChange(parentId);
      } else {
        onChange("");
      }
    }
  }

  const selectedParent = parents.find((p) => p.id === selectedParentId);
  const selectedChild = children.find((c) => c.id === value);

  return (
    <div className="category-picker">
      <div className="cat-pick-label">{label}{value ? <span className="cat-selected-text">{selectedParent?.name}{selectedChild ? ` › ${selectedChild.name}` : ""}</span> : optional ? <span className="cat-selected-text muted">なし</span> : null}</div>
      <ChipRows className="cat-chips" activeKey={selectedParentId || (optional ? "none" : "")}>
        {optional && (
          <button key="none" data-chip="none" type="button" className={`cat-chip none${!selectedParentId ? " active" : ""}`} onClick={() => { setSelectedParentId(""); onChange(""); }}>なし</button>
        )}
        {parents.map((parent) => (
          <button
            key={parent.id}
            data-chip={parent.id}
            type="button"
            className={`cat-chip${selectedParentId === parent.id ? " active" : ""}`}
            style={{ "--cat-color": parent.color } as React.CSSProperties}
            onClick={() => handleParentClick(parent.id)}
          >
            <span className="cat-chip-dot" style={{ background: parent.color }} />
            {parent.name}
          </button>
        ))}
      </ChipRows>
      {children.length > 0 && (
        <ChipRows className="cat-chips sub" activeKey={value} resetKey={selectedParentId}>
          {children.map((child) => (
            <button
              key={child.id}
              data-chip={child.id}
              type="button"
              className={`cat-chip sub${value === child.id ? " active" : ""}`}
              onClick={() => onChange(child.id)}
            >
              {child.name}
            </button>
          ))}
        </ChipRows>
      )}
    </div>
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


// ============================================================
// 回数が決まっている定期項目（ローン・分割払い）
// 「指定月以降だけ変更」で分割されたレコードも、名前・種類が同じで期間が続いていれば1つの支払いとして数える
// ============================================================
type InstallmentInfo = {
  chainIds: string[];
  startMonth: string;
  endMonth: string;
  total: number;
  paid: number;
  remaining: number;
  remainingAmount: number;
  nthOf: (month: string) => number | null;
};

function monthsBetweenInclusive(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

function addMonthsKey(monthKey: string, delta: number) {
  return shiftMonthKey(monthKey, delta);
}

function fixedCostChain(state: LedgerState, cost: FixedCost) {
  const same = state.fixedCosts.filter((item) => item.name === cost.name && item.kind === cost.kind && item.effectiveFrom);
  const chain: FixedCost[] = [cost];
  // 前へたどる
  let head = cost;
  for (;;) {
    const from = head.effectiveFrom?.slice(0, 7);
    if (!from) break;
    const prev = same.find((item) => item.id !== head.id && !chain.includes(item) && item.effectiveTo && addMonthsKey(item.effectiveTo.slice(0, 7), 1) === from);
    if (!prev) break;
    chain.unshift(prev);
    head = prev;
  }
  // 後ろへたどる
  let tail = cost;
  for (;;) {
    const to = tail.effectiveTo?.slice(0, 7);
    if (!to) break;
    const next = same.find((item) => item.id !== tail.id && !chain.includes(item) && item.effectiveFrom?.slice(0, 7) === addMonthsKey(to, 1));
    if (!next) break;
    chain.push(next);
    tail = next;
  }
  return chain;
}

function installmentInfo(state: LedgerState, costOrOccurrence: FixedCost, today = todayIso()): InstallmentInfo | null {
  // 「この月だけ変更」で名前が変わっていても元の定期項目でたどる
  const cost = state.fixedCosts.find((item) => item.id === costOrOccurrence.id) ?? costOrOccurrence;
  if (!cost.effectiveTo) {
    const hasLater = state.fixedCosts.some((item) => item.name === cost.name && item.kind === cost.kind && item.effectiveTo);
    if (!hasLater) return null;
  }
  const chain = fixedCostChain(state, cost);
  const first = chain[0];
  const last = chain[chain.length - 1];
  if (!first.effectiveFrom || !last.effectiveTo) return null;
  const startMonth = first.effectiveFrom.slice(0, 7);
  const endMonth = last.effectiveTo.slice(0, 7);
  if (endMonth < startMonth) return null;
  const months: Array<{ month: string; amount: number; date: string }> = [];
  for (let month = startMonth; month <= endMonth; month = addMonthsKey(month, 1)) {
    // 支払日を別の月に変えた分も「もともとの月の回」として数える
    const cost = chain.find((item) => isFixedCostActiveInMonth(item, month));
    if (!cost) continue;
    const override = state.fixedCostOverrides?.find((item) => item.fixedCostId === cost.id && item.month === month);
    if (override?.skipped) continue;
    const dueDay = override?.dueDay ?? cost.dueDay;
    months.push({ month, amount: override?.amount ?? cost.amount, date: override?.payDate ?? `${month}-${String(Math.min(dueDay, lastDayOfMonth(month))).padStart(2, "0")}` });
  }
  const paidRows = months.filter((row) => row.date <= today);
  const remainingRows = months.filter((row) => row.date > today);
  const index = new Map(months.map((row, i) => [row.month, i + 1]));
  return {
    chainIds: chain.map((item) => item.id),
    startMonth,
    endMonth,
    total: months.length,
    paid: paidRows.length,
    remaining: remainingRows.length,
    remainingAmount: remainingRows.reduce((sum, row) => sum + row.amount, 0),
    nthOf: (month: string) => index.get(month) ?? null
  };
}

// 税金・社会保険は1期ずつ別の定期項目なので、同じ種類・同じ年度の期をまとめて数える
function taxInstallmentLabel(state: LedgerState, costOrOccurrence: FixedCost) {
  const cost = state.fixedCosts.find((item) => item.id === costOrOccurrence.id) ?? costOrOccurrence;
  if (!isTaxInstallment(cost)) return "";
  const year = fiscalStartYear(cost.effectiveFrom!.slice(0, 7));
  const group = state.fixedCosts
    .filter((item) => item.taxKind === cost.taxKind && isTaxInstallment(item) && fiscalStartYear(item.effectiveFrom!.slice(0, 7)) === year)
    .sort((a, b) => a.effectiveFrom!.slice(0, 7).localeCompare(b.effectiveFrom!.slice(0, 7)) || a.dueDay - b.dueDay || a.name.localeCompare(b.name, "ja", { numeric: true }));
  const nth = group.findIndex((item) => item.id === cost.id) + 1;
  if (!nth) return "";
  return nth === group.length ? `最終回 ${nth}/${group.length}回` : `${nth}/${group.length}回目`;
}

function fixedRowTag(state: LedgerState, row: FixedCostOccurrence) {
  if (row.kind === "income" || row.taxKind === "pension") return "";
  if (isTaxInstallment(row)) return taxInstallmentLabel(state, row);
  const info = installmentInfo(state, row);
  return info ? installmentLabel(info, row.occurrenceMonth) : "";
}

function installmentLabel(info: InstallmentInfo, month: string) {
  const nth = info.nthOf(month);
  if (!nth) return "";
  return nth === info.total ? `最終回 ${nth}/${info.total}回` : `${nth}/${info.total}回目`;
}

// 回数 ⇄ 最終支払月 のどちらでも入力できる欄
function InstallmentFields({ startMonth, endMonth, onChange, label = "支払いの終わり" }: { startMonth: string; endMonth?: string; onChange: (endMonth: string | undefined) => void; label?: string }) {
  const finite = Boolean(endMonth);
  const count = endMonth ? Math.max(monthsBetweenInclusive(startMonth, endMonth), 0) : 0;
  const [countDraft, setCountDraft] = useState(count ? String(count) : "");
  useEffect(() => { setCountDraft(count ? String(count) : ""); }, [startMonth, endMonth]);
  return (
    <div className="installment-fields">
      <span className="installment-label">{label}</span>
      <div className="segmented compact">
        <button type="button" className={!finite ? "selected" : ""} onClick={() => onChange(undefined)}>ずっと続く</button>
        <button type="button" className={finite ? "selected" : ""} onClick={() => onChange(endMonth ?? addMonthsKey(startMonth, 11))}>終わりがある</button>
      </div>
      {finite && (
        <div className="installment-inputs">
          <label>支払回数
            <span className="installment-count">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={countDraft}
                onChange={(event) => {
                  setCountDraft(event.target.value);
                  const value = Number(event.target.value);
                  if (value >= 1) onChange(addMonthsKey(startMonth, value - 1));
                }}
              />回
            </span>
          </label>
          <label>最終支払月
            <input type="month" value={endMonth ?? ""} min={startMonth} onChange={(event) => { if (event.target.value) onChange(event.target.value); }} />
          </label>
          <p className="sheet-hint">{formatMonthLabel(startMonth)}から{formatMonthLabel(endMonth!)}まで、全{count}回。どちらを入力しても、もう片方は自動で入ります。</p>
        </div>
      )}
    </div>
  );
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
  setSelectedDate,
  hideMonthNav
}: {
  state: LedgerState;
  setNotice: (message: string) => void;
  reload: () => Promise<void>;
  onQuick: (date: string) => void;
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  selectedDate: string;
  setSelectedDate: (value: string) => void;
  hideMonthNav?: boolean;
}) {
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useWeekStart();
  const monthKey = selectedMonth;
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const days = new Date(year, month, 0).getDate();
  const rawFirstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  // weekStart=0: Sun始まり, weekStart=1: Mon始まり
  const blankCount = weekStart === 1 ? (rawFirstDay - 1 + 7) % 7 : rawFirstDay;
  const monthRows = state.transactions.filter((transaction) => transactionLedgerDate(transaction).startsWith(monthKey));
  const fixedRows = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state);
  const monthIncome = monthlyIncome(monthRows) + fixedRows.filter((row) => row.kind === "income").reduce((sum, row) => sum + row.amount, 0);
  const fixedExpense = fixedRows.filter((row) => row.kind === "expense").reduce((sum, row) => sum + row.amount, 0);
  const monthExpense = monthlyExpense(monthRows) + fixedExpense;

  function moveMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(nextKey);
    setSelectedDate(`${nextKey}-01`);
  }

  const today = todayIso();
  // 曜日ヘッダー（週始まりに応じて並び替え）
  const dayHeaders = weekStart === 1
    ? ["月", "火", "水", "木", "金", "土", "日"]
    : ["日", "月", "火", "水", "木", "金", "土"];
  // ヘッダーの色クラス（土=青, 日=赤）
  const headerColorClass = (label: string) => label === "土" ? "col-sat" : label === "日" ? "col-sun" : "";

  return (
    <div className="view-stack">
      <section className="panel calendar-card">
        {!hideMonthNav && (
          <div className="calendar-head">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="前月"><ChevronLeft size={16} /></button>
            <strong>{formatMonthLabel(monthKey)}のカレンダー</strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="翌月"><ChevronRight size={16} /></button>
          </div>
        )}
        <div className="month-summary">
          <span>収入<strong>{plainAmount(monthIncome)}</strong></span>
          <span>支出<strong>{plainAmount(monthExpense)}</strong></span>
          <span>収支<strong className={monthIncome - monthExpense >= 0 ? "pos" : "neg"}>{monthIncome - monthExpense > 0 ? "+" : monthIncome - monthExpense < 0 ? "−" : ""}{plainAmount(monthIncome - monthExpense)}</strong></span>
        </div>
        <div className="calendar-grid">
          {dayHeaders.map((day) => <b key={day} className={headerColorClass(day)}>{day}</b>)}
          {Array.from({ length: blankCount }).map((_, index) => <i key={`blank-${index}`} />)}
          {Array.from({ length: days }).map((_, index) => {
            const day = String(index + 1).padStart(2, "0");
            const date = `${monthKey}-${day}`;
            const dow = new Date(year, month - 1, index + 1).getDay(); // 0=Sun, 6=Sat
            const isHoliday = isJapaneseHoliday(date);
            const dayColorClass = dow === 6 ? "day-sat" : (dow === 0 || isHoliday) ? "day-hol" : "";
            const income = monthRows.filter((transaction) => transactionLedgerDate(transaction) === date && transaction.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
            const expense = monthRows.filter((transaction) => transactionLedgerDate(transaction) === date && transaction.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
            const transfer = monthRows.filter((transaction) => transactionLedgerDate(transaction) === date && transaction.type === "transfer").reduce((sum, tx) => sum + tx.amount, 0);
            const fixedIncome = fixedRows.filter((row) => row.date === date && row.kind === "income").reduce((sum, row) => sum + row.amount, 0);
            const fixed = fixedRows.filter((row) => row.date === date && row.kind === "expense").reduce((sum, row) => sum + row.amount, 0);
            const fixedTransfer = fixedRows.filter((row) => row.date === date && row.kind === "transfer").reduce((sum, row) => sum + row.amount, 0);
            const classes = [date === selectedDate ? "selected-day" : "", date === today ? "today" : ""].filter(Boolean).join(" ");
            return <button className={classes} key={date} type="button" onClick={() => { setSelectedDate(date); setModalDate(date); }}><strong className={dayColorClass}>{index + 1}</strong>{income + fixedIncome > 0 && <span className="income-mini">+{yenShort(income + fixedIncome)}</span>}{expense > 0 && <span>-{yenShort(expense)}</span>}{fixed > 0 && <span className="fixed-mini">{yenShort(fixed)}</span>}{transfer + fixedTransfer > 0 && <span className="transfer-mini">{yenShort(transfer + fixedTransfer)}</span>}</button>;
          })}
        </div>
      </section>
      {modalDate && <CalendarDayModal date={modalDate} state={state} setNotice={setNotice} reload={reload} onClose={() => setModalDate(null)} onQuick={(date) => { setModalDate(null); onQuick(date); }} />}
    </div>
  );
}

function yenShort(amount: number) {
  if (amount >= 10000) return `${(amount / 10000).toFixed(amount >= 100000 ? 0 : 1)}万`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}千`;
  return `${amount}`;
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
  const [draft, setDraft] = useState({ name: row.name, amount: row.amount, categoryId: row.categoryId, accountId: row.accountId, transferToAccountId: row.transferToAccountId ?? "", dueDay: row.dueDay, memo: row.overrideMemo ?? "" });
  const meta = fixedKindMeta(row.kind);
  return (
    <article className="fixed-occurrence-row">
      <div className="tx-lead kind fixed">定期</div>
      <div><strong>{row.name}{(row.taxKind === "pension" || row.payDateMoved) && <> {monthNumber(row.occurrenceMonth)}月分</>}{(() => { const label = fixedRowTag(state, row); return label ? <em className={`installment-tag${label.startsWith("最終回") ? " last" : ""}`}>{label}</em> : null; })()}</strong><span>{row.transferGroupId ? fixedLedgerLine(row, account?.name) : row.kind === "transfer" ? `${account?.name ?? "未設定"} → ${transferToAccount?.name ?? "未設定"}` : `${categoryPathLabel(state, row.categoryId) || category?.name || "未設定"}／${account?.name ?? "未設定"}`}</span>{row.memo && <small className={`fixed-memo${row.overrideMemo ? " this-month" : ""}`}>{row.overrideMemo ? "今月：" : ""}{row.memo}</small>}</div>
      <em className={row.transferDirection === "in" ? "income" : meta.className}>{row.kind === "income" || row.transferDirection === "in" ? "+" : ""}{plainAmount(row.amount)}</em>
      {setNotice && reload && <button className="mini-button" type="button" onClick={() => setEditing(!editing)}>この月だけ変更</button>}
      {editing && (
        <div className="fixed-override-form">
          <label>名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>金額<input type="number" value={numberInputValue(draft.amount)} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value || 0) })} /></label>
          {row.kind !== "transfer" && !row.transferGroupId && <label>カテゴリ<select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><CategoryOptions categories={state.categories} kind={row.kind} /></select></label>}
          {row.transferGroupId && <p className="settings-note">金額・日付・メモは相手の家計簿（{row.counterpartyHouseholdName ?? "別の家計簿"}）にも反映されます。</p>}
          <label>{row.transferGroupId ? (row.transferDirection === "in" ? "入ってくる口座" : "移動元の口座") : row.kind === "income" ? "入金先" : row.kind === "transfer" ? "振替元" : "支払元"}<AccountSelect value={draft.accountId} onChange={(nextId: string) => setDraft({ ...draft, accountId: nextId, transferToAccountId: nextId === draft.transferToAccountId ? "" : draft.transferToAccountId })} accounts={sortAccountsByType(state.accounts.filter((accountItem) => row.kind === "expense" || accountItem.type !== "credit"))} /></label>
          {row.kind === "transfer" && !row.transferGroupId && <label>振替先<AccountSelect value={draft.transferToAccountId} onChange={(nextId: string) => setDraft({ ...draft, transferToAccountId: nextId })} accounts={state.accounts.filter((accountItem) => accountItem.type !== "credit" && accountItem.id !== draft.accountId)} placeholder="選択してください" /></label>}
          <label>日付<input type="number" min="1" max="31" value={numberInputValue(draft.dueDay)} onChange={(event) => setDraft({ ...draft, dueDay: Number(event.target.value || 0) })} /></label>
          <label className="fixed-override-memo">この月のメモ<textarea className="memo-input" rows={2} placeholder="例: 今月は電気代が高かった／更新料込み" value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} /></label>
          <button type="button" onClick={async () => {
            try {
              if (row.transferGroupId) {
                await upsertLedgerFixedOverride({ groupId: row.transferGroupId, householdId: state.householdId ?? "", month: row.occurrenceMonth, name: draft.name, amount: draft.amount, dueDay: draft.dueDay, accountId: draft.accountId, categoryId: row.categoryId || undefined });
                if (draft.memo.trim() || row.overrideMemo) await saveLedgerFixedMemo(row.transferGroupId, draft.memo.trim(), row.occurrenceMonth);
                await reload?.();
                setEditing(false);
                setNotice?.("選択月のみ変更しました（相手の家計簿にも反映）。");
                return;
              }
              if (row.kind === "transfer" && !draft.transferToAccountId) {
                setNotice?.("振替先を選択してください。");
                return;
              }
              await upsertFixedCostOverride(state.householdId ?? "", row.id, row.occurrenceMonth, { ...draft, memo: draft.memo.trim() || row.overrideMemo ? draft.memo.trim() : undefined });
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

function TransactionsView({ state, monthKey, setNotice, reload, onQuick }: { state: LedgerState; monthKey: string; setNotice: (message: string) => void; reload: () => Promise<void>; onQuick: (date?: string, type?: TransactionType) => void }) {
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | TransactionType>("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [periodMode, setPeriodMode] = useState<"month" | "all">("month");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const filteredTx = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.transactions.filter((tx) => {
      if (periodMode === "month" && !transactionLedgerDate(tx).startsWith(monthKey)) return false;
      if (filterType !== "all" && tx.type !== filterType) return false;
      if (filterAccount !== "all" && tx.accountId !== filterAccount && tx.transferToAccountId !== filterAccount) return false;
      if (filterCategory !== "all") {
        const txCat = state.categories.find((c) => c.id === tx.categoryId);
        const txParentId = txCat?.parentId ?? tx.categoryId;
        if (tx.categoryId !== filterCategory && txParentId !== filterCategory) return false;
      }
      if (q) {
        const memo = (tx.memo ?? "").toLowerCase();
        const cat = (state.categories.find((c) => c.id === tx.categoryId)?.name ?? "").toLowerCase();
        const acc = (state.accounts.find((a) => a.id === tx.accountId)?.name ?? "").toLowerCase();
        if (!memo.includes(q) && !cat.includes(q) && !acc.includes(q) && !String(tx.amount).includes(q)) return false;
      }
      return true;
    });
  }, [state.transactions, state.categories, state.accounts, query, filterType, filterAccount, filterCategory, monthKey, periodMode]);

  const filteredFixed = useMemo(() => {
    const q = query.trim().toLowerCase();
    let months: string[];
    if (periodMode === "month") {
      months = [monthKey];
    } else {
      const allDates = state.transactions.map((tx) => transactionLedgerDate(tx).slice(0, 7));
      const allFixed = state.fixedCosts.flatMap((fc) => {
        const from = fc.effectiveFrom?.slice(0, 7) ?? "";
        const to = fc.effectiveTo?.slice(0, 7) ?? "";
        return [from, to].filter(Boolean);
      });
      const allKeys = [...allDates, ...allFixed].filter(Boolean);
      if (allKeys.length === 0) months = [monthKey];
      else {
        const min = allKeys.reduce((a, b) => a < b ? a : b);
        const max = monthKey;
        months = [];
        let cur = min;
        while (cur <= max) {
          months.push(cur);
          const [y, m] = cur.split("-").map(Number);
          const next = new Date(y, m, 1);
          cur = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
        }
      }
    }
    return months.flatMap((mk) => fixedCostOccurrencesForMonth(state.fixedCosts, mk, state)).filter((fc) => {
      if (filterType !== "all" && fc.kind !== filterType) return false;
      if (filterAccount !== "all" && fc.accountId !== filterAccount && fc.transferToAccountId !== filterAccount) return false;
      if (filterCategory !== "all") {
        const fcCat = state.categories.find((c) => c.id === fc.categoryId);
        const fcParentId = fcCat?.parentId ?? fc.categoryId;
        if (fc.categoryId !== filterCategory && fcParentId !== filterCategory) return false;
      }
      if (q) {
        const name = fc.name.toLowerCase();
        const cat = (state.categories.find((c) => c.id === fc.categoryId)?.name ?? "").toLowerCase();
        const acc = (state.accounts.find((a) => a.id === fc.accountId)?.name ?? "").toLowerCase();
        if (!name.includes(q) && !cat.includes(q) && !acc.includes(q) && !String(fc.amount).includes(q)) return false;
      }
      return true;
    });
  }, [state.fixedCosts, state.fixedCostOverrides, state.transactions, state.categories, state.accounts, query, filterType, filterAccount, filterCategory, monthKey, periodMode]);

  const grouped = useMemo(() => {
    const map = new Map<string, { tx: Transaction[]; fixed: FixedCostOccurrence[] }>();
    filteredTx.forEach((tx) => {
      const date = transactionLedgerDate(tx);
      const entry = map.get(date) ?? { tx: [], fixed: [] };
      entry.tx.push(tx);
      map.set(date, entry);
    });
    filteredFixed.forEach((fc) => {
      const date = fc.date;
      const entry = map.get(date) ?? { tx: [], fixed: [] };
      entry.fixed.push(fc);
      map.set(date, entry);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTx, filteredFixed]);

  const totalIncome = filteredTx.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0)
    + filteredFixed.filter((fc) => fc.kind === "income").reduce((sum, fc) => sum + fc.amount, 0);
  const totalExpense = filteredTx.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0)
    + filteredFixed.filter((fc) => fc.kind === "expense").reduce((sum, fc) => sum + fc.amount, 0);

  return (
    <div className="view-stack">
      <nav className="segment-tabs" style={{ display: "flex", marginTop: -8 }} aria-label="表示切替">
        <button type="button" className={viewMode === "calendar" ? "active" : ""} onClick={() => setViewMode("calendar")}>カレンダー</button>
        <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>一覧</button>
      </nav>

      {viewMode === "calendar" ? (
        <HomeCalendar
          state={state}
          setNotice={setNotice}
          reload={reload}
          onQuick={(date) => onQuick(date, "expense")}
          selectedMonth={monthKey}
          setSelectedMonth={() => {}}
          selectedDate={monthKey + "-01"}
          setSelectedDate={() => {}}
          hideMonthNav
        />
      ) : (
        <>
          <section className="tx-filter-bar">
            <div className="tx-search">
              <Search className="search-icon" size={18} />
              <input type="text" placeholder="メモ・カテゴリ・口座・金額で検索" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="filter-chips">
              {([["all", "すべて"], ["expense", "支出"], ["income", "収入"], ["transfer", "振替"]] as const).map(([id, label]) => (
                <button key={id} type="button" className={`chip${filterType === id ? " on" : ""}`} onClick={() => setFilterType(id)}>{label}</button>
              ))}
              <button type="button" className={`chip${showMoreFilters || filterAccount !== "all" || filterCategory !== "all" || periodMode !== "month" ? " outline-on" : ""}`} onClick={() => setShowMoreFilters((v) => !v)}>
                <SlidersHorizontal size={13} /> 絞り込み
              </button>
            </div>
            {showMoreFilters && (
              <div className="tx-filters">
                <label>期間<select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as "month" | "all")}>
                  <option value="month">{formatMonthLabel(monthKey)}のみ</option>
                  <option value="all">全期間</option>
                </select></label>
                <label>口座<select value={filterAccount} onChange={(event) => setFilterAccount(event.target.value)}>
                  <option value="all">すべて</option>
                  {state.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select></label>
                <label>カテゴリ<select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
                  <option value="all">すべて</option>
                  {state.categories.filter((c) => !c.parentId).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select></label>
              </div>
            )}
            <div className="tx-totals">
              <span>{filteredTx.length + filteredFixed.length}件</span>
              <span>収入 <b className="income">{plainAmount(totalIncome)}</b></span>
              <span>支出 <b>{plainAmount(totalExpense)}</b></span>
            </div>
          </section>

          {grouped.length === 0 ? (
            <section className="panel">
              <div className="empty-state">
                <div className="empty-illustration"><Receipt size={20} /></div>
                該当する取引はありません。下の ＋ ボタンから登録してみましょう。
                <button className="primary-btn" type="button" style={{ marginTop: 8 }} onClick={() => onQuick()}><Plus size={16} /> 取引を追加</button>
              </div>
            </section>
          ) : (
            <section className="panel">
              {grouped.map(([date, { tx: items, fixed: fixedItems }]) => {
                const dayTotal = items.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : tx.type === "expense" ? -tx.amount : 0), 0)
                  + fixedItems.reduce((sum, fc) => sum + (fc.kind === "income" ? fc.amount : fc.kind === "expense" ? -fc.amount : 0), 0);
                return (
                  <div key={date}>
                    <div className="tx-group-head">
                      <span className="day">{formatDayLabel(date)}</span>
                      <span className="total" style={{ color: dayTotal > 0 ? "var(--income)" : "var(--ink-soft)" }}>
                        {dayTotal > 0 ? "+" : dayTotal < 0 ? "−" : ""}{plainAmount(dayTotal)}
                      </span>
                    </div>
                    <div className="tx-list">
                      {items.map((transaction) => (
                        <TransactionRow key={transaction.id} transaction={transaction} state={state} setNotice={setNotice} reload={reload} leading="kind" />
                      ))}
                      {fixedItems.map((fc) => (
                        <FixedCostOccurrenceRow key={`fixed-${fc.id}-${fc.date}`} row={fc} state={state} setNotice={setNotice} reload={reload} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function AnalysisView({
  section,
  state,
  monthKey,
  stats,
  setNotice,
  reload,
  onNavigate
}: {
  section: "total" | "flow";
  state: LedgerState;
  monthKey: string;
  stats: Record<string, number>;
  setNotice: (message: string) => void;
  reload: () => Promise<void>;
  onNavigate: (tab: Tab) => void;
}) {
  const monthLabel = formatMonthLabel(monthKey);
  const category = categoryExpense(state, monthKey);
  const [drillParentId, setDrillParentId] = useState<string | null>(null);
  const [selectedAccountHistoryId, setSelectedAccountHistoryId] = useState<string | null>(null);
  const [balancePeriod, setBalancePeriod] = useState<"6m" | "1y" | "3y" | "all">("1y");
  const [categoryDrill, setCategoryDrill] = useState<{ monthKey: string; categoryId: string } | null>(null);
  const [paymentDrill, setPaymentDrill] = useState<string | null>(null); // accountId
  const [ledgerMembers, setLedgerMembers] = useState<Array<{ userId: string; displayName: string }>>([]);
  useEffect(() => {
    if (section !== "flow" || state.activeSpace !== "shared" || !state.householdId) return;
    let cancelled = false;
    loadHouseholdMembers(state.householdId).then((members) => { if (!cancelled) setLedgerMembers(members); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [section, state.activeSpace, state.householdId]);
  const ledgerMoves = useMemo(() => {
    const groups = new Map<string, { label: string; sub: string; inTotal: number; outTotal: number; count: number }>();
    type MoveRow = { direction?: "out" | "in"; amount: number; householdId?: string; householdName?: string; senderId?: string };
    const rows: MoveRow[] = [
      ...monthTransactionsByKey(state.transactions, monthKey).filter((t) => t.transferGroupId).map((t) => ({ direction: t.transferDirection, amount: t.amount, householdId: t.counterpartyHouseholdId, householdName: t.counterpartyHouseholdName, senderId: t.transferSenderId })),
      ...fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state).filter((c) => c.transferGroupId).map((c) => ({ direction: c.transferDirection, amount: c.amount, householdId: c.counterpartyHouseholdId, householdName: c.counterpartyHouseholdName }))
    ];
    rows.forEach((t) => {
      const key = t.householdId ?? t.householdName ?? "";
      const memberName = t.direction === "in" && state.activeSpace === "shared" ? ledgerMembers.find((m) => m.userId === t.senderId)?.displayName : undefined;
      const current = groups.get(key) ?? { label: t.householdName ?? "別の家計簿", sub: "", inTotal: 0, outTotal: 0, count: 0 };
      if (memberName) { current.label = `${memberName}さん`; current.sub = t.householdName ?? ""; }
      if (t.direction === "in") current.inTotal += t.amount;
      else current.outTotal += t.amount;
      current.count += 1;
      groups.set(key, current);
    });
    return Array.from(groups.values()).sort((a, b) => (b.inTotal + b.outTotal) - (a.inTotal + a.outTotal));
  }, [state.transactions, state.fixedCosts, state.fixedCostOverrides, state.activeSpace, monthKey, ledgerMembers]);
  const drillParent = state.categories.find((item) => item.id === drillParentId);
  const drillData = drillParent ? subcategoryExpense(state, drillParent.id, monthKey) : category;
  const totalCategoryExpense = category.reduce((sum, item) => sum + item.value, 0);
  const income = monthlyIncomeWithFixedByKey(state, monthKey);
  const expense = monthlyExpenseWithFixedByKey(state, monthKey);
  const trend = monthlyTrend(state, monthKey);
  const liquidAccounts = state.accounts.filter((a) => a.type !== "credit");

  const accountColors = ["#1C2A4A", "#0F7A68", "#9A6F12", "#7A3A48", "#3E6FB0", "#5A4386"];
  const expenseCategories = state.categories.filter((c) => !c.parentId && c.kind === "expense");

  function periodToMonths(period: "6m" | "1y" | "3y" | "all"): number {
    if (period === "6m") return 6;
    if (period === "1y") return 12;
    if (period === "3y") return 36;
    // "all": earliest transaction or record
    const earliest = state.transactions.reduce((min, t) => t.date < min ? t.date : min, monthKey);
    const startYear = Number(earliest.slice(0, 4));
    const startMonth = Number(earliest.slice(5, 7));
    const endYear = Number(monthKey.slice(0, 4));
    const endMonth = Number(monthKey.slice(5, 7));
    return Math.max((endYear - startYear) * 12 + (endMonth - startMonth) + 1, 6);
  }

  function buildMonths(period: "6m" | "1y" | "3y" | "all") {
    const count = periodToMonths(period);
    const now = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1);
    return Array.from({ length: count }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (count - 1) + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = period === "6m" || period === "1y"
        ? `${d.getMonth() + 1}月`
        : `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}`;
      return { key, label };
    });
  }

  // 支出インサイト：今月 vs 直近3ヶ月平均
  const spendingInsights = useMemo(() => {
    const now = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1);
    const prev6Months = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    return sortCategories(expenseCategories).map((cat) => {
      const childIds = new Set([cat.id, ...state.categories.filter((c) => c.parentId === cat.id).map((c) => c.id)]);
      const thisMonthTx = monthTransactionsByKey(state.transactions, monthKey);
      const thisMonthFixed = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state);
      const current = thisMonthTx.filter((t) => t.type === "expense" && t.categoryId && childIds.has(t.categoryId)).reduce((s, t) => s + t.amount, 0)
        + thisMonthFixed.filter((c) => c.kind === "expense" && c.categoryId && childIds.has(c.categoryId)).reduce((s, c) => s + c.amount, 0);
      const prevAmounts = prev6Months.map((m) => {
        const mTx = monthTransactionsByKey(state.transactions, m);
        const mFixed = fixedCostOccurrencesForMonth(state.fixedCosts, m, state);
        return mTx.filter((t) => t.type === "expense" && t.categoryId && childIds.has(t.categoryId)).reduce((s, t) => s + t.amount, 0)
          + mFixed.filter((c) => c.kind === "expense" && c.categoryId && childIds.has(c.categoryId)).reduce((s, c) => s + c.amount, 0);
      });
      const nonZero = prevAmounts.filter((v) => v > 0);
      const avg = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
      return { cat, current, avg, ratio: avg > 0 ? current / avg : null };
    }).filter((item) => item.current > 0 || item.avg > 0);
  }, [state, monthKey, expenseCategories]);

  // ---------- 総資産 ----------
  const currentMonthKey = todayIso().slice(0, 7);
  const prevKey = shiftMonthKey(monthKey, -1);
  const accountBalances = liquidAccounts.map((account) => ({ account, balance: confirmedAccountBalance(account, state, monthKey) }));
  const accountTotal = accountBalances.reduce((sum, item) => sum + item.balance, 0);
  const investTotal = investmentAssets(state, monthKey);
  const grandTotal = accountTotal + investTotal;
  const prevTotal = liquidAccounts.reduce((sum, account) => sum + confirmedAccountBalance(account, state, prevKey), 0) + investmentAssets(state, prevKey);
  const totalDelta = grandTotal - prevTotal;
  const snapshotConfirmed = isAssetSnapshotConfirmed(state, monthKey);
  const monthEndDay = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  const showForecast = monthKey >= currentMonthKey;
  const assetTrend = buildMonths(balancePeriod).map((m) => {
    const acc = liquidAccounts.reduce((sum, account) => sum + confirmedAccountBalance(account, state, m.key), 0);
    const inv = investmentAssets(state, m.key);
    return { label: m.label, acc, inv, total: acc + inv, forecast: null as number | null };
  });
  if (showForecast && assetTrend.length > 0) {
    const nextKey = shiftMonthKey(monthKey, 1);
    const nextTotal = totalAssets(state, nextKey);
    assetTrend[assetTrend.length - 1].forecast = assetTrend[assetTrend.length - 1].total;
    assetTrend.push({ label: `${Number(nextKey.slice(5, 7))}月`, acc: NaN, inv: NaN, total: NaN, forecast: nextTotal });
  }
  const today = todayIso();
  const pendingCards = upcomingCardWithdrawals(state, today).filter((item) => item.amount > 0);
  const [withdrawalDetail, setWithdrawalDetail] = useState<{ cardId: string; date: string } | null>(null);
  // 口座の金額（月末の予定残高）にまだ入っていない引落だけを差し引く（二重に引かない）
  const pendingNotInBalance = pendingCards.reduce((sum, item) => sum + item.notInBalance, 0);
  const investGain = (state.investmentAccounts ?? []).reduce((sum, account) => {
    const rows = investmentRows(state, account.id, monthKey);
    return sum + (rows[rows.length - 1]?.unrealizedGain ?? 0);
  }, 0);

  // ---------- 収支 ----------
  const [flowPeriod, setFlowPeriod] = useState<"6m" | "1y" | "3y">("6m");
  const flowTrend = buildMonths(flowPeriod).map((m) => ({
    label: m.label,
    income: monthlyIncomeWithFixedByKey(state, m.key),
    expense: monthlyExpenseWithFixedByKey(state, m.key)
  }));
  const savingNow = income - expense;
  const savingRateNow = income > 0 ? Math.round((savingNow / income) * 100) : 0;
  const prevSixSaving = buildMonths("6m").map((m) => monthlyIncomeWithFixedByKey(state, m.key) - monthlyExpenseWithFixedByKey(state, m.key));
  const avgSaving = prevSixSaving.length ? Math.round(prevSixSaving.reduce((sum, v) => sum + v, 0) / prevSixSaving.length) : 0;
  const fixedExpenseNow = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state).filter((cost) => cost.kind === "expense").reduce((sum, cost) => sum + cost.amount, 0);
  const breakdown = [...spendingInsights].sort((x, y) => y.current - x.current);
  const breakdownMax = Math.max(1, ...breakdown.map((item) => Math.max(item.current, item.avg)));
  const breakdownTotal = breakdown.reduce((sum, item) => sum + item.current, 0);
  const paymentRows = (() => {
    const monthTx = monthTransactionsByKey(state.transactions, monthKey);
    const fixedOccurrences = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state);
    return state.accounts.map((account) => {
      const txTotal = monthTx.filter((t) => t.type === "expense" && t.accountId === account.id).reduce((sum, t) => sum + t.amount, 0);
      const fixedTotal = fixedOccurrences.filter((c) => c.kind === "expense" && c.accountId === account.id).reduce((sum, c) => sum + c.amount, 0);
      return { account, total: txTotal + fixedTotal };
    }).filter((row) => row.total > 0).sort((x, y) => y.total - x.total);
  })();

  const periodChips = <T extends string>(value: T, setValue: (v: T) => void, options: readonly T[]) => (
    <span className="period-chips" role="group" aria-label="期間">
      {options.map((option) => (
        <button key={option} type="button" className={value === option ? "on" : ""} onClick={() => setValue(option)}>{option === "all" ? "ALL" : option.toUpperCase()}</button>
      ))}
    </span>
  );
  const chartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string | number }>; label?: string }) => {
    if (!active || !payload?.length) return null;
    const rows = payload.filter((item) => item.value != null && !Number.isNaN(Number(item.value)));
    if (rows.length === 0) return null;
    return (
      <div className="chart-tip">
        <b>{label}</b>
        {rows.map((item) => <div key={String(item.dataKey)}><span><i style={{ background: item.color }} />{item.name}</span><em className="num">{plainAmount(Number(item.value))}</em></div>)}
      </div>
    );
  };

  return (
    <div className="view-stack">
      {section === "total" && (
        <>
          <FutureSnapshotNotice state={state} setNotice={setNotice} reload={reload} />
          <section className="asset-hero">
            {snapshotConfirmed && <div className="hanko small"><b>確定</b><i>{Number(monthKey.slice(5, 7))}.{monthEndDay}</i></div>}
            <div className="asset-hero-label">{snapshotConfirmed ? `${monthLabel}末の総資産` : monthKey === currentMonthKey ? "月末の予定総資産" : `${monthLabel}の総資産`}</div>
            <div className="amount asset-hero-amount"><span className="yen">¥</span>{balanceAmount(grandTotal)}</div>
            <div className="asset-hero-delta">前月から <b className={totalDelta >= 0 ? "pos" : "neg"}>{totalDelta >= 0 ? "+" : "−"}{plainAmount(totalDelta)}</b>{prevTotal > 0 && <>（{totalDelta >= 0 ? "+" : "−"}{Math.abs((totalDelta / prevTotal) * 100).toFixed(1)}%）</>}</div>
            {grandTotal > 0 && (
              <div className="compo">
                <div className="compo-bar">
                  {accountBalances.filter((item) => item.balance > 0).map(({ account, balance }) => (
                    <i key={account.id} title={account.name} style={{ width: `${(balance / grandTotal) * 100}%`, background: account.color }} />
                  ))}
                  {investTotal > 0 && <i className="invest" title="投資" style={{ width: `${(investTotal / grandTotal) * 100}%` }} />}
                </div>
                <div className="compo-keys">
                  <span><i style={{ background: "var(--ink)" }} />口座 <b className="num">{balanceAmount(accountTotal)}</b></span>
                  {(state.investmentAccounts ?? []).length > 0 && <span><i className="invest" />投資 <b className="num">{balanceAmount(investTotal)}</b></span>}
                </div>
              </div>
            )}
          </section>

          <section className="chart-card">
            <div className="chart-card-head"><h2>総資産の推移</h2>{periodChips(balancePeriod, setBalancePeriod, ["6m", "1y", "3y", "all"] as const)}</div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={assetTrend} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted)" }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip content={chartTooltip} />
                <Area type="monotone" dataKey="acc" name="口座" stackId="a" stroke="none" fill="var(--chart-acc)" fillOpacity={1} isAnimationActive={false} />
                <Area type="monotone" dataKey="inv" name="投資" stackId="a" stroke="var(--chart-inv-line)" strokeWidth={2} fill="var(--chart-inv)" fillOpacity={1} isAnimationActive={false} />
                {showForecast && <Line type="linear" dataKey="forecast" name="予測" stroke="var(--muted)" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: "var(--panel)", stroke: "var(--muted)" }} connectNulls={false} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-legend"><span><i className="box" style={{ background: "var(--chart-acc)" }} />口座</span>{(state.investmentAccounts ?? []).length > 0 && <span><i className="box" style={{ background: "var(--chart-inv)" }} />投資</span>}{showForecast && <span><i className="dash" />来月末の予測</span>}</div>
          </section>

          <div className="settings-sec-h"><span>口座</span><b className="num">{balanceAmount(accountTotal)}</b></div>
          <div className="settings-list">
            {accountBalances.map(({ account, balance }) => (
              <button type="button" className="settings-row account-item" key={account.id} onClick={() => setSelectedAccountHistoryId(account.id)}>
                <AccountMark account={account} size="lg" />
                <span className="settings-row-text"><b>{account.name}</b><small>{accountTypeLabel(account.type)}</small></span>
                <span className="settings-amount num">{balance < 0 ? "−" : ""}{plainAmount(balance)}</span>
                <ChevronRight size={16} className="settings-chev" />
              </button>
            ))}
            {liquidAccounts.length === 0 && <div className="empty-state">口座がまだありません。設定の「口座・カード」から追加できます。</div>}
          </div>

          {monthKey === currentMonthKey && pendingCards.length > 0 && (
            <>
              <div className="settings-sec-h"><span>これから出ていくお金</span></div>
              <div className="settings-list">
                {Array.from(new Set(pendingCards.map((item) => item.date.slice(0, 7)))).map((month) => {
                  const items = pendingCards.filter((item) => item.date.startsWith(month));
                  return (
                    <div className="withdraw-month" key={month}>
                      <div className="withdraw-month-head">
                        <span>{Number(month.slice(5, 7))}月の引落{month === currentMonthKey ? "" : month === shiftMonthKey(currentMonthKey, 1) ? "（来月）" : ""}</span>
                        <b className="num">−{plainAmount(items.reduce((sum, item) => sum + item.amount, 0))}</b>
                      </div>
                      {items.map(({ card, date, amount, fixedCount }) => {
                        const withdrawal = state.accounts.find((item) => item.id === card.withdrawalAccountId);
                        return (
                          <button type="button" className="settings-row account-item withdraw-row" key={`${card.id}-${date}`} onClick={() => setWithdrawalDetail({ cardId: card.id, date })}>
                            <AccountMark account={card} size="lg" />
                            <span className="settings-row-text">
                              <b>{card.name}</b>
                              <small className="withdraw-line"><em className="withdraw-date">{shortDate(date)}（{weekdayOf(date)}）引落</em>{withdrawal?.name ?? "引落口座未設定"}から</small>
                              {fixedCount > 0 && <small>定期 {fixedCount}件を含む</small>}
                            </span>
                            <span className="settings-amount num">−{plainAmount(amount)}</span>
                            <ChevronRight size={16} className="settings-chev" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                <div className="settings-row account-item no-chev total-row">
                  <span />
                  <span className="settings-row-text"><b>引落後に使える口座残高</b><small>{pendingNotInBalance > 0 ? "月末の予定残高から、来月以降の引落分を差し引いた額" : "今月の引落は口座の金額に反映済みです"}</small></span>
                  <span className="settings-amount num">{balanceAmount(accountTotal - pendingNotInBalance)}</span>
                </div>
              </div>
            </>
          )}

          {(state.investmentAccounts ?? []).length > 0 && (
            <>
              <div className="settings-sec-h"><span>投資</span></div>
              <div className="settings-list">
                <button type="button" className="settings-row account-item" onClick={() => onNavigate("investments")}>
                  <span className="passbook-mark" style={{ background: "#5A4386" }}>投</span>
                  <span className="settings-row-text"><b>投資の評価額</b><small>{(state.investmentAccounts ?? []).length}口座／含み益 {investGain >= 0 ? "+" : "−"}{plainAmount(investGain)}</small></span>
                  <span className="settings-amount num">{balanceAmount(investTotal)}</span>
                  <ChevronRight size={16} className="settings-chev" />
                </button>
              </div>
            </>
          )}
        </>
      )}

      {section === "flow" && (
        <>
          <section className="asset-hero">
            <div className="asset-hero-label">{monthLabel}の収支</div>
            <div className={`amount asset-hero-amount ${savingNow >= 0 ? "pos" : "neg"}`}><span className="yen">{savingNow >= 0 ? "+" : "−"}</span>{plainAmount(savingNow)}</div>
            <div className="asset-hero-delta">貯金率 <b className={savingNow >= 0 ? "pos" : "neg"}>{savingRateNow}%</b>／6ヶ月平均 {avgSaving >= 0 ? "+" : "−"}{plainAmount(avgSaving)}</div>
            <div className="hero-kpis">
              <div><span>収入</span><b className="num pos">{plainAmount(income)}</b></div>
              <div><span>支出</span><b className="num">{plainAmount(expense)}</b></div>
              <div><span>うち固定費</span><b className="num">{plainAmount(fixedExpenseNow)}</b></div>
            </div>
          </section>

          <section className="chart-card">
            <div className="chart-card-head"><h2>収入と支出の推移</h2>{periodChips(flowPeriod, setFlowPeriod, ["6m", "1y", "3y"] as const)}</div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={flowTrend} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted)" }} interval="preserveStartEnd" minTickGap={14} />
                <YAxis hide />
                <Tooltip content={chartTooltip} cursor={{ fill: "var(--panel-soft)" }} />
                <Bar dataKey="income" name="収入" fill="var(--income)" radius={[2, 2, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                <Bar dataKey="expense" name="支出" fill="var(--ink)" radius={[2, 2, 0, 0]} maxBarSize={14} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-legend"><span><i className="box" style={{ background: "var(--income)" }} />収入</span><span><i className="box" style={{ background: "var(--ink)" }} />支出</span></div>
          </section>

          <div className="settings-sec-h"><span>支出の内訳</span><span>｜は6ヶ月平均</span></div>
          <div className="settings-list">
            {breakdown.map(({ cat, current, avg, ratio }) => {
              const hasChildren = state.categories.some((c) => c.parentId === cat.id);
              const diff = Math.round(current - avg);
              const status = ratio === null || avg === 0 ? "none" : ratio > 1.15 ? "up" : ratio < 0.85 ? "down" : "even";
              return (
                <button type="button" key={cat.id} className="breakdown-row" onClick={() => hasChildren ? setDrillParentId(cat.id) : setCategoryDrill({ monthKey, categoryId: cat.id })}>
                  <b><i style={{ background: cat.color }} />{cat.name}</b>
                  <span className="num breakdown-amount">{plainAmount(current)}</span>
                  <span className="breakdown-track">
                    <i style={{ width: `${(current / breakdownMax) * 100}%`, background: cat.color }} />
                    {avg > 0 && <u style={{ left: `calc(${(avg / breakdownMax) * 100}% - 1px)` }} />}
                  </span>
                  <span className="breakdown-meta">
                    <span>{breakdownTotal > 0 ? Math.round((current / breakdownTotal) * 100) : 0}%</span>
                    <span className={status}>{status === "up" ? `平均より +${plainAmount(diff)}` : status === "down" ? `平均より −${plainAmount(diff)}` : status === "even" ? "平均どおり" : "平均なし"}</span>
                  </span>
                </button>
              );
            })}
            {breakdown.length === 0 && <div className="empty-state">この月の支出はまだありません。</div>}
          </div>
          {breakdown.length > 0 && <p className="settings-note">カテゴリをタップすると、サブカテゴリと取引の一覧が開きます。取引はそこから編集できます。</p>}

          {paymentRows.length > 0 && (
            <>
              <div className="settings-sec-h"><span>支払い方法別</span><b className="num">{plainAmount(paymentRows.reduce((sum, row) => sum + row.total, 0))}</b></div>
              <div className="settings-list">
                {paymentRows.map(({ account, total }) => (
                  <button type="button" className="settings-row account-item" key={account.id} onClick={() => setPaymentDrill(account.id)}>
                    <AccountMark account={account} size="lg" />
                    <span className="settings-row-text"><b>{account.name}</b><small>{account.type === "credit" ? "カード払い" : account.type === "cash" ? "現金払い" : "口座から直接"}</small></span>
                    <span className="settings-amount num">{plainAmount(total)}</span>
                    <ChevronRight size={16} className="settings-chev" />
                  </button>
                ))}
              </div>
            </>
          )}

          {ledgerMoves.length > 0 && (
            <>
              <div className="settings-sec-h"><span>資金移動</span><span>家計簿どうしのやり取り</span></div>
              <div className="settings-list">
                {ledgerMoves.map((move) => (
                  <div className="settings-row ledger-move-row" key={move.label}>
                    <span className="ledger-move-icon" aria-hidden="true"><ArrowDownUp size={16} /></span>
                    <span className="settings-row-text"><b>{move.label}</b><small>{move.sub ? `${move.sub}・` : ""}{move.count}件</small></span>
                    <span className="ledger-move-amounts num">
                      {move.inTotal > 0 && <b className="pos">+{plainAmount(move.inTotal)}</b>}
                      {move.outTotal > 0 && <b>−{plainAmount(move.outTotal)}</b>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="settings-note">{state.activeSpace === "shared" ? "メンバーの家計簿から入ってきたお金と、出ていったお金です。「収入として数える」にした分は、上の収入にも入っています。" : "共有の家計簿などとやり取りしたお金です。「支出／収入として数える」にした分は、上の収支にも入っています。"}</p>
            </>
          )}
        </>
      )}

      {/* カテゴリー詳細モーダル */}
      {categoryDrill && (() => {
        const cat = state.categories.find((c) => c.id === categoryDrill.categoryId);
        const childIds = new Set([categoryDrill.categoryId, ...state.categories.filter((c) => c.parentId === categoryDrill.categoryId).map((c) => c.id)]);
        const mLabel = formatMonthLabel(categoryDrill.monthKey);
        const txs = monthTransactionsByKey(state.transactions, categoryDrill.monthKey)
          .filter((t) => t.type === "expense" && t.categoryId && childIds.has(t.categoryId))
          .sort((a, b) => b.date.localeCompare(a.date));
        const fixedOcc = fixedCostOccurrencesForMonth(state.fixedCosts, categoryDrill.monthKey, state)
          .filter((c) => c.kind === "expense" && c.categoryId && childIds.has(c.categoryId));
        const total = txs.reduce((s, t) => s + t.amount, 0) + fixedOcc.reduce((s, c) => s + c.amount, 0);
        // サブカテゴリ集計
        const subMap = new Map<string, number>();
        [...txs.map((t) => ({ catId: t.categoryId!, amt: t.amount })), ...fixedOcc.map((c) => ({ catId: c.categoryId, amt: c.amount }))].forEach(({ catId, amt }) => {
          const sub = state.categories.find((c) => c.id === catId);
          const label = sub?.parentId ? sub.name : "その他";
          subMap.set(label, (subMap.get(label) ?? 0) + amt);
        });
        return (
          <div className="sheet-backdrop center-backdrop" style={{ zIndex: 50 }} onClick={() => setCategoryDrill(null)}>
            <section className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 480px)" }}>
              <div className="section-title">
                <h2><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: cat?.color, marginRight: 6 }} />{cat?.name}</h2>
                <span>{mLabel} · {yen.format(total)}</span>
              </div>
              {subMap.size > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {Array.from(subMap.entries()).sort((a, b) => b[1] - a[1]).map(([name, amt]) => (
                    <span key={name} style={{ fontSize: 11, background: "var(--surface)", borderRadius: 6, padding: "2px 8px" }}>
                      {name} <strong>{yen.format(amt)}</strong>
                    </span>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>取引をタップすると編集・削除できます（定期項目はこの月だけ変更）</p>
              <div className="transaction-list" style={{ maxHeight: 400, overflowY: "auto" }}>
                {fixedOcc.map((c) => (
                  <FixedCostOccurrenceRow key={`fixed-${c.id}-${c.date}`} row={c} state={state} setNotice={setNotice} reload={reload} />
                ))}
                {txs.map((t) => (
                  <TransactionRow key={t.id} transaction={t} state={state} setNotice={setNotice} reload={reload} />
                ))}
                {txs.length === 0 && fixedOcc.length === 0 && <div className="empty-state">この月の取引はありません。</div>}
              </div>
              <button className="google-button" style={{ marginTop: 12 }} type="button" onClick={() => setCategoryDrill(null)}>閉じる</button>
            </section>
          </div>
        );
      })()}

      {/* カテゴリ別サブカテゴリインサイトモーダル */}
      {drillParentId && drillParent && (() => {
        const now = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1);
        const prev6Months = Array.from({ length: 6 }).map((_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        });
        const children = state.categories.filter((c) => c.parentId === drillParentId);
        const subInsights = children.map((child) => {
          const thisMonthTx = monthTransactionsByKey(state.transactions, monthKey);
          const thisMonthFixed = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state);
          const current = thisMonthTx.filter((t) => t.type === "expense" && t.categoryId === child.id).reduce((s, t) => s + t.amount, 0)
            + thisMonthFixed.filter((c) => c.kind === "expense" && c.categoryId === child.id).reduce((s, c) => s + c.amount, 0);
          const prevAmounts = prev6Months.map((m) => {
            const mTx = monthTransactionsByKey(state.transactions, m);
            const mFixed = fixedCostOccurrencesForMonth(state.fixedCosts, m, state);
            return mTx.filter((t) => t.type === "expense" && t.categoryId === child.id).reduce((s, t) => s + t.amount, 0)
              + mFixed.filter((c) => c.kind === "expense" && c.categoryId === child.id).reduce((s, c) => s + c.amount, 0);
          });
          const nonZeroSub = prevAmounts.filter((v) => v > 0);
          const avg = nonZeroSub.length > 0 ? nonZeroSub.reduce((s, v) => s + v, 0) / nonZeroSub.length : 0;
          const ratio = avg > 0 ? current / avg : null;
          return { child, current, avg, ratio };
        }).filter((item) => item.current > 0 || item.avg > 0).sort((a, b) => b.current - a.current);
        const total = subInsights.reduce((s, item) => s + item.current, 0);
        return (
          <div className="sheet-backdrop center-backdrop" onClick={() => setDrillParentId(null)}>
            <section className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 480px)" }}>
              <div className="section-title">
                <h2><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: drillParent.color, marginRight: 6 }} />{drillParent.name}</h2>
                <span>{monthLabel} · {yen.format(total)}</span>
              </div>
              {subInsights.length === 0 ? (
                <div className="empty-state">サブカテゴリの支出はありません。</div>
              ) : (
                <div className="spending-insights" style={{ maxHeight: 400, overflowY: "auto" }}>
                  {subInsights.map(({ child, current, avg, ratio }) => {
                    const isOver = ratio !== null && ratio > 1.15;
                    const isUnder = ratio !== null && ratio < 0.85 && avg > 0;
                    const barPct = avg > 0 ? Math.min((current / avg) * 100, 200) : 100;
                    return (
                      <div
                        key={child.id}
                        className="spending-insight-row"
                        style={{ cursor: "pointer" }}
                        onClick={() => setCategoryDrill({ monthKey, categoryId: child.id })}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="si-header">
                          <div className="si-dot" style={{ background: child.color }} />
                          <span className="si-name">{child.name}</span>
                          {ratio !== null && (
                            <span className={`si-badge ${isOver ? "over" : isUnder ? "under" : "normal"}`}>
                              {isOver ? `+${Math.round((ratio - 1) * 100)}%` : isUnder ? `-${Math.round((1 - ratio) * 100)}%` : "平均的"}
                            </span>
                          )}
                          <span className="si-amount">{yen.format(current)}</span>
                          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>›</span>
                        </div>
                        <div className="si-bar-wrap">
                          <div className="si-bar-track">
                            <div className="si-bar-fill" style={{ width: `${Math.min(barPct, 100)}%`, background: isOver ? "var(--expense)" : isUnder ? "var(--income)" : child.color }} />
                            {barPct > 100 && <div className="si-bar-over" style={{ width: `${Math.min(barPct - 100, 100)}%` }} />}
                          </div>
                          {avg > 0 && <span className="si-avg-label">平均 {yen.format(Math.round(avg))}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <button className="mini-button" style={{ marginTop: 8 }} type="button" onClick={() => setCategoryDrill({ monthKey, categoryId: drillParent.id })}>{drillParent.name}の明細をすべて見る・編集</button>
              <button className="google-button" style={{ marginTop: 12 }} type="button" onClick={() => setDrillParentId(null)}>閉じる</button>
            </section>
          </div>
        );
      })()}

      {/* 支払い方法詳細モーダル */}
      {paymentDrill && (() => {
        const account = state.accounts.find((a) => a.id === paymentDrill);
        const txs = monthTransactionsByKey(state.transactions, monthKey)
          .filter((t) => t.type === "expense" && t.accountId === paymentDrill)
          .sort((a, b) => b.date.localeCompare(a.date));
        const fixedOcc = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state)
          .filter((c) => c.kind === "expense" && c.accountId === paymentDrill);
        const total = txs.reduce((s, t) => s + t.amount, 0) + fixedOcc.reduce((s, c) => s + c.amount, 0);
        return (
          <div className="sheet-backdrop center-backdrop" style={{ zIndex: 50 }} onClick={() => setPaymentDrill(null)}>
            <section className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 480px)" }}>
              <div className="section-title">
                <h2><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: account?.color, marginRight: 6 }} />{account?.name}</h2>
                <span>{monthLabel} · {yen.format(total)}</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>取引をタップすると編集・削除できます（定期項目はこの月だけ変更）</p>
              <div className="transaction-list" style={{ maxHeight: 400, overflowY: "auto" }}>
                {fixedOcc.map((c) => (
                  <FixedCostOccurrenceRow key={`fixed-${c.id}-${c.date}`} row={c} state={state} setNotice={setNotice} reload={reload} />
                ))}
                {txs.map((t) => (
                  <TransactionRow key={t.id} transaction={t} state={state} setNotice={setNotice} reload={reload} />
                ))}
                {txs.length === 0 && fixedOcc.length === 0 && <div className="empty-state">この月の取引はありません。</div>}
              </div>
              <button className="google-button" style={{ marginTop: 12 }} type="button" onClick={() => setPaymentDrill(null)}>閉じる</button>
            </section>
          </div>
        );
      })()}

      {withdrawalDetail && (
        <CardWithdrawalSheet state={state} cardId={withdrawalDetail.cardId} date={withdrawalDetail.date} setNotice={setNotice} reload={reload} onClose={() => setWithdrawalDetail(null)} />
      )}
      {selectedAccountHistoryId && (
        <AccountHistoryModal
          accountId={selectedAccountHistoryId}
          state={state}
          monthKey={monthKey}
          onClose={() => setSelectedAccountHistoryId(null)}
        />
      )}
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

function investmentKindLabel(kind?: string) {
  if (kind === "ideco") return "iDeCo";
  if (kind === "nisa") return "NISA";
  return "証券口座";
}

function investmentKindColor(kind?: string) {
  if (kind === "ideco") return "#7c3aed";
  if (kind === "nisa") return "#0891b2";
  return "#0f766e";
}

type InvestmentRow = ReturnType<typeof investmentRows>[number] & { recordedCount: number; accountCount: number; capitalBase: number };

// 複数口座の月次成績を合算する（「すべて」表示用）
function combinedInvestmentRows(state: LedgerState, accountIds: string[], endMonthKey: string): InvestmentRow[] {
  const byMonth = new Map<string, InvestmentRow>();
  const records = state.investmentRecords ?? [];
  accountIds.forEach((id) => {
    investmentRows(state, id, endMonthKey).forEach((row) => {
      const recorded = records.some((record) => record.investmentAccountId === id && record.month === row.month) ? 1 : 0;
      const capitalBase = row.monthEndValue - row.assetDelta + row.monthlyContribution + row.additionalInvestment;
      const current = byMonth.get(row.month);
      if (!current) {
        byMonth.set(row.month, { ...row, recordedCount: recorded, accountCount: 1, capitalBase });
        return;
      }
      current.targetValue += row.targetValue;
      current.monthEndValue += row.monthEndValue;
      current.monthlyContribution += row.monthlyContribution;
      current.additionalInvestment += row.additionalInvestment;
      current.saleAmount += row.saleAmount;
      current.assetDelta += row.assetDelta;
      current.profit += row.profit;
      current.cumulativePrincipal += row.cumulativePrincipal;
      current.unrealizedGain += row.unrealizedGain;
      current.capitalBase += capitalBase;
      current.recordedCount += recorded;
      current.accountCount += 1;
    });
  });
  return Array.from(byMonth.values())
    .map((row) => ({ ...row, monthlyReturnRate: row.capitalBase > 0 ? (row.profit / row.capitalBase) * 100 : 0 }))
    .sort((x, y) => x.month.localeCompare(y.month));
}

function signedAmount(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${plainAmount(value)}`;
}

function signedRate(value: number, digits = 1) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

function InvestmentsView({ state, monthKey, setNotice, reload }: { state: LedgerState; monthKey: string; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const accounts = state.investmentAccounts ?? [];
  const records = state.investmentRecords ?? [];
  const [selectedId, setSelectedId] = useState<string>("all");
  const effectiveId = accounts.length <= 1 ? (accounts[0]?.id ?? "all") : (selectedId === "all" || accounts.some((account) => account.id === selectedId) ? selectedId : "all");
  const selectedAccounts = effectiveId === "all" ? accounts : accounts.filter((account) => account.id === effectiveId);
  const single = selectedAccounts.length === 1 ? selectedAccounts[0] : null;
  const [chartPeriod, setChartPeriod] = useState<"1y" | "3y" | "5y" | "all">("all");
  const [perfView, setPerfView] = useState<"monthly" | "yearly">("monthly");
  const [perfYear, setPerfYear] = useState(Number(monthKey.slice(0, 4)));
  const [recordTarget, setRecordTarget] = useState<{ month: string; accountId: string } | null>(null);
  useEffect(() => { setPerfYear(Number(monthKey.slice(0, 4))); }, [monthKey]);

  const currentMonthKey = todayIso().slice(0, 7);
  const rows = useMemo(() => combinedInvestmentRows(state, selectedAccounts.map((account) => account.id), monthKey), [state, effectiveId, monthKey]);
  const yearRows = useMemo(() => investmentYearRows(rows), [rows]);
  // 記入済みの最新月を主役にする（未記入の月は見込み値なので）
  const recordedRows = rows.filter((row) => row.month <= monthKey && row.recordedCount > 0);
  const cur = recordedRows[recordedRows.length - 1] ?? rows.find((row) => row.month === monthKey) ?? rows[rows.length - 1];
  const thisYear = yearRows.find((row) => row.year === monthKey.slice(0, 4));
  const fullyRecorded = cur ? cur.recordedCount >= cur.accountCount : false;
  const missing = selectedAccounts.filter((account) => (!account.startMonth || account.startMonth <= monthKey) && !records.some((record) => record.investmentAccountId === account.id && record.month === monthKey));
  const monthNum = Number(monthKey.slice(5, 7));
  const heroMonthNum = cur ? Number(cur.month.slice(5, 7)) : monthNum;
  const gainRate = cur && cur.cumulativePrincipal > 0 ? (cur.unrealizedGain / cur.cumulativePrincipal) * 100 : 0;
  const targetLabel = single ? `目標（年${single.targetAnnualRate}%）` : "目標";

  const chartRows = rows.filter((row) => {
    if (chartPeriod === "all") return true;
    const months = chartPeriod === "1y" ? 12 : chartPeriod === "3y" ? 36 : 60;
    return row.month >= shiftMonthKey(monthKey, -(months - 1));
  }).map((row) => ({ ...row, label: chartPeriod === "all" && rows.length > 13 ? `${row.month.slice(2, 4)}/${Number(row.month.slice(5, 7))}` : row.label }));
  const yearMonthRows = [...rows.filter((row) => Number(row.month.slice(0, 4)) === perfYear)].reverse();
  const perfYearSummary = yearRows.find((row) => row.year === String(perfYear));
  const years = Array.from(new Set(rows.map((row) => Number(row.month.slice(0, 4)))));
  const minYear = years.length ? Math.min(...years) : perfYear;
  const maxYear = years.length ? Math.max(...years) : perfYear;

  const openRecord = (month: string) => {
    const unrecorded = selectedAccounts.find((account) => (!account.startMonth || account.startMonth <= month) && !records.some((record) => record.investmentAccountId === account.id && record.month === month));
    const target = unrecorded ?? selectedAccounts[0];
    if (target) setRecordTarget({ month, accountId: target.id });
  };

  const tip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string | number }>; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tip">
        <b>{label}</b>
        {payload.map((item) => <div key={String(item.dataKey)}><span><i style={{ background: item.color }} />{item.name}</span><em className="num">{item.dataKey === "rate" ? `${Number(item.value).toFixed(1)}%` : balanceAmount(Number(item.value))}</em></div>)}
      </div>
    );
  };

  if (accounts.length === 0) {
    return (
      <div className="view-stack">
        <section className="panel">
          <div className="empty-state">
            <div className="empty-illustration"><LineChartIcon size={20} /></div>
            投資口座はまだありません。設定の「投資口座」から、NISA・iDeCo・証券口座を追加できます。
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="view-stack">
      {accounts.length > 1 && (
        <div className="inv-chips" role="group" aria-label="投資口座">
          <button type="button" className={effectiveId === "all" ? "on" : ""} onClick={() => setSelectedId("all")}>すべて</button>
          {accounts.map((account) => (
            <button key={account.id} type="button" className={effectiveId === account.id ? "on" : ""} onClick={() => setSelectedId(account.id)}>
              <i style={{ background: account.color || investmentKindColor(account.accountKind) }} />{account.name}
            </button>
          ))}
        </div>
      )}

      {cur && (
        <section className="asset-hero">
          <div className="asset-hero-label">{heroMonthNum}月末の評価額{!fullyRecorded && <span className="hero-tag">{cur.recordedCount > 0 ? "一部見込み" : "見込み"}</span>}</div>
          <div className="amount asset-hero-amount"><span className="yen">¥</span>{balanceAmount(cur.monthEndValue)}</div>
          <div className="asset-hero-delta">含み益 <b className={cur.unrealizedGain >= 0 ? "pos" : "neg"}>{signedAmount(cur.unrealizedGain)}</b>（{signedRate(gainRate)}）</div>
          <div className="hero-kpis">
            <div><span>投資した元金</span><b className="num">{plainAmount(cur.cumulativePrincipal)}</b></div>
            <div><span>{heroMonthNum}月の損益</span><b className={`num ${cur.profit >= 0 ? "pos" : "neg"}`}>{signedAmount(cur.profit)}</b></div>
            <div><span>今年の年利</span><b className={`num ${(thisYear?.returnRate ?? 0) >= 0 ? "pos" : "neg"}`}>{signedRate(thisYear?.returnRate ?? 0)}</b></div>
          </div>
        </section>
      )}

      {monthKey <= currentMonthKey && missing.length > 0 && (
        <button type="button" className="record-cta" onClick={() => openRecord(monthKey)}>
          <span><b>{monthNum}月の評価額を記入</b><small>{missing.length > 1 ? `${missing.length}口座が未記入です` : "月末に証券口座の評価額を写すだけです"}</small></span>
          <span className="record-cta-go">記入する</span>
        </button>
      )}

      <section className="chart-card">
        <div className="chart-card-head">
          <h2>評価額と元金</h2>
          <span className="period-chips" role="group" aria-label="期間">
            {(["1y", "3y", "5y", "all"] as const).map((option) => (
              <button key={option} type="button" className={chartPeriod === option ? "on" : ""} onClick={() => setChartPeriod(option)}>{option === "all" ? "ALL" : option.toUpperCase()}</button>
            ))}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart data={chartRows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted)" }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis hide domain={["dataMin - 20000", "auto"]} />
            <Tooltip content={tip} />
            <Area type="monotone" dataKey="cumulativePrincipal" name="元金" stroke="none" fill="var(--chart-principal)" fillOpacity={1} isAnimationActive={false} />
            <Line type="monotone" dataKey="targetValue" name={targetLabel} stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="monthEndValue" name="評価額" stroke="var(--income)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="chart-legend"><span><i style={{ background: "var(--income)" }} />評価額</span><span><i className="box" style={{ background: "var(--chart-principal)" }} />元金</span><span><i className="dash" />{targetLabel}</span></div>
      </section>

      <div className="perf-head">
        <span className="mini-seg" role="group" aria-label="成績の表示">
          <button type="button" className={perfView === "monthly" ? "on" : ""} onClick={() => setPerfView("monthly")}>月ごと</button>
          <button type="button" className={perfView === "yearly" ? "on" : ""} onClick={() => setPerfView("yearly")}>年ごと</button>
        </span>
        {perfView === "monthly" && (
          <span className="year-nav">
            <button type="button" onClick={() => setPerfYear(perfYear - 1)} disabled={perfYear <= minYear} aria-label="前の年"><ChevronLeft size={16} /></button>
            <b className="num">{perfYear}</b>
            <button type="button" onClick={() => setPerfYear(perfYear + 1)} disabled={perfYear >= maxYear} aria-label="次の年"><ChevronRight size={16} /></button>
          </span>
        )}
      </div>

      {perfView === "monthly" ? (
        <>
          <table className="passbook-table">
            <thead><tr><th>月</th><th>評価額</th><th>損益</th><th>月利</th></tr></thead>
            <tbody>
              {yearMonthRows.map((row) => {
                const empty = row.recordedCount === 0;
                const partial = !empty && row.recordedCount < row.accountCount;
                return (
                  <tr key={row.month} className={empty ? "empty" : ""} onClick={() => openRecord(row.month)}>
                    <td>{row.label}{partial && <i className="partial-dot" title="一部の口座が未記入" />}</td>
                    {empty ? (
                      <td colSpan={3} className="write-cell"><span className="write-chip">記入する</span></td>
                    ) : (
                      <>
                        <td>{balanceAmount(row.monthEndValue)}</td>
                        <td className={row.profit >= 0 ? "pos" : "neg"}>{signedAmount(row.profit)}</td>
                        <td className={row.monthlyReturnRate >= 0 ? "pos" : "neg"}>{signedRate(row.monthlyReturnRate)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
              {yearMonthRows.length === 0 && <tr className="empty"><td colSpan={4}>この年の記録はありません。</td></tr>}
              {perfYearSummary && yearMonthRows.length > 0 && (
                <tr className="sum"><td>年初から</td><td /><td className={perfYearSummary.profit >= 0 ? "pos" : "neg"}>{signedAmount(perfYearSummary.profit)}</td><td className={perfYearSummary.returnRate >= 0 ? "pos" : "neg"}>{signedRate(perfYearSummary.returnRate)}</td></tr>
              )}
            </tbody>
          </table>
          <p className="settings-note">行をタップすると、その月の評価額・追加投資・売却を記入・修正できます。{!single && "「すべて」では全口座の合計を表示しています。"}</p>
        </>
      ) : (
        <>
          {yearRows.length > 0 && (
            <section className="chart-card">
              <div className="chart-card-head"><h2>年ごとの利益と年利</h2>{single && <span className="chart-card-meta">目標 年{single.targetAnnualRate}%</span>}</div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={[...yearRows].reverse().map((row) => ({ year: row.year, profit: Math.round(row.profit), rate: Number(row.returnRate.toFixed(2)) }))} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <YAxis yAxisId="profit" hide />
                  <YAxis yAxisId="rate" hide orientation="right" />
                  <Tooltip content={tip} cursor={{ fill: "var(--panel-soft)" }} />
                  <ReferenceLine yAxisId="profit" y={0} stroke="var(--line-strong)" />
                  {single && <ReferenceLine yAxisId="rate" y={single.targetAnnualRate} stroke="var(--muted)" strokeDasharray="3 3" />}
                  <Bar yAxisId="profit" dataKey="profit" name="利益" maxBarSize={36} radius={[2, 2, 0, 0]} isAnimationActive={false}>
                    {[...yearRows].reverse().map((row) => (
                      <Cell key={row.year} fill={row.returnRate < 0 ? "var(--expense)" : single && row.returnRate < single.targetAnnualRate ? "var(--warning)" : "var(--income)"} />
                    ))}
                  </Bar>
                  <Line yAxisId="rate" type="monotone" dataKey="rate" name="年利" stroke="var(--ink)" strokeWidth={2} dot={{ r: 3.5, fill: "var(--ink)", stroke: "var(--panel)", strokeWidth: 2 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="chart-legend"><span><i className="box" style={{ background: "var(--income)" }} />{single ? "目標達成" : "プラス"}</span>{single && <span><i className="box" style={{ background: "var(--warning)" }} />未達</span>}<span><i className="box" style={{ background: "var(--expense)" }} />マイナス</span><span><i style={{ background: "var(--ink)" }} />年利</span></div>
            </section>
          )}
          <table className="passbook-table">
            <thead><tr><th>年</th><th>年末評価額</th><th>積立</th><th>利益</th><th>年利</th></tr></thead>
            <tbody>
              {yearRows.map((row) => (
                <tr key={row.year}>
                  <td>{row.year}</td>
                  <td>{balanceAmount(row.endValue)}</td>
                  <td>{balanceAmount(row.monthlyContribution + row.additionalInvestment - row.saleAmount)}</td>
                  <td className={row.profit >= 0 ? "pos" : "neg"}>{signedAmount(row.profit)}</td>
                  <td className={row.returnRate >= 0 ? "pos" : "neg"}>{signedRate(row.returnRate)}</td>
                </tr>
              ))}
              {yearRows.length === 0 && <tr className="empty"><td colSpan={5}>年ごとの記録はまだありません。</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {recordTarget && (
        <InvestmentRecordSheet
          state={state}
          month={recordTarget.month}
          accountId={recordTarget.accountId}
          accounts={selectedAccounts.length > 0 ? selectedAccounts : accounts}
          setAccountId={(id) => setRecordTarget({ ...recordTarget, accountId: id })}
          onClose={() => setRecordTarget(null)}
          setNotice={setNotice}
          reload={reload}
        />
      )}
    </div>
  );
}

function InvestmentRecordSheet({ state, month, accountId, accounts, setAccountId, onClose, setNotice, reload }: { state: LedgerState; month: string; accountId: string; accounts: LedgerState["investmentAccounts"]; setAccountId: (id: string) => void; onClose: () => void; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const account = accounts.find((item) => item.id === accountId) ?? accounts[0];
  const records = state.investmentRecords ?? [];
  const existing = records.find((record) => record.investmentAccountId === account?.id && record.month === month);
  const prevValue = account ? (shiftMonthKey(month, -1) < account.startMonth ? account.initialAmount : latestInvestmentValue(state, account.id, shiftMonthKey(month, -1))) : 0;
  const contribution = account ? investmentContributionForMonth(state, account, month) : 0;
  const [value, setValue] = useState(existing?.monthEndValue ?? 0);
  const [additional, setAdditional] = useState(existing?.additionalInvestment ?? 0);
  const [sale, setSale] = useState(existing?.saleAmount ?? 0);
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setValue(existing?.monthEndValue ?? 0);
    setAdditional(existing?.additionalInvestment ?? 0);
    setSale(existing?.saleAmount ?? 0);
    setNote(existing?.note ?? "");
  }, [account?.id, month, existing?.id]);
  if (!account) return null;
  const profit = value > 0 ? value - prevValue - contribution - additional + sale : 0;
  const base = prevValue + contribution + additional;
  const rate = base > 0 ? (profit / base) * 100 : 0;
  async function save() {
    if (!value || value <= 0) { setNotice("月末の評価額を入力してください。"); return; }
    setSaving(true);
    try {
      await upsertInvestmentRecord(state.householdId ?? "", { investmentAccountId: account.id, month, monthEndValue: value, additionalInvestment: additional, saleAmount: sale, note });
      await reload();
      setNotice(`${account.name}の${formatMonthLabel(month)}の評価額を記入しました。`);
      const nextMissing = accounts.find((item) => item.id !== account.id && (!item.startMonth || item.startMonth <= month) && !records.some((record) => record.investmentAccountId === item.id && record.month === month));
      if (nextMissing) setAccountId(nextMissing.id); else onClose();
    } catch (error) {
      setNotice(toJapaneseError(error, "評価額の記入に失敗しました。"));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!existing) return;
    try {
      await deleteInvestmentRecord(existing.id);
      await reload();
      setNotice(`${formatMonthLabel(month)}の記録を削除しました。`);
      onClose();
    } catch (error) {
      setNotice(toJapaneseError(error, "記録の削除に失敗しました。"));
    }
  }
  return (
    <SettingsSheet title={`${Number(month.slice(5, 7))}月の評価額を記入`} onClose={onClose}>
      {accounts.length > 1 && (
        <div className="inv-chips in-sheet" role="group" aria-label="投資口座">
          {accounts.map((item) => {
            const done = records.some((record) => record.investmentAccountId === item.id && record.month === month);
            return (
              <button key={item.id} type="button" className={item.id === account.id ? "on" : ""} onClick={() => setAccountId(item.id)}>
                <i style={{ background: item.color || investmentKindColor(item.accountKind) }} />{item.name}<small>{done ? "記入済み" : "未記入"}</small>
              </button>
            );
          })}
        </div>
      )}
      <label className="record-amount">
        <span>{account.name}の月末の評価額</span>
        <span className="record-amount-input"><em>¥</em><input type="number" inputMode="numeric" autoFocus value={numberInputValue(value)} placeholder={String(prevValue + contribution)} onChange={(event) => setValue(Number(event.target.value || 0))} /></span>
      </label>
      <div className="record-hint">
        <span>先月 {plainAmount(prevValue)} ＋ 積立 {plainAmount(contribution)}</span>
        {value > 0 && <span>今月の損益 <b className={profit >= 0 ? "pos" : "neg"}>{signedAmount(profit)}（{signedRate(rate)}）</b></span>}
      </div>
      <div className="sheet-fields">
        <div className="sheet-field"><span>積立</span><span className="num sheet-static">{plainAmount(contribution)} <small>設定の積立額</small></span></div>
        <label className="sheet-field"><span>追加投資</span><input type="number" inputMode="numeric" value={numberInputValue(additional)} placeholder="0" onChange={(event) => setAdditional(Number(event.target.value || 0))} /></label>
        <label className="sheet-field"><span>売却</span><input type="number" inputMode="numeric" value={numberInputValue(sale)} placeholder="0" onChange={(event) => setSale(Number(event.target.value || 0))} /></label>
        <label className="sheet-field"><span>メモ</span><input value={note} placeholder="任意" onChange={(event) => setNote(event.target.value)} /></label>
      </div>
      <button className="full-primary" type="button" disabled={saving} onClick={save}>{saving ? "記入中…" : existing ? "修正する" : "記入する"}</button>
      {existing && <button type="button" className="sheet-danger-link" onClick={remove}>この月の記録を削除</button>}
    </SettingsSheet>
  );
}

function defaultInvestmentAccountDraft() {
  return { name: "", accountKind: "securities" as "securities" | "ideco" | "nisa", startMonth: todayIso().slice(0, 7), initialAmount: 0, initialPrincipal: null as number | null, monthlyContribution: 100000, targetAnnualRate: 5, color: "#0f766e" };
}

function latestInvestmentValue(state: LedgerState, accountId: string, monthKey: string) {
  const account = (state.investmentAccounts ?? []).find((item) => item.id === accountId);
  const latest = (state.investmentRecords ?? []).filter((record) => record.investmentAccountId === accountId && record.month <= monthKey).sort((a, b) => b.month.localeCompare(a.month))[0];
  return latest?.monthEndValue ?? account?.initialAmount ?? 0;
}

function investmentContributionForMonth(state: LedgerState, account: LedgerState["investmentAccounts"][number], monthKey: string) {
  const change = (state.investmentContributionChanges ?? [])
    .filter((item) => item.investmentAccountId === account.id && item.month <= monthKey)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  return change?.monthlyContribution ?? account.monthlyContribution;
}

function investmentSummary(state: LedgerState, accountId: string, monthKey: string) {
  return investmentRows(state, accountId, monthKey).find((row) => row.month === monthKey);
}

function investmentRows(state: LedgerState, accountId: string, endMonthKey: string) {
  const account = (state.investmentAccounts ?? []).find((item) => item.id === accountId);
  if (!account) return [];
  const records = (state.investmentRecords ?? []).filter((record) => record.investmentAccountId === accountId);
  const months = new Set<string>();
  monthRange(account.startMonth, endMonthKey).forEach((month) => months.add(month));
  records.forEach((record) => {
    if (record.month <= endMonthKey) months.add(record.month);
  });
  const sortedMonths = Array.from(months).sort();
  let previousActual = account.initialAmount;
  let previousTarget = account.initialAmount;
  // その年の達成率を出すための年内トラッキング（年初の実績・年内の投入額累計）
  let yearStartActual = account.initialAmount;
  let yearContribCumulative = 0;
  let currentYear: string | null = null;
  // initialPrincipal が設定されていればそれを元金の起点に、なければ initialAmount と同じとみなす
  let cumulativePrincipal = account.initialPrincipal ?? account.initialAmount;
  const monthlyTargetRate = Math.pow(1 + account.targetAnnualRate / 100, 1 / 12) - 1;
  return sortedMonths.map((month) => {
    const record = records.find((item) => item.month === month);
    const additionalInvestment = record?.additionalInvestment ?? 0;
    const saleAmount = record?.saleAmount ?? 0;
    const monthlyContribution = investmentContributionForMonth(state, account, month);
    const contribution = monthlyContribution + additionalInvestment - saleAmount;
    const targetValue = Math.round(previousTarget * (1 + monthlyTargetRate) + contribution);
    const monthEndValue = record?.monthEndValue ?? targetValue;
    const assetDelta = monthEndValue - previousActual;
    const profit = monthEndValue - previousActual - monthlyContribution - additionalInvestment + saleAmount;
    const capitalBase = previousActual + monthlyContribution + additionalInvestment;
    const monthlyReturnRate = capitalBase > 0 ? (profit / capitalBase) * 100 : 0;
    // 達成率 = その年の累計損益 ÷ その年の年間目標損益(年初評価額×目標年利)
    const year = month.slice(0, 4);
    if (currentYear !== year) {
      currentYear = year;
      yearStartActual = previousActual;
      yearContribCumulative = 0;
    }
    yearContribCumulative += contribution;
    const yearTargetGain = yearStartActual * (account.targetAnnualRate / 100);
    const yearActualGain = monthEndValue - yearStartActual - yearContribCumulative;
    const achievementRate = yearTargetGain !== 0 ? (yearActualGain / yearTargetGain) * 100 : 0;
    cumulativePrincipal += monthlyContribution + additionalInvestment - saleAmount;
    const unrealizedGain = monthEndValue - cumulativePrincipal;
    previousActual = monthEndValue;
    previousTarget = targetValue;
    return {
      month,
      label: `${Number(month.slice(5, 7))}月`,
      targetValue,
      monthEndValue,
      monthlyContribution,
      additionalInvestment,
      saleAmount,
      assetDelta,
      profit,
      monthlyReturnRate,
      achievementRate,
      cumulativePrincipal,
      unrealizedGain,
      note: record?.note ?? ""
    };
  });
}

function investmentYearRows(rows: ReturnType<typeof investmentRows>) {
  const groups = new Map<string, typeof rows>();
  rows.forEach((row) => {
    const year = row.month.slice(0, 4);
    const items = groups.get(year) ?? [];
    items.push(row);
    groups.set(year, items);
  });
  return Array.from(groups.entries()).map(([year, items]) => {
    const sorted = [...items].sort((a, b) => a.month.localeCompare(b.month));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const monthlyContribution = sorted.reduce((sum, row) => sum + row.monthlyContribution, 0);
    const additionalInvestment = sorted.reduce((sum, row) => sum + row.additionalInvestment, 0);
    const saleAmount = sorted.reduce((sum, row) => sum + row.saleAmount, 0);
    const profit = sorted.reduce((sum, row) => sum + row.profit, 0);
    const startValue = first.monthEndValue - first.assetDelta;
    const assetDelta = last.monthEndValue - startValue;
    const capitalBase = startValue + monthlyContribution + additionalInvestment;
    const returnRate = capitalBase > 0 ? (profit / capitalBase) * 100 : 0;
    return {
      year,
      startValue,
      endValue: last.monthEndValue,
      monthlyContribution,
      additionalInvestment,
      saleAmount,
      profit,
      assetDelta,
      returnRate
    };
  }).sort((a, b) => b.year.localeCompare(a.year));
}

function monthRange(startMonthKey: string, endMonthKey: string) {
  if (!startMonthKey || !endMonthKey || startMonthKey > endMonthKey) return [];
  const months: string[] = [];
  let current = startMonthKey;
  while (current <= endMonthKey) {
    months.push(current);
    current = shiftMonthKey(current, 1);
  }
  return months;
}

function TransactionDetail({ transaction, state }: { transaction: LedgerState["transactions"][number]; state: LedgerState }) {
  const category = state.categories.find((item) => item.id === transaction.categoryId);
  const account = state.accounts.find((item) => item.id === transaction.accountId);
  const transferTo = state.accounts.find((item) => item.id === transaction.transferToAccountId);
  return (
    <div className="transaction-detail">
      <div><span>種類</span><strong>{transaction.transferGroupId ? (transaction.transferDirection === "in" ? "資金移動（受け取り）" : "資金移動") : transactionTypeLabel[transaction.type]}</strong></div>
      {transaction.transferGroupId && <div><span>相手</span><strong>{transaction.counterpartyHouseholdName ?? "別の家計簿"}{transaction.counterpartyAccountName ? `（${transaction.counterpartyAccountName}）` : ""}</strong></div>}
      <div><span>金額</span><strong>{yen.format(transaction.amount)}</strong></div>
      {transaction.type !== "transfer" && <div><span>カテゴリ</span><strong>{category?.name ?? "未設定"}</strong></div>}
      <div><span>{transaction.type === "income" ? "入金先" : "支払元"}</span><strong>{account?.name ?? "未設定"}</strong></div>
      {transaction.type === "transfer" && !transaction.transferGroupId && <div><span>振替先</span><strong>{transferTo?.name ?? "未設定"}</strong></div>}
      <div><span>{transaction.reflectedDate ? "使用日" : "日付"}</span><strong>{transaction.date}</strong></div>
      {transaction.reflectedDate && <div><span>引落日</span><strong>{transaction.reflectedDate}</strong></div>}
      <div><span>メモ</span><strong>{transaction.memo || "なし"}</strong></div>
    </div>
  );
}

function LedgerColorPicker({ householdId, currentColor, onSave }: { householdId: string; currentColor?: string; onSave: (color: string | null) => void }) {
  const [pending, setPending] = useState(coverColor(currentColor));
  return (
    <div className="ledger-color-picker">
      <div className="lcp-label">通帳の表紙の色<span>ボタンや目印の色が変わります</span></div>
      <div className="lcp-presets">
        {LEDGER_PRESET_COLORS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            title={preset.label}
            className={`lcp-swatch${pending === preset.value ? " active" : ""}`}
            style={{ background: preset.value }}
            onClick={() => setPending(preset.value)}
          ><span>{preset.label}</span></button>
        ))}
      </div>
      <div className="lcp-custom">
        <label>カスタム
          <input type="color" value={pending} onChange={(e) => setPending(e.target.value)} />
        </label>
        <button type="button" className="mini-button" onClick={() => onSave(pending)}>適用</button>
        {currentColor && <button type="button" className="mini-button" onClick={() => { setPending(DEFAULT_COVER_COLOR); onSave(null); }}>リセット</button>}
      </div>
    </div>
  );
}

// ── CSV出力ユーティリティ ──
function csvEscape(value: string | number | undefined | null) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const lines = [header, ...rows].map((cols) => cols.map(csvEscape).join(","));
  // Excel(日本語)で文字化けしないようBOM付きUTF-8で出力
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportTransactionsCsv(state: LedgerState, from: string, to: string) {
  const header = ["日付", "種類", "金額", "カテゴリ", "サブカテゴリ", "口座", "振替先", "カード状態", "メモ"];
  const rows = [...state.transactions]
    .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
    .sort((a, b) => (a.date === b.date ? (a.createdAt ?? "").localeCompare(b.createdAt ?? "") : a.date.localeCompare(b.date)))
    .map((t) => {
      const category = state.categories.find((c) => c.id === t.categoryId);
      const subcategory = state.categories.find((c) => c.id === t.subcategoryId);
      const account = state.accounts.find((a) => a.id === t.accountId);
      const transferTo = state.accounts.find((a) => a.id === t.transferToAccountId);
      return [
        t.date,
        transactionTypeLabel[t.type],
        t.amount,
        t.type === "transfer" ? "" : category?.name ?? "",
        t.type === "transfer" ? "" : subcategory?.name ?? "",
        account?.name ?? "",
        t.transferGroupId ? `${t.transferDirection === "in" ? "←" : "→"}${t.counterpartyHouseholdName ?? ""}${t.counterpartyAccountName ? `（${t.counterpartyAccountName}）` : ""}` : t.type === "transfer" ? transferTo?.name ?? "" : "",
        t.creditStatus ? creditStatusLabel[t.creditStatus] : "",
        t.memo ?? ""
      ];
    });
  const stamp = todayIso();
  downloadCsv(`取引明細_${stamp}.csv`, header, rows);
}

function exportInvestmentMonthlyCsv(state: LedgerState, from: string, to: string) {
  const header = ["投資口座", "種類", "月", "評価額", "積立", "追加投資", "売却", "純利益", "月利(%)", "達成率(%)", "累計元金", "含み益", "メモ"];
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const fromMonth = from ? from.slice(0, 7) : "";
  const toMonth = to ? to.slice(0, 7) : "";
  const rows: (string | number)[][] = [];
  (state.investmentAccounts ?? []).forEach((account) => {
    const kindLabel = investmentKindLabel(account.accountKind);
    investmentRows(state, account.id, currentMonthKey)
      .filter((row) => (!fromMonth || row.month >= fromMonth) && (!toMonth || row.month <= toMonth))
      .forEach((row) => {
        rows.push([
          account.name,
          kindLabel,
          row.month,
          row.monthEndValue,
          row.monthlyContribution,
          row.additionalInvestment,
          row.saleAmount,
          row.profit,
          row.monthlyReturnRate.toFixed(2),
          Math.round(row.achievementRate),
          row.cumulativePrincipal,
          row.unrealizedGain,
          row.note ?? ""
        ]);
      });
  });
  const stamp = todayIso();
  downloadCsv(`投資月別実績_${stamp}.csv`, header, rows);
}

function SettingsView({
  state,
  setNotice,
  reloadHousehold,
  reload,
  page,
  setPage,
  theme,
  setTheme,
  onOpenTour,
  onOpenAdmin,
  onOpenTaxes,
  onSignOut
}: {
  state: LedgerState;
  setNotice: (message: string) => void;
  reloadHousehold: (householdId: string) => Promise<void>;
  reload: () => Promise<void>;
  page: SettingsPage;
  setPage: (page: SettingsPage) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  onOpenTour: () => void;
  onOpenAdmin: () => void;
  onOpenTaxes?: () => void;
  onSignOut: () => void;
}) {
  const [taxAddKind, setTaxAddKind] = useState<TaxKind | null>(null);
  const isBusinessLedger = state.activeSpace === "shared" && state.ledgerPurpose === "business";
  const [sharedName, setSharedName] = useState("共有家計簿");
  const [showCreateShared, setShowCreateShared] = useState(false);
  const [creatingShared, setCreatingShared] = useState(false);
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
  const settingsTab = page;
  const [showJoin, setShowJoin] = useState(false);
  const [categoryKind, setCategoryKind] = useState<"expense" | "income">("expense");
  const [fixedEditId, setFixedEditId] = useState<string | null>(null);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [weekStart, setWeekStart] = useWeekStart();
  const firstBankAccountId = state.accounts.find((account) => account.type === "bank")?.id ?? state.accounts.find((account) => account.type !== "credit")?.id ?? "";
  const firstParentCategoryId = state.categories.find((category) => !category.parentId)?.id ?? "";
  const firstExpenseCategoryId = state.categories.find((category) => category.kind === "expense" && !category.parentId)?.id ?? state.categories.find((category) => category.kind === "expense")?.id ?? "";
  const firstIncomeCategoryId = state.categories.find((category) => category.kind === "income" && !category.parentId)?.id ?? state.categories.find((category) => category.kind === "income")?.id ?? "";
  const [newAccount, setNewAccount] = useState({ name: "", type: "bank" as AccountType, openingBalance: 0, openingBalanceDate: todayIso(), color: accountColorForType("bank"), closingDay: 25, withdrawalDay: 10, withdrawalAccountId: firstBankAccountId });
  const [categoryDraft, setCategoryDraft] = useState({ level: "main" as "main" | "sub", name: "", color: "#0f766e", kind: "expense" as "expense" | "income", parentId: firstParentCategoryId });
  const [newFixedScope, setNewFixedScope] = useState<"self" | "ledger">("self");
  const [newFixedDest, setNewFixedDest] = useState<LedgerDestination>(() => { const memory = readLedgerTransferMemory(state.householdId); return { toHouseholdId: memory.toHouseholdId, toAccountId: memory.toAccountId, fromCategoryId: memory.fromCategoryId, toCategoryId: memory.toCategoryId, countAsExpense: memory.countAsExpense, countAsIncome: memory.countAsIncome }; });
  const [newFixedOverdraft, setNewFixedOverdraft] = useState<OverdraftInfo | null>(null);
  const hasOtherLedgers = (state.households ?? []).some((ledger) => ledger.id !== state.householdId);
  const [newFixed, setNewFixed] = useState({ name: "", kind: "expense" as TransactionType, categoryId: firstExpenseCategoryId, accountId: firstBankAccountId, transferToAccountId: "", amount: 0, variable: false, dueDay: 1, status: "planned" as const, effectiveFrom: todayIso().slice(0, 7) + "-01", effectiveTo: undefined as string | undefined, memo: "" });
  useEffect(() => { setNewFixedOverdraft(null); }, [newFixed.amount, newFixed.dueDay, newFixed.accountId, newFixed.effectiveFrom, newFixedScope]);
  async function submitNewFixed(allowOverdraft: boolean) {
    const isLedger = newFixed.kind === "transfer" && hasOtherLedgers && newFixedScope === "ledger";
    try {
      if (newFixed.kind !== "transfer" && !newFixed.categoryId) {
        setNotice(newFixed.kind === "income" ? "固定収入のカテゴリを選択してください。" : "固定費のカテゴリを選択してください。");
        return;
      }
      if (!newFixed.accountId) {
        setNotice(newFixed.kind === "income" ? "固定収入の入金先を選択してください。" : newFixed.kind === "transfer" ? "定期振替の振替元を選択してください。" : "固定費の支払元を選択してください。");
        return;
      }
      if (isLedger && !newFixedDest.toAccountId) {
        setNotice("移動先の口座を選択してください。");
        return;
      }
      if (newFixed.kind === "transfer" && !isLedger && !newFixed.transferToAccountId) {
        setNotice("定期振替の振替先を選択してください。");
        return;
      }
      if (newFixed.kind === "transfer" && !allowOverdraft) {
        const nextDate = nextFixedOccurrenceDate(newFixed.dueDay, newFixed.effectiveFrom, newFixed.effectiveTo);
        const info = nextDate ? overdraftFor(state, newFixed.accountId, newFixed.amount, nextDate, undefined, true) : null;
        if (info) { setNewFixedOverdraft(info); return; }
      }
      if (isLedger) {
        const groupId = await createLedgerFixedTransfer({
          fromHouseholdId: state.householdId ?? "",
          fromAccountId: newFixed.accountId,
          fromCategoryId: newFixedDest.fromCategoryId || undefined,
          toHouseholdId: newFixedDest.toHouseholdId,
          toAccountId: newFixedDest.toAccountId,
          toCategoryId: newFixedDest.toCategoryId || undefined,
          name: newFixed.name || "資金移動",
          amount: newFixed.amount,
          dueDay: newFixed.dueDay,
          effectiveFrom: newFixed.effectiveFrom,
          effectiveTo: newFixed.effectiveTo,
          countAsExpense: newFixedDest.countAsExpense,
          countAsIncome: newFixedDest.countAsIncome
        });
        if (newFixed.memo.trim() && groupId) await saveLedgerFixedMemo(groupId, newFixed.memo.trim());
      } else {
        await createFixedCost(state.householdId ?? "", { ...newFixed, memo: newFixed.memo.trim() || undefined });
      }
      await reload();
      setNewFixed({ name: "", kind: "expense", categoryId: firstExpenseCategoryId, accountId: firstBankAccountId, transferToAccountId: "", amount: 0, variable: false, dueDay: 1, status: "planned", effectiveFrom: todayIso().slice(0, 7) + "-01", effectiveTo: undefined, memo: "" });
      setNewFixedOverdraft(null);
      setShowFixedForm(false);
      setNotice(isLedger ? "定期の資金移動を追加しました。相手の家計簿にも登録されています。" : newFixed.kind === "income" ? "固定収入を追加しました。" : newFixed.kind === "transfer" ? "定期振替を追加しました。" : "固定費を追加しました。");
    } catch (error) { setNotice(toJapaneseError(error, "定期項目の追加に失敗しました。")); }
  }
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
      {page === "top" ? (
        <SettingsTop
          state={state}
          setPage={setPage}
          theme={theme}
          setTheme={setTheme}
          weekStart={weekStart}
          setWeekStart={setWeekStart}
          onOpenTour={onOpenTour}
          onOpenAdmin={onOpenAdmin}
          onSignOut={onSignOut}
        />
      ) : (
        <div className="subpage-head">
          <button type="button" className="subpage-back" onClick={() => setPage("top")} aria-label="設定に戻る"><ChevronLeft size={24} /></button>
          <h1>{SETTINGS_PAGE_TITLES[page]}</h1>
          {page === "accounts" || page === "categories" || page === "fixed" ? (
            <button
              type="button"
              className="subpage-add"
              onClick={() => {
                if (page === "accounts") setShowAccountForm(true);
                if (page === "categories") { setCategoryDraft({ ...categoryDraft, level: "main", kind: categoryKind, name: "" }); setShowCategoryForm(true); }
                if (page === "fixed") setShowFixedForm(true);
              }}
            ><Plus size={14} />追加</button>
          ) : <span />}
        </div>
      )}
      {settingsTab === "ledger" && (
      <>
      <section className="settings-block">
        <div className="settings-sec-h"><span>あなたの家計簿</span></div>
        <div className="settings-list">
          {(state.households ?? []).map((household) => (
            <button
              className="settings-row ledger-row"
              key={household.id}
              type="button"
              onClick={() => setLedgerModalId(household.id)}
            >
              <i className="cover-swatch" style={{ background: coverColor(household.themeColor) }} />
              <span className="settings-row-text"><b>{household.name}</b><small><LedgerKindTag kind={ledgerKindOf(household)} className="inline" />{household.memberRole === "owner" ? "オーナー" : "メンバー"}</small></span>
              {household.id === state.householdId ? <span className="now-tag">表示中</span> : <span />}
              <ChevronRight size={16} className="settings-chev" />
            </button>
          ))}
        </div>
        <div className="settings-btn-row">
          <button className="full-primary" type="button" onClick={() => { setSharedName("共有家計簿"); setShowCreateShared(true); }}>共有家計簿をつくる</button>
          <button className="google-button" type="button" onClick={() => setShowJoin((v) => !v)}>招待コードで参加</button>
        </div>
        {modalLedger && createPortal(
          <div className="sheet-backdrop page-backdrop" onClick={() => setLedgerModalId(null)}>
            <div className="ledger-detail page-sheet" onClick={(event) => event.stopPropagation()}>
              <button className="modal-close" type="button" onClick={() => setLedgerModalId(null)}>閉じる</button>
              {modalLedger.id !== state.householdId && (
                <button
                  className="full-primary"
                  type="button"
                  onClick={async () => {
                    try {
                      await reloadHousehold(modalLedger.id);
                      setLedgerModalId(null);
                      setNotice(`${modalLedger.name}に切り替えました。`);
                    } catch (error) {
                      setNotice(toJapaneseError(error, "家計簿の切替に失敗しました。"));
                    }
                  }}
                >この家計簿を表示する</button>
              )}
              <div>
                <span>家計簿名</span>
                <strong>{modalLedger.name}</strong>
                <em>{modalLedger.spaceType === "personal" ? "個人家計簿" : ledgerKindOf(modalLedger) === "business" ? "事業用の家計簿" : "共有家計簿"} / {modalLedger.memberRole === "owner" ? "所有者" : "メンバー"}</em>
              </div>
              {modalLedger.spaceType === "shared" && (
                <LedgerPurposeChoice
                  ledger={modalLedger}
                  onChanged={async (purpose) => {
                    await reload();
                    setNotice(purpose === "business" ? `${modalLedger.name}を事業用にしました。資産に「税金」タブが出ます。` : `${modalLedger.name}を生活費の家計簿にしました。`);
                  }}
                  setNotice={setNotice}
                />
              )}
              <LedgerColorPicker
                householdId={modalLedger.id}
                currentColor={modalLedger.themeColor}
                onSave={(color) => {
                  saveHouseholdThemeColor(modalLedger.id, color);
                  setNotice("表紙の色を変更しました。");
                  // 現在表示中の家計簿なら CSS 変数を即時反映
                  if (modalLedger.id === state.householdId) {
                    if (color) {
                      document.documentElement.style.setProperty("--ledger-color", color);
                    } else {
                      document.documentElement.style.removeProperty("--ledger-color");
                    }
                  }
                  // state を同期（reloadHousehold は同一IDをスキップするため reload を使う）
                  reload().catch(() => undefined);
                }}
              />
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
                          await reload();
                          setLedgerModalId(null);
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
                        <p>この家計簿を削除します。取引・口座・固定費も見えなくなります。</p>
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
          </div>,
          document.body
        )}
      </section>

      {showJoin && (
      <section className="settings-block">
        <div className="share-actions join-box">
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
            参加する
          </button>
        </div>
      </section>
      )}
      {showCreateShared && createPortal(
        <div className="sheet-backdrop page-backdrop" onClick={() => { if (!creatingShared) setShowCreateShared(false); }}>
          <div className="ledger-detail page-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setShowCreateShared(false)} disabled={creatingShared}>閉じる</button>
            <div>
              <span>共有家計簿の作成</span>
              <strong>新しい共有家計簿</strong>
              <em>家族やパートナーと共有できる家計簿を作成します。</em>
            </div>
            <div className="rename-box">
              <label>家計簿名<input value={sharedName} onChange={(event) => setSharedName(event.target.value)} placeholder="例: 共有家計簿" /></label>
            </div>
            <section className="settings-guide">
              <strong>登録内容</strong>
              <span>作成後に共有IDが発行され、招待コードでメンバーを招待できます。名前は後から変更できます。</span>
            </section>
            <button
              className="full-primary"
              type="button"
              disabled={creatingShared}
              onClick={async () => {
                if (creatingShared) return;
                if (!sharedName.trim()) {
                  setNotice("家計簿名を入力してください。");
                  return;
                }
                setCreatingShared(true);
                try {
                  const householdId = await createSharedLedger(sharedName.trim());
                  await reloadHousehold(householdId);
                  setShowCreateShared(false);
                  setNotice("共有家計簿を作成しました。");
                } catch (error) {
                  setNotice(toJapaneseError(error, "共有家計簿の作成に失敗しました。"));
                } finally {
                  setCreatingShared(false);
                }
              }}
            >
              {creatingShared ? "登録中…" : "登録する"}
            </button>
          </div>
        </div>,
        document.body
      )}
      </>
      )}
      {settingsTab === "accounts" && (
        <AccountsSettings state={state} setNotice={setNotice} reload={reload} addOpen={showAccountForm} setAddOpen={setShowAccountForm} />
      )}
      {settingsTab === "snapshots" && (
        <AssetSnapshotSettings state={state} setNotice={setNotice} reloadHousehold={async () => reload()} />
      )}
      {settingsTab === "categories" && (
      <>
        <nav className="segment-tabs" style={{ display: "flex" }} aria-label="カテゴリの種類">
          <button type="button" className={categoryKind === "expense" ? "active" : ""} onClick={() => setCategoryKind("expense")}>支出</button>
          <button type="button" className={categoryKind === "income" ? "active" : ""} onClick={() => setCategoryKind("income")}>収入</button>
        </nav>
        <div className="settings-list">
          {sortCategories(state.categories.filter((category) => !category.parentId && category.kind === categoryKind)).map((parent) => {
            const children = sortSubcategories(state.categories.filter((category) => category.parentId === parent.id));
            return (
              <div className="cat-parent" key={parent.id}>
                <button type="button" className="cat-parent-head" onClick={() => setCategoryModalId(parent.id)}>
                  <i style={{ background: parent.color }} />
                  <b>{parent.name}</b>
                  <small>{children.length > 0 ? `サブ ${children.length}` : ""}</small>
                  <ChevronRight size={16} className="settings-chev" />
                </button>
                <div className="cat-subs">
                  {children.map((child) => (
                    <button type="button" key={child.id} onClick={() => setCategoryModalId(child.id)}>{child.name}</button>
                  ))}
                  <button
                    type="button"
                    className="cat-sub-add"
                    onClick={() => {
                      setCategoryDraft({ ...categoryDraft, level: "sub", kind: categoryKind, parentId: parent.id, name: "", color: nextSubcategoryColor(state.categories, parent.id) });
                      setShowCategoryForm(true);
                    }}
                  ><Plus size={12} />{children.length > 0 ? "追加" : "サブカテゴリを追加"}</button>
                </div>
              </div>
            );
          })}
          {state.categories.filter((category) => !category.parentId && category.kind === categoryKind).length === 0 && (
            <div className="empty-state">まだカテゴリがありません。右上の「追加」から作成できます。</div>
          )}
        </div>
        <p className="settings-note">名前をタップすると、名前・色の変更や削除ができます。削除するときは、その取引の移し先を選べます。</p>
        {showCategoryForm && <SettingsSheet title={categoryDraft.level === "sub" ? "サブカテゴリを追加" : "カテゴリを追加"} onClose={() => setShowCategoryForm(false)}><div className="crud-form">
          {categoryDraft.level === "sub" && (
            <label>所属カテゴリー<select value={categoryDraft.parentId} onChange={(event) => {
              setCategoryDraft({ ...categoryDraft, parentId: event.target.value, color: nextSubcategoryColor(state.categories, event.target.value) });
            }}>
              <option value="">選択してください</option>
              {sortCategories(state.categories.filter((category) => !category.parentId && category.kind === categoryDraft.kind)).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select></label>
          )}
          <label>{categoryDraft.level === "sub" ? "サブカテゴリー名" : "カテゴリー名"}<input placeholder={categoryDraft.level === "sub" ? "例: スーパー" : "例: 食費"} value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} /></label>
          {categoryDraft.level === "main" && <label>色<input type="color" value={categoryDraft.color} onChange={(event) => setCategoryDraft({ ...categoryDraft, color: event.target.value })} /></label>}
          <p className="sheet-hint">{categoryDraft.level === "sub" ? "色は親カテゴリから自動で決まります。" : `${categoryDraft.kind === "income" ? "収入" : "支出"}のカテゴリとして追加します。`}</p>
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
              await reload();
              const resetParent = state.categories.find((category) => !category.parentId && category.kind === categoryDraft.kind)?.id ?? "";
              setCategoryDraft({ ...categoryDraft, name: "", parentId: resetParent });
              setShowCategoryForm(false);
              setNotice(categoryDraft.level === "sub" ? "サブカテゴリーを追加しました。" : "カテゴリーを追加しました。");
            } catch (error) { setNotice(toJapaneseError(error, "カテゴリー追加に失敗しました。")); }
          }}>追加する</button>
        </div></SettingsSheet>}
        {modalCategory && <CategoryModal category={modalCategory} state={state} setNotice={setNotice} reloadHousehold={async () => reload()} onClose={() => setCategoryModalId(null)} />}
      </>
      )}
      {settingsTab === "fixed" && (
      <>
        <FixedCostsOverview state={state} onEdit={(id) => setFixedEditId(id)} onOpenTaxes={onOpenTaxes} />
        {taxAddKind && <TaxAddSheet state={state} startYear={fiscalStartYear(todayIso().slice(0, 7))} initialKind={taxAddKind} setNotice={setNotice} reload={reload} onClose={() => setTaxAddKind(null)} />}
        {showFixedForm && <SettingsSheet title="定期項目を追加" onClose={() => setShowFixedForm(false)}><div className="crud-form">
          {isBusinessLedger && (
            <div className="tax-templates">
              <span>よく使う税金・社会保険</span>
              <div>
                {TAX_KIND_ORDER.map((kind) => (
                  <button key={kind} type="button" onClick={() => { setShowFixedForm(false); setTaxAddKind(kind); }}>
                    <i style={{ background: TAX_KIND_META[kind].color }}>{TAX_KIND_META[kind].mark}</i>{TAX_KIND_META[kind].label}
                  </button>
                ))}
              </div>
              <small>選ぶと、払う月と回数が入った状態で登録画面が開きます。</small>
            </div>
          )}
          <label>種類<select value={newFixed.kind} onChange={(event) => {
            const nextKind = event.target.value as TransactionType;
            setNewFixed({ ...newFixed, kind: nextKind, categoryId: nextKind === "income" ? firstIncomeCategoryId : nextKind === "expense" ? firstExpenseCategoryId : "", transferToAccountId: nextKind === "transfer" ? state.accounts.filter((account) => account.type !== "credit").find((account) => account.id !== newFixed.accountId)?.id ?? "" : "" });
          }}><option value="expense">定期支出</option><option value="income">定期収入</option><option value="transfer">定期振替</option></select></label>
          <label>名称<input placeholder={newFixed.kind === "income" ? "例: 給与 / 家賃収入" : newFixed.kind === "transfer" ? "例: 貯金口座へ移動" : "例: 家賃 / Netflix / 電気代"} value={newFixed.name} onChange={(event) => setNewFixed({ ...newFixed, name: event.target.value })} /></label>
          <label>金額<input type="number" min="0" value={numberInputValue(newFixed.amount)} onChange={(event) => setNewFixed({ ...newFixed, amount: Number(event.target.value || 0) })} /></label>
          {newFixed.kind !== "transfer" && <label>カテゴリ<select value={newFixed.categoryId} onChange={(event) => setNewFixed({ ...newFixed, categoryId: event.target.value })}><option value="">選択してください</option><CategoryOptions categories={state.categories} kind={newFixed.kind} /></select></label>}
          {newFixed.kind === "transfer" && hasOtherLedgers && (
            <div className="segmented compact transfer-scope" role="tablist" aria-label="移動先">
              <button type="button" className={newFixedScope === "self" ? "selected" : ""} onClick={() => setNewFixedScope("self")}>自分の口座間</button>
              <button type="button" className={newFixedScope === "ledger" ? "selected" : ""} onClick={() => setNewFixedScope("ledger")}>別の家計簿へ</button>
            </div>
          )}
          <label>{newFixed.kind === "income" ? "入金先" : newFixed.kind === "transfer" ? (newFixedScope === "ledger" && hasOtherLedgers ? "移動元の口座" : "振替元") : "支払元"}<AccountSelect value={newFixed.accountId} onChange={(nextId: string) => { setNewFixedOverdraft(null); setNewFixed({ ...newFixed, accountId: nextId, transferToAccountId: nextId === newFixed.transferToAccountId ? "" : newFixed.transferToAccountId }); }} accounts={sortAccountsByType(state.accounts.filter((account) => newFixed.kind === "expense" || account.type !== "credit"))} /></label>
          {newFixed.kind === "transfer" && hasOtherLedgers && newFixedScope === "ledger" && <LedgerDestinationFields state={state} value={newFixedDest} onChange={setNewFixedDest} recurring />}
          {newFixed.kind === "transfer" && !(hasOtherLedgers && newFixedScope === "ledger") && <label>振替先<AccountSelect value={newFixed.transferToAccountId} onChange={(nextId: string) => setNewFixed({ ...newFixed, transferToAccountId: nextId })} accounts={state.accounts.filter((account) => account.type !== "credit" && account.id !== newFixed.accountId)} placeholder="選択してください" /></label>}
          <label>{newFixed.kind === "income" ? "入金予定日" : newFixed.kind === "transfer" ? "振替予定日" : "支払予定日"}<input type="number" min="1" max="31" value={numberInputValue(newFixed.dueDay)} onChange={(event) => setNewFixed({ ...newFixed, dueDay: Number(event.target.value || 0) })} /></label>
          <label>{newFixed.effectiveTo ? "初回の月" : "開始月"}<input type="month" value={newFixed.effectiveFrom.slice(0, 7)} onChange={(event) => {
            if (!event.target.value) return;
            // 回数を保ったまま開始月を動かす
            const count = newFixed.effectiveTo ? monthsBetweenInclusive(newFixed.effectiveFrom.slice(0, 7), newFixed.effectiveTo.slice(0, 7)) : 0;
            setNewFixed({ ...newFixed, effectiveFrom: `${event.target.value}-01`, effectiveTo: count > 0 ? `${addMonthsKey(event.target.value, count - 1)}-01` : undefined });
          }} /></label>
          <InstallmentFields
            startMonth={newFixed.effectiveFrom.slice(0, 7)}
            endMonth={newFixed.effectiveTo?.slice(0, 7)}
            onChange={(end) => setNewFixed({ ...newFixed, effectiveTo: end ? `${end}-01` : undefined })}
            label="支払いの終わり（ローン・分割払いなら「終わりがある」）"
          />
          <label>メモ（任意）<textarea className="memo-input" rows={2} placeholder="例: 年1回の更新料込み／ボーナス月は多め" value={newFixed.memo} onChange={(event) => setNewFixed({ ...newFixed, memo: event.target.value })} /></label>
          {newFixedOverdraft ? <OverdraftConfirm info={newFixedOverdraft} onCancel={() => setNewFixedOverdraft(null)} onConfirm={() => { setNewFixedOverdraft(null); submitNewFixed(true); }} /> : <button className="full-primary" type="button" onClick={() => submitNewFixed(false)}>追加する</button>}
        </div></SettingsSheet>}
        {fixedEditId && (() => {
          const cost = state.fixedCosts.find((item) => item.id === fixedEditId);
          if (!cost) return null;
          return (
            <SettingsSheet title={cost.name} onClose={() => setFixedEditId(null)}>
              <FixedCostDetail key={cost.id} cost={cost} state={state} setNotice={setNotice} reloadHousehold={async () => reload()} onClose={() => setFixedEditId(null)} />
            </SettingsSheet>
          );
        })()}
      </>
      )}
      {settingsTab === "investment" && (
        <InvestmentSettings state={state} setNotice={setNotice} reload={reload} />
      )}
      {settingsTab === "cover" && state.householdId && (
        <section className="panel">
          <LedgerColorPicker
            householdId={state.householdId}
            currentColor={state.themeColor}
            onSave={(color) => {
              saveHouseholdThemeColor(state.householdId!, color);
              setNotice("表紙の色を変更しました。");
              reload().catch(() => undefined);
            }}
          />
        </section>
      )}
      {settingsTab === "templates" && <TemplateSettings state={state} setNotice={setNotice} />}
      {settingsTab === "export" && (
        <section className="panel">
          <p className="setting-copy" style={{ marginBottom: 12 }}>記録したデータをCSVファイルとして書き出します。Excelやスプレッドシートで開けます（文字コードはUTF-8）。</p>
          <div className="export-period">
            <span className="export-period-title">出力期間（空欄なら全期間）</span>
            <div className="export-period-inputs">
              <label>開始<input type="date" value={exportFrom} max={exportTo || undefined} onChange={(e) => setExportFrom(e.target.value)} /></label>
              <label>終了<input type="date" value={exportTo} min={exportFrom || undefined} onChange={(e) => setExportTo(e.target.value)} /></label>
              {(exportFrom || exportTo) && <button type="button" className="mini-button" onClick={() => { setExportFrom(""); setExportTo(""); }}>クリア</button>}
            </div>
            <small style={{ color: "var(--muted)", fontSize: 11 }}>投資の月別実績は月単位で期間を判定します。</small>
          </div>
          <div className="export-list">
            <div className="export-row">
              <div className="export-info">
                <strong>取引明細</strong>
                <small>日付・種類・金額・カテゴリ・口座・メモなど（全{state.transactions.length}件）</small>
              </div>
              <button
                type="button"
                className="mini-button"
                disabled={state.transactions.length === 0}
                onClick={() => { exportTransactionsCsv(state, exportFrom, exportTo); setNotice("取引明細をCSVで書き出しました。"); }}
              >
                CSV出力
              </button>
            </div>
            <div className="export-row">
              <div className="export-info">
                <strong>投資の月別実績</strong>
                <small>投資口座・種類ごとの評価額・積立・純利益・月利・達成率など（{(state.investmentAccounts ?? []).length}口座）</small>
              </div>
              <button
                type="button"
                className="mini-button"
                disabled={(state.investmentAccounts ?? []).length === 0}
                onClick={() => { exportInvestmentMonthlyCsv(state, exportFrom, exportTo); setNotice("投資月別実績をCSVで書き出しました。"); }}
              >
                CSV出力
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}


// ============================================================
// 設定：トップ（目的別のグループリスト）
// ============================================================
function SettingsRow({ icon: Icon, title, sub, value, onClick, children }: { icon: React.ElementType; title: string; sub?: string; value?: React.ReactNode; onClick?: () => void; children?: React.ReactNode }) {
  const body = (
    <>
      <span className="settings-ic"><Icon size={18} /></span>
      <span className="settings-row-text"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {children ?? <span className="settings-val">{value}</span>}
      {onClick && <ChevronRight size={16} className="settings-chev" />}
    </>
  );
  if (onClick) return <button type="button" className="settings-row" onClick={onClick}>{body}</button>;
  return <div className="settings-row inline">{body}</div>;
}

function SettingsTop({
  state,
  setPage,
  theme,
  setTheme,
  weekStart,
  setWeekStart,
  onOpenTour,
  onOpenAdmin,
  onSignOut
}: {
  state: LedgerState;
  setPage: (page: SettingsPage) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  weekStart: number;
  setWeekStart: (value: number) => void;
  onOpenTour: () => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
}) {
  const currentMonth = todayIso().slice(0, 7);
  const prevMonth = shiftMonthKey(currentMonth, -1);
  const bankCount = state.accounts.filter((account) => account.type !== "credit").length;
  const cardCount = state.accounts.filter((account) => account.type === "credit").length;
  const expenseCats = state.categories.filter((category) => !category.parentId && category.kind === "expense").length;
  const incomeCats = state.categories.filter((category) => !category.parentId && category.kind === "income").length;
  const activeFixed = state.fixedCosts.filter((cost) => !cost.effectiveTo || cost.effectiveTo.slice(0, 7) >= currentMonth).length;
  const templateCount = loadTxTemplates(state.householdId).length;
  const latestConfirmed = isAssetSnapshotConfirmed(state, currentMonth) ? currentMonth : isAssetSnapshotConfirmed(state, prevMonth) ? prevMonth : null;
  const cover = coverColor(state.themeColor);
  const coverLabel = LEDGER_PRESET_COLORS.find((preset) => preset.value === cover)?.label ?? "カスタム";
  const household = (state.households ?? []).find((item) => item.id === state.householdId);
  return (
    <div className="settings-top">
      <button type="button" className="ledger-cover" onClick={() => setPage("ledger")}>
        <span className="ledger-cover-label"><small>Mirai Ledger</small><b>{state.householdName ?? "家計簿"}</b></span>
        <span className="ledger-cover-meta">
          <span>{(household?.spaceType ?? state.activeSpace) === "shared" ? "共有の家計簿" : "個人の家計簿"}／口座 {bankCount}・カード {cardCount}</span>
          <span className="ledger-cover-manage">家計簿を管理<ChevronRight size={14} /></span>
        </span>
      </button>

      <div className="settings-group-label">お金の記録</div>
      <div className="settings-list">
        <SettingsRow icon={Wallet} title="口座・カード" sub="銀行・現金・クレジットカード" value={`${bankCount + cardCount}件`} onClick={() => setPage("accounts")} />
        <SettingsRow icon={Tag} title="カテゴリ" sub="食費 › 外食 などの分類" value={`支出 ${expenseCats}・収入 ${incomeCats}`} onClick={() => setPage("categories")} />
        <SettingsRow icon={Repeat} title="定期項目" sub="家賃・給与など毎月の予定" value={`${activeFixed}件`} onClick={() => setPage("fixed")} />
        <SettingsRow icon={Star} title="テンプレート" sub="よく使う取引を1タップで" value={`${templateCount}件`} onClick={() => setPage("templates")} />
      </div>

      <div className="settings-group-label">資産</div>
      <div className="settings-list">
        <SettingsRow
          icon={Stamp}
          title="月末資産の確定"
          sub="口座の実際の残高に合わせる"
          value={latestConfirmed ? <span className="mini-hanko" title={`${formatMonthLabel(latestConfirmed)}は確定済み`}>確定</span> : <span className="settings-val-warn">未確定</span>}
          onClick={() => setPage("snapshots")}
        />
        <SettingsRow icon={LineChartIcon} title="投資口座" sub="評価額・積立額・目標年利" value={`${(state.investmentAccounts ?? []).length}件`} onClick={() => setPage("investment")} />
      </div>

      <div className="settings-group-label">表示</div>
      <div className="settings-list">
        <SettingsRow icon={BookMarked} title="表紙の色" value={<>{coverLabel}<i className="cover-swatch small" style={{ background: cover }} /></>} onClick={() => setPage("cover")} />
        <SettingsRow icon={Sun} title="テーマ">
          <span className="mini-seg" role="group" aria-label="テーマ">
            <button type="button" className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>昼</button>
            <button type="button" className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>夜</button>
          </span>
        </SettingsRow>
        <SettingsRow icon={CalendarDays} title="週の始まり">
          <span className="mini-seg" role="group" aria-label="週の始まり">
            <button type="button" className={weekStart === 0 ? "on" : ""} onClick={() => setWeekStart(0)}>日曜</button>
            <button type="button" className={weekStart === 1 ? "on" : ""} onClick={() => setWeekStart(1)}>月曜</button>
          </span>
        </SettingsRow>
      </div>

      <div className="settings-group-label">データとサポート</div>
      <div className="settings-list">
        <SettingsRow icon={Download} title="データの書き出し" sub="取引明細・投資実績をCSVで" onClick={() => setPage("export")} />
        <SettingsRow icon={HelpCircle} title="使い方ガイド" onClick={onOpenTour} />
        {state.profileRole === "admin" && <SettingsRow icon={ShieldCheck} title="管理画面" sub="管理者のみ表示" onClick={onOpenAdmin} />}
      </div>

      <div className="settings-list settings-logout">
        <button type="button" onClick={onSignOut}>ログアウト</button>
      </div>
      <p className="settings-foot">Mirai Ledger</p>
    </div>
  );
}

// 下から出る編集シート
function SettingsSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="sheet-backdrop settings-sheet-backdrop" onClick={onClose}>
      <section className="bottom-sheet settings-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="settings-sheet-head"><h2>{title}</h2><button type="button" onClick={onClose}>閉じる</button></div>
        {children}
      </section>
    </div>,
    document.body
  );
}

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string; icon: React.ElementType }[] = [
  { value: "bank", label: "銀行", icon: Landmark },
  { value: "cash", label: "現金", icon: Banknote },
  { value: "saving", label: "貯金", icon: PiggyBank },
  { value: "credit", label: "カード", icon: CreditCard }
];

function closingDayLabel(day?: number) {
  if (!day) return "未設定";
  return day >= 31 ? "末日" : `${day}日`;
}

function AccountsSettings({ state, setNotice, reload, addOpen, setAddOpen }: { state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void>; addOpen: boolean; setAddOpen: (open: boolean) => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const month = todayIso().slice(0, 7);
  const today = todayIso();
  const banks = sortAccountsByType(state.accounts.filter((account) => account.type !== "credit"));
  const cards = state.accounts.filter((account) => account.type === "credit");
  const balances = Object.fromEntries(banks.map((account) => [account.id, confirmedAccountBalance(account, state, month)]));
  const bankTotal = banks.reduce((sum, account) => sum + (balances[account.id] ?? 0), 0);
  const withdrawals = upcomingCardWithdrawals(state, today);
  // 次回の引落（いちばん近い引落日の金額）を表示する
  const pendingFor = (cardId: string) => {
    const next = withdrawals.find((item) => item.card.id === cardId);
    return { amount: next?.amount ?? 0, next: next?.date };
  };
  const editing = state.accounts.find((account) => account.id === editId);
  return (
    <>
      <div className="settings-sec-h"><span>口座</span><b className="num">{plainAmount(bankTotal)}</b></div>
      <div className="settings-list">
        {banks.map((account) => (
          <button type="button" className="settings-row account-item" key={account.id} onClick={() => setEditId(account.id)}>
            <AccountMark account={account} size="lg" />
            <span className="settings-row-text"><b>{account.name}</b><small>{accountTypeLabel(account.type)}</small></span>
            <span className="settings-amount num">{(balances[account.id] ?? 0) < 0 ? "−" : ""}{plainAmount(balances[account.id] ?? 0)}</span>
            <ChevronRight size={16} className="settings-chev" />
          </button>
        ))}
        {banks.length === 0 && <div className="empty-state">口座がまだありません。右上の「追加」から登録できます。</div>}
      </div>
      <div className="settings-sec-h"><span>クレジットカード</span></div>
      <div className="settings-list">
        {cards.map((account) => {
          const withdrawal = state.accounts.find((item) => item.id === account.withdrawalAccountId);
          const pending = pendingFor(account.id);
          return (
            <button type="button" className="settings-row account-item" key={account.id} onClick={() => setEditId(account.id)}>
              <AccountMark account={account} size="lg" />
              <span className="settings-row-text"><b>{account.name}</b><small>{closingDayLabel(account.closingDay)}締め・{account.withdrawalDay ?? 10}日引落／{withdrawal?.name ?? "引落口座未設定"}から</small></span>
              <span className="settings-amount num">{plainAmount(pending.amount)}{pending.next && <small>{shortDate(pending.next)} 引落</small>}</span>
              <ChevronRight size={16} className="settings-chev" />
            </button>
          );
        })}
        {cards.length === 0 && <div className="empty-state">カードはまだありません。</div>}
      </div>
      <p className="settings-note">残高は月末資産の確定と登録した取引から計算しています。行をタップすると、名前・色・はじめの残高・締め日を変えられます。</p>
      {addOpen && <AccountSheet state={state} setNotice={setNotice} reload={reload} onClose={() => setAddOpen(false)} />}
      {editing && <AccountSheet account={editing} state={state} setNotice={setNotice} reload={reload} onClose={() => setEditId(null)} />}
    </>
  );
}

function AccountSheet({ account, state, setNotice, reload, onClose }: { account?: LedgerState["accounts"][number]; state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void }) {
  const firstBank = state.accounts.find((item) => item.type === "bank")?.id ?? state.accounts.find((item) => item.type !== "credit")?.id ?? "";
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const [name, setName] = useState(account?.name ?? "");
  const [color, setColor] = useState(account?.color ?? LEDGER_PRESET_COLORS[0].value);
  const [openingBalance, setOpeningBalance] = useState(account?.openingBalance ?? 0);
  const [openingBalanceDate, setOpeningBalanceDate] = useState(account?.openingBalanceDate ?? todayIso());
  const [closingDay, setClosingDay] = useState(account?.closingDay ?? 25);
  const [withdrawalDay, setWithdrawalDay] = useState(account?.withdrawalDay ?? 10);
  const [withdrawalAccountId, setWithdrawalAccountId] = useState(account?.withdrawalAccountId ?? firstBank);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isCard = type === "credit";
  const swatches = LEDGER_PRESET_COLORS.some((preset) => preset.value === color) ? LEDGER_PRESET_COLORS : [...LEDGER_PRESET_COLORS, { label: "今の色", value: color }];
  async function save() {
    if (!name.trim()) { setNotice("名前を入力してください。"); return; }
    if (isCard && !withdrawalAccountId) { setNotice("引落口座を選んでください。"); return; }
    setSaving(true);
    try {
      if (account) {
        await updateAccount(account.id, {
          name: name.trim(),
          color,
          openingBalance: isCard ? 0 : openingBalance,
          openingBalanceDate: isCard ? account.openingBalanceDate ?? todayIso() : openingBalanceDate,
          closingDay: isCard ? closingDay : undefined,
          withdrawalDay: isCard ? withdrawalDay : undefined,
          withdrawalAccountId: isCard ? withdrawalAccountId : undefined
        });
        setNotice(`${name.trim()}を保存しました。`);
      } else {
        await createAccount(state.householdId ?? "", { name: name.trim(), type, color, openingBalance: isCard ? 0 : openingBalance, openingBalanceDate, closingDay, withdrawalDay, withdrawalAccountId: isCard ? withdrawalAccountId : undefined });
        setNotice(`${name.trim()}を追加しました。`);
      }
      await reload();
      onClose();
    } catch (error) {
      setNotice(toJapaneseError(error, account ? "口座の保存に失敗しました。" : "口座の追加に失敗しました。"));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!account) return;
    try {
      await deleteAccount(account.id);
      await reload();
      onClose();
      setNotice(`${account.name}を削除しました。`);
    } catch (error) {
      setNotice(toJapaneseError(error, "口座の削除に失敗しました。"));
    }
  }
  return (
    <SettingsSheet title={account ? account.name : "口座・カードを追加"} onClose={onClose}>
      <div className="type-grid" role="group" aria-label="種類">
        {ACCOUNT_TYPE_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button key={option.value} type="button" className={type === option.value ? "on" : ""} disabled={Boolean(account) && account?.type !== option.value} onClick={() => setType(option.value)}>
              <Icon size={20} />{option.label}
            </button>
          );
        })}
      </div>
      <div className="sheet-fields">
        <label className="sheet-field"><span>名前</span><input value={name} placeholder={isCard ? "例: 楽天カード" : "例: 楽天銀行"} onChange={(event) => setName(event.target.value)} /></label>
        <div className="sheet-field"><span>色</span>
          <div className="swatch-row">
            {swatches.map((preset) => (
              <button key={preset.value} type="button" title={preset.label} className={`cover-swatch${color === preset.value ? " on" : ""}`} style={{ background: preset.value }} onClick={() => setColor(preset.value)} aria-label={preset.label} />
            ))}
          </div>
        </div>
        {isCard ? (
          <>
            <div className="sheet-sub-title">カードの引落</div>
            <label className="sheet-field"><span>締め日</span>
              <select value={closingDay} onChange={(event) => setClosingDay(Number(event.target.value))}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{closingDayLabel(day)}</option>)}
              </select>
            </label>
            <label className="sheet-field"><span>引落日</span>
              <select value={withdrawalDay} onChange={(event) => setWithdrawalDay(Number(event.target.value))}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>毎月 {day}日</option>)}
              </select>
            </label>
            <label className="sheet-field"><span>引落口座</span>
              <AccountSelect value={withdrawalAccountId} onChange={(nextId: string) => setWithdrawalAccountId(nextId)} accounts={state.accounts.filter((item) => item.type !== "credit")} placeholder="選んでください" />
            </label>
            <p className="sheet-hint">このカードの支出は、自動で次の引落日に計上されます。</p>
          </>
        ) : (
          <>
            <div className="sheet-sub-title">はじめの残高</div>
            <label className="sheet-field"><span>初期残高</span><input type="number" inputMode="numeric" value={numberInputValue(openingBalance)} onChange={(event) => setOpeningBalance(Number(event.target.value || 0))} /></label>
            <label className="sheet-field"><span>基準日</span><input type="date" value={openingBalanceDate} onChange={(event) => setOpeningBalanceDate(event.target.value)} /></label>
            <p className="sheet-hint">普段のズレの調整は「月末資産の確定」で行えます。</p>
          </>
        )}
      </div>
      <button className="full-primary" type="button" disabled={saving} onClick={save}>{saving ? "保存中…" : account ? "保存する" : "追加する"}</button>
      {account && (
        confirmDelete ? (
          <div className="sheet-danger-confirm">
            <p>{account.name}を削除しますか？ 登録済みの取引は残りますが、口座の一覧からは消えます。</p>
            <div><button type="button" className="danger-solid" onClick={remove}>削除する</button><button type="button" className="google-button" onClick={() => setConfirmDelete(false)}>やめる</button></div>
          </div>
        ) : (
          <button type="button" className="sheet-danger-link" onClick={() => setConfirmDelete(true)}>この{isCard ? "カード" : "口座"}を削除</button>
        )
      )}
    </SettingsSheet>
  );
}

// ===================== 税金タブ（事業用の家計簿） =====================
const TAX_KIND_META: Record<TaxKind, { label: string; short: string; color: string; mark: string }> = {
  income_tax: { label: "所得税", short: "所得税", color: "#1C2A4A", mark: "所" },
  resident_tax: { label: "住民税", short: "住民税", color: "#0F6B62", mark: "住" },
  health_insurance: { label: "国民健康保険", short: "国保", color: "#9A6F12", mark: "保" },
  pension: { label: "国民年金", short: "年金", color: "#7A3A48", mark: "年" }
};
const TAX_KIND_ORDER: TaxKind[] = ["income_tax", "resident_tax", "health_insurance", "pension"];

function lastDayOfMonth(monthKey: string) {
  return new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
}
function monthEndDate(monthKey: string) {
  return `${monthKey}-${String(lastDayOfMonth(monthKey)).padStart(2, "0")}`;
}
function fiscalStartYear(monthKey: string) {
  const year = Number(monthKey.slice(0, 4));
  return Number(monthKey.slice(5, 7)) >= 4 ? year : year - 1;
}
function fiscalMonths(startYear: number) {
  return Array.from({ length: 12 }, (_, index) => addMonthsKey(`${startYear}-04`, index));
}
function monthNumber(monthKey: string) {
  return Number(monthKey.slice(5, 7));
}
function isTaxInstallment(cost: FixedCost) {
  return Boolean(cost.taxKind && cost.effectiveFrom && cost.effectiveTo && cost.effectiveFrom.slice(0, 7) === cost.effectiveTo.slice(0, 7));
}

type TaxRow = {
  key: string;
  cost: FixedCost;
  kind: TaxKind;
  title: string;
  sub: string;
  date: string;
  amount: number;
  note?: string;
  covered: boolean;
  sourceMonth?: string;
  status: "done" | "next" | "plan" | "covered";
};

function taxRowsForMonth(state: LedgerState, monthKey: string): Omit<TaxRow, "status">[] {
  const taxCosts = state.fixedCosts.filter((cost) => cost.taxKind);
  const occurrences = fixedCostOccurrencesForMonth(taxCosts, monthKey, state);
  const rows: Omit<TaxRow, "status">[] = occurrences.map((occurrence) => {
    const kind = occurrence.taxKind as TaxKind;
    const meta = TAX_KIND_META[kind];
    const base = state.fixedCosts.find((cost) => cost.id === occurrence.id) ?? occurrence;
    const isLump = Boolean(occurrence.overrideMemo && /まとめ払い|前納/.test(occurrence.overrideMemo));
    // 年金は国保の「第◯期」と同じように、どの月の分かを出す（支払日を変えた分は元の月）
    const sub = kind === "pension"
      ? (isLump ? occurrence.overrideMemo!.replace(/\s*(まとめ払い|前納)$/, "") : `${monthNumber(occurrence.occurrenceMonth)}月分`)
      : occurrence.name.replace(meta.label, "").replace(meta.short, "").trim();
    return {
      key: `${occurrence.id}-${occurrence.occurrenceMonth}`,
      sourceMonth: occurrence.occurrenceMonth,
      cost: base,
      kind,
      title: meta.label,
      sub,
      date: occurrence.date,
      amount: occurrence.amount,
      note: isLump ? (occurrence.overrideMemo!.includes("前納") ? "前納" : "まとめ払い") : undefined,
      covered: false
    };
  });
  // まとめ払い・前納で、この月は払わない年金
  taxCosts.filter((cost) => isFixedCostActiveInMonth(cost, monthKey)).forEach((cost) => {
    const override = state.fixedCostOverrides?.find((item) => item.fixedCostId === cost.id && item.month === monthKey);
    if (!override?.skipped) return;
    const kind = cost.taxKind as TaxKind;
    rows.push({
      key: `${cost.id}-${monthKey}-covered`,
      cost,
      kind,
      title: TAX_KIND_META[kind].label,
      sub: kind === "pension" ? "" : cost.name,
      date: `${monthKey}-${String(Math.min(cost.dueDay, lastDayOfMonth(monthKey))).padStart(2, "0")}`,
      amount: 0,
      note: override.memo || "まとめ払い済み",
      covered: true
    });
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date) || TAX_KIND_ORDER.indexOf(a.kind) - TAX_KIND_ORDER.indexOf(b.kind) || (a.sourceMonth ?? "").localeCompare(b.sourceMonth ?? ""));
}

function TaxesView({ state, monthKey, setNotice, reload }: { state: LedgerState; monthKey: string; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const startYear = fiscalStartYear(monthKey);
  const months = fiscalMonths(startYear);
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  const [filter, setFilter] = useState<TaxKind | "all">("all");
  const [showPast, setShowPast] = useState(false);
  const [adding, setAdding] = useState<TaxKind | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pensionId, setPensionId] = useState<string | null>(null);

  const allRows = months.map((month) => ({ month, rows: taxRowsForMonth(state, month) }));
  const upcoming = allRows.flatMap(({ rows }) => rows).filter((row) => !row.covered && row.amount > 0 && row.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const nextDate = upcoming[0]?.date;
  const withStatus = allRows.map(({ month, rows }) => ({
    month,
    rows: rows
      .filter((row) => filter === "all" || row.kind === filter)
      .map((row): TaxRow => ({ ...row, status: row.covered ? "covered" : row.date < today ? "done" : row.date === nextDate ? "next" : "plan" }))
  }));
  const counted = withStatus.flatMap(({ rows }) => rows).filter((row) => !row.covered);
  const total = counted.reduce((sum, row) => sum + row.amount, 0);
  const paid = counted.filter((row) => row.status === "done").reduce((sum, row) => sum + row.amount, 0);
  const rest = total - paid;
  const nextRows = upcoming.filter((row) => row.date === nextDate && (filter === "all" || row.kind === filter));
  const pastMonths = withStatus.filter(({ month, rows }) => month < currentMonth && rows.length > 0 && rows.every((row) => row.status === "done" || row.status === "covered"));
  const pastTotal = pastMonths.flatMap(({ rows }) => rows).reduce((sum, row) => sum + row.amount, 0);
  const pastCount = pastMonths.flatMap(({ rows }) => rows).filter((row) => !row.covered).length;
  const pastKinds = Array.from(new Set(pastMonths.flatMap(({ rows }) => rows.map((row) => TAX_KIND_META[row.kind].short))));
  const visibleMonths = withStatus.filter(({ month, rows }) => rows.length > 0 && (showPast || !pastMonths.some((item) => item.month === month)));
  const hasAny = state.fixedCosts.some((cost) => cost.taxKind);
  const detailCost = detailId ? state.fixedCosts.find((cost) => cost.id === detailId) : undefined;
  const pensionCost = pensionId ? state.fixedCosts.find((cost) => cost.id === pensionId) : undefined;
  const daysLeft = nextDate ? Math.round((new Date(`${nextDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000) : 0;

  function openRow(row: TaxRow) {
    if (row.kind === "pension" && !isTaxInstallment(row.cost)) setPensionId(row.cost.id);
    else setDetailId(row.cost.id);
  }

  return (
    <div className="taxes-view">
      <section className="asset-hero tax-hero">
        <div className="asset-hero-label tax-hero-label"><span>{startYear}年度の税金・社会保険</span><span className="num">4月〜翌3月</span></div>
        <div className="amount asset-hero-amount"><span className="yen">¥</span>{plainAmount(total)}</div>
        <div className="tax-progress" aria-hidden="true">
          <i style={{ width: `${total ? (paid / total) * 100 : 0}%` }} className="paid" />
          <i style={{ width: `${total ? (rest / total) * 100 : 0}%` }} className="rest" />
        </div>
        <div className="tax-progress-legend"><span>支払い済み<b className="num">{plainAmount(paid)}</b></span><span>これから<b className="num">{plainAmount(rest)}</b></span></div>
        {nextRows.length > 0 && nextDate && (
          <div className="tax-next">
            <span className="tax-next-date num">{shortDate(nextDate)}<small>{daysLeft === 0 ? "今日" : `あと${daysLeft}日`}</small></span>
            <span className="tax-next-text"><b>{shortDate(nextDate)} の支払い {nextRows.length}件</b><small>{nextRows.map((row) => `${TAX_KIND_META[row.kind].short}${row.note ? `（${row.note}）` : ""}`).join("・")}</small></span>
            <b className="num">{plainAmount(nextRows.reduce((sum, row) => sum + row.amount, 0))}</b>
          </div>
        )}
      </section>

      <div className="tax-chips" role="tablist" aria-label="税金の種類で絞り込み">
        <button type="button" className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>すべて</button>
        {TAX_KIND_ORDER.map((kind) => (
          <button key={kind} type="button" className={filter === kind ? "on" : ""} onClick={() => setFilter(kind)}><i style={{ background: TAX_KIND_META[kind].color }} />{TAX_KIND_META[kind].short}</button>
        ))}
      </div>

      {!hasAny && (
        <div className="tax-empty">
          <b>まだ税金・社会保険が登録されていません</b>
          <p>住民税・国民健康保険・所得税・国民年金を登録すると、4月から翌3月まで、いつ・いくら払うかが月ごとに並びます。事業用の口座の残高見込みにも入ります。</p>
          <div className="tax-templates inline">
            <div>
              {TAX_KIND_ORDER.map((kind) => (
                <button key={kind} type="button" onClick={() => setAdding(kind)}>
                  <i style={{ background: TAX_KIND_META[kind].color }}>{TAX_KIND_META[kind].mark}</i>{TAX_KIND_META[kind].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {pastMonths.length > 0 && !showPast && (
        <>
          <div className="tax-month-h past"><b>{monthNumber(pastMonths[0].month)}月〜{monthNumber(pastMonths[pastMonths.length - 1].month)}月</b><span className="num">{plainAmount(pastTotal)}</span></div>
          <div className="tax-list past">
            <button type="button" className="tax-row fold" onClick={() => setShowPast(true)}>
              <span className="tax-mark done">済</span>
              <span className="tax-row-text"><b>支払い済み {pastCount}件<small>{pastKinds.join("・")}</small></b><small>タップで月ごとに表示</small></span>
              <span className="tax-row-amount num">{plainAmount(pastTotal)}</span>
              <ChevronDown size={16} className="tax-row-status" />
            </button>
          </div>
        </>
      )}

      {visibleMonths.map(({ month, rows }) => {
        const isNow = month === currentMonth;
        const isPast = pastMonths.some((item) => item.month === month);
        return (
          <div key={month} className="tax-month">
            <div className={`tax-month-h${isPast ? " past" : ""}`}><b>{monthNumber(month)}月</b>{isNow && <em>今月</em>}<span className="num">{plainAmount(rows.reduce((sum, row) => sum + row.amount, 0))}</span></div>
            <div className={`tax-list${isNow ? " now" : ""}${isPast ? " past" : ""}`}>
              {rows.map((row) => (
                <button type="button" key={row.key} className={`tax-row ${row.status}`} onClick={() => openRow(row)}>
                  <span className="tax-mark" style={{ background: TAX_KIND_META[row.kind].color }}>{TAX_KIND_META[row.kind].mark}</span>
                  <span className="tax-row-text">
                    <b>{row.title}{row.sub && <small>{row.sub}</small>}</b>
                    <small>
                      {!row.covered && <span className="num">{shortDate(row.date)}</span>}
                      {!row.covered && row.note && " ・ "}
                      {row.note && <u className={row.covered ? "" : "lump"}>{row.note}</u>}
                      {row.cost.memo && !row.covered && !row.note && <> ・ {row.cost.memo}</>}
                    </small>
                  </span>
                  <span className="tax-row-amount num">{row.covered ? "—" : plainAmount(row.amount)}</span>
                  <span className="tax-row-status" aria-label={row.status === "done" ? "支払い済み" : row.status === "next" ? "次の支払い" : row.status === "covered" ? "まとめ払い済み" : "予定"}>
                    {row.status === "done" && <i className="st done">済</i>}
                    {row.status === "next" && <i className="st next">次</i>}
                    {row.status === "covered" && <i className="st cov">前</i>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {showPast && pastMonths.length > 0 && <button type="button" className="tax-fold-close" onClick={() => setShowPast(false)}>支払い済みの月をたたむ</button>}

      <button type="button" className="tax-add" onClick={() => setAdding("resident_tax")}><Plus size={16} /> 税金・社会保険を追加</button>
      <p className="settings-note">金額は定期項目と連動していて、口座の残高見込みにも入ります。国保・住民税の金額と回数は、6月ごろ届く通知書の内容に合わせて変えてください。行をタップすると、金額や日付を直せます。</p>

      {adding && <TaxAddSheet state={state} startYear={startYear} initialKind={adding} setNotice={setNotice} reload={reload} onClose={() => setAdding(null)} />}
      {detailCost && (
        <SettingsSheet title={TAX_KIND_META[detailCost.taxKind as TaxKind]?.label ?? "税金"} onClose={() => setDetailId(null)}>
          <FixedCostDetail key={detailCost.id} cost={detailCost} state={state} setNotice={setNotice} reloadHousehold={async () => reload()} onClose={() => setDetailId(null)} />
          <TaxDeleteActions cost={detailCost} state={state} startYear={startYear} setNotice={setNotice} reload={reload} onDone={() => setDetailId(null)} />
        </SettingsSheet>
      )}
      {pensionCost && <PensionSheet cost={pensionCost} state={state} startYear={startYear} setNotice={setNotice} reload={reload} onClose={() => setPensionId(null)} onEdit={() => { setPensionId(null); setDetailId(pensionCost.id); }} />}
    </div>
  );
}

// 税金の削除：この回だけ／この年度の同じ種類をまとめて／年金は税金タブから外す
function TaxDeleteActions({ cost, state, startYear, setNotice, reload, onDone }: { cost: FixedCost; state: LedgerState; startYear: number; setNotice: (message: string) => void; reload: () => Promise<void>; onDone: () => void }) {
  const [confirm, setConfirm] = useState<"one" | "year" | "unlink" | "pension" | null>(null);
  const [busy, setBusy] = useState(false);
  const kind = cost.taxKind as TaxKind | undefined;
  if (!kind) return null;
  const meta = TAX_KIND_META[kind];
  const months = fiscalMonths(startYear);
  const sameYear = state.fixedCosts.filter((item) => item.taxKind === kind && isTaxInstallment(item) && months.includes((item.effectiveFrom ?? "").slice(0, 7)));
  const isMonthly = !isTaxInstallment(cost);
  async function run(action: "one" | "year" | "unlink" | "pension") {
    setBusy(true);
    try {
      if (action === "one" || action === "pension") await deleteFixedCost(cost.id, "all");
      if (action === "year") await Promise.all(sameYear.map((item) => deleteFixedCost(item.id, "all")));
      if (action === "unlink") await setFixedCostTaxKind(cost.id, null);
      await reload();
      setNotice(action === "one" ? `${cost.name}を削除しました。` : action === "year" ? `${startYear}年度の${meta.label}（${sameYear.length}件）を削除しました。` : action === "unlink" ? `${cost.name}を税金タブから外しました（定期項目には残っています）。` : `${cost.name}の定期項目を削除しました。`);
      onDone();
    } catch (error) {
      setNotice(toJapaneseError(error, "削除に失敗しました。"));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  const options = isMonthly
    ? ([
        ["unlink", "税金タブから外す", "定期項目の「" + cost.name + "」は残ります。残高の見込みも今まで通りです。"],
        ["pension", "定期項目ごと削除する", "毎月の「" + cost.name + "」がなくなり、残高の見込みからも外れます。"]
      ] as const)
    : ([
        ["one", "この回だけ削除する", `${cost.name}だけを消します。`],
        ...(sameYear.length > 1 ? [["year", `${startYear}年度の${meta.label}をすべて削除する`, `${sameYear.length}件をまとめて消します。登録し直したいときに。`] as const] : [])
      ] as const);
  return (
    <div className="tax-delete">
      <div className="tax-delete-h">削除</div>
      {options.map(([action, label, text]) => (
        confirm === action ? (
          <div key={action} className="tax-delete-confirm">
            <p>{text} よろしいですか？</p>
            <div>
              <button type="button" className="google-button" disabled={busy} onClick={() => setConfirm(null)}>やめる</button>
              <button type="button" className="danger-fill" disabled={busy} onClick={() => run(action)}>{busy ? "削除中…" : "削除する"}</button>
            </div>
          </div>
        ) : (
          <button key={action} type="button" className="tax-delete-btn" onClick={() => setConfirm(action)}>{label}</button>
        )
      ))}
    </div>
  );
}

type TaxDraftItem = { label: string; date: string; amount: number };

function splitEvenly(total: number, count: number) {
  // 端数は第1期にまとめる（通知書と同じ考え方）
  const each = Math.floor(total / count / 100) * 100;
  return Array.from({ length: count }, (_, index) => (index === 0 ? total - each * (count - 1) : each));
}

function TaxAddSheet({ state, startYear, initialKind = "resident_tax", setNotice, reload, onClose }: { state: LedgerState; startYear: number; initialKind?: TaxKind; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void }) {
  const normalAccounts = sortAccountsByType(state.accounts.filter((account) => account.type !== "credit"));
  const [kind, setKind] = useState<TaxKind>(initialKind);
  const [incomeMode, setIncomeMode] = useState<"prepay" | "final">("prepay");
  const [yearTotal, setYearTotal] = useState(0);
  const [items, setItems] = useState<TaxDraftItem[]>([]);
  const [accountId, setAccountId] = useState(normalAccounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [pensionAmount, setPensionAmount] = useState(17510);
  const [pensionDueDay, setPensionDueDay] = useState(31);
  const existingPension = state.fixedCosts.find((cost) => cost.taxKind === "pension" && !isTaxInstallment(cost));
  const pensionCandidates = state.fixedCosts.filter((cost) => !cost.taxKind && cost.kind === "expense" && (!cost.effectiveTo || cost.effectiveTo.slice(0, 7) >= todayIso().slice(0, 7)));
  const likelyPension = pensionCandidates.filter((cost) => cost.name.includes("年金"));
  const [linkId, setLinkId] = useState(() => likelyPension[0]?.id ?? "");
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [saving, setSaving] = useState(false);

  // 種類ごとの初期の納付スケジュール
  useEffect(() => {
    const next = String(startYear + 1);
    const s = String(startYear);
    if (kind === "resident_tax") {
      const amounts = splitEvenly(yearTotal, 4);
      setItems([`${s}-06`, `${s}-08`, `${s}-10`, `${next}-01`].map((month, index) => ({ label: `第${index + 1}期`, date: monthEndDate(month), amount: amounts[index] })));
    } else if (kind === "health_insurance") {
      const amounts = splitEvenly(yearTotal, 10);
      setItems(Array.from({ length: 10 }, (_, index) => ({ label: `第${index + 1}期`, date: monthEndDate(addMonthsKey(`${s}-06`, index)), amount: amounts[index] })));
    } else if (kind === "income_tax") {
      if (incomeMode === "prepay") setItems([{ label: "予定納税 第1期", date: `${s}-07-31`, amount: yearTotal }, { label: "予定納税 第2期", date: `${s}-11-30`, amount: yearTotal }]);
      else setItems([{ label: `確定申告（${startYear - 1}年分）`, date: `${s}-04-20`, amount: yearTotal }]);
    } else {
      setItems([]);
    }
  }, [kind, incomeMode, yearTotal, startYear]);

  async function save() {
    if (!accountId) return setNotice("支払う口座を選んでください。");
    setSaving(true);
    try {
      if (kind === "pension") {
        if (existingPension) { onClose(); return; }
        if (linkId) {
          await setFixedCostTaxKind(linkId, "pension");
        } else {
          if (!pensionAmount) { setNotice("月額を入力してください。"); return; }
          await createFixedCost(state.householdId ?? "", { name: "国民年金", kind: "expense", categoryId, accountId, amount: pensionAmount, variable: false, dueDay: pensionDueDay, status: "planned", effectiveFrom: `${startYear}-04-01`, taxKind: "pension" });
        }
      } else {
        const valid = items.filter((item) => item.amount > 0 && item.date);
        if (valid.length === 0) { setNotice("金額を入力してください。"); return; }
        await createTaxInstallments(state.householdId ?? "", valid.map((item) => ({ name: `${TAX_KIND_META[kind].label} ${item.label}`, taxKind: kind, amount: item.amount, date: item.date, accountId, categoryId: categoryId || undefined })));
      }
      await reload();
      setNotice(`${TAX_KIND_META[kind].label}を登録しました。`);
      onClose();
    } catch (error) {
      setNotice(toJapaneseError(error, "税金の登録に失敗しました。"));
    } finally {
      setSaving(false);
    }
  }

  const totalLabel = kind === "resident_tax" ? "年税額（通知書の合計）" : kind === "health_insurance" ? "年額（通知書の合計）" : incomeMode === "prepay" ? "1回あたりの金額（通知書の第1期）" : "納める金額";
  return (
    <SettingsSheet title="税金・社会保険を追加" onClose={onClose}>
      <div className="tax-add">
        <div className="segmented compact tax-kind-seg" role="tablist" aria-label="種類">
          {TAX_KIND_ORDER.map((value) => (
            <button key={value} type="button" className={kind === value ? "selected" : ""} onClick={() => setKind(value)}>{TAX_KIND_META[value].short}</button>
          ))}
        </div>
        {kind === "income_tax" && (
          <div className="segmented compact" role="tablist" aria-label="所得税の種類">
            <button type="button" className={incomeMode === "prepay" ? "selected" : ""} onClick={() => setIncomeMode("prepay")}>予定納税（7月・11月）</button>
            <button type="button" className={incomeMode === "final" ? "selected" : ""} onClick={() => setIncomeMode("final")}>確定申告</button>
          </div>
        )}
        {kind !== "pension" ? (
          <>
            <label>{totalLabel}<input type="number" inputMode="numeric" value={numberInputValue(yearTotal)} onChange={(event) => setYearTotal(Number(event.target.value || 0))} placeholder="0" /></label>
            <div className="tax-draft">
              <div className="tax-draft-h"><span>納付の予定（{startYear}年度）</span><span>日付・金額は直せます</span></div>
              {items.map((item, index) => (
                <div className="tax-draft-row" key={index}>
                  <span>{item.label}</span>
                  <input type="date" value={item.date} onChange={(event) => setItems(items.map((row, i) => (i === index ? { ...row, date: event.target.value } : row)))} />
                  <input type="number" inputMode="numeric" value={numberInputValue(item.amount)} onChange={(event) => setItems(items.map((row, i) => (i === index ? { ...row, amount: Number(event.target.value || 0) } : row)))} />
                </div>
              ))}
              {kind === "income_tax" && incomeMode === "final" && <p className="settings-note">振替納税なら4月20日ごろに引き落とされます。自分で納める場合は3月15日に変えてください。</p>}
            </div>
          </>
        ) : existingPension ? (
          <p className="settings-note">国民年金は「{existingPension.name}」（毎月 {plainAmount(existingPension.amount)}円）を使っています。一覧の年金の行をタップすると、まとめ払いや前納に切り替えられます。</p>
        ) : (
          <>
            {pensionCandidates.length > 0 ? (
              <div className="pension-link">
                <div className="pension-link-h">
                  {likelyPension.length > 0
                    ? <>定期項目に「{likelyPension[0].name}」があります。国民年金はこの定期項目として登録済みですか？</>
                    : <>国民年金をすでに定期項目として登録していますか？</>}
                </div>
                {(showAllCandidates ? pensionCandidates : likelyPension).map((cost) => {
                  const account = state.accounts.find((item) => item.id === cost.accountId);
                  return (
                    <button key={cost.id} type="button" className={`pension-option${linkId === cost.id ? " selected" : ""}`} onClick={() => setLinkId(cost.id)}>
                      <span className="ledger-purpose-radio" aria-hidden="true" />
                      <span><b>はい、「{cost.name}」がそれです</b><small>毎月 {plainAmount(cost.amount)}円・{cost.dueDay}日・{account?.name ?? "口座未設定"}。この定期項目をそのまま税金タブに出します（金額も口座も変わりません）。</small></span>
                    </button>
                  );
                })}
                {!showAllCandidates && pensionCandidates.length > likelyPension.length && (
                  <button type="button" className="pension-link-more" onClick={() => setShowAllCandidates(true)}>{likelyPension.length > 0 ? "別の定期項目を選ぶ" : "定期項目の一覧から選ぶ"}</button>
                )}
                <button type="button" className={`pension-option${linkId === "" ? " selected" : ""}`} onClick={() => setLinkId("")}>
                  <span className="ledger-purpose-radio" aria-hidden="true" />
                  <span><b>いいえ、新しく登録する</b><small>国民年金の定期項目をここで作ります。{likelyPension.length > 0 ? `「${likelyPension[0].name}」が国民年金の分なら、二重に引かれた計算になるので「はい」を選んでください。` : ""}</small></span>
                </button>
              </div>
            ) : null}
            {!linkId && (
              <div className="form-grid">
                <label>月額<input type="number" inputMode="numeric" value={numberInputValue(pensionAmount)} onChange={(event) => setPensionAmount(Number(event.target.value || 0))} /></label>
                <label>引落日<input type="number" min="1" max="31" value={numberInputValue(pensionDueDay)} onChange={(event) => setPensionDueDay(Number(event.target.value || 0))} /></label>
              </div>
            )}
            <p className="settings-note">{linkId ? "登録すると、税金タブに毎月の年金が並びます。" : "月額は年金の納付書の金額です。口座振替なら、その月の分が翌月末に引き落とされます。"}まとめ払いや前納は、登録後に税金タブの年金の行をタップすると切り替えられます。</p>
          </>
        )}
        {!(kind === "pension" && (existingPension || linkId)) && (
          <>
            <label>支払う口座<AccountSelect value={accountId} onChange={setAccountId} accounts={normalAccounts} /></label>
            <label>カテゴリ（任意）<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">なし</option><CategoryOptions categories={state.categories} kind="expense" /></select></label>
          </>
        )}
        <button className="full-primary" type="button" disabled={saving} onClick={save}>{saving ? "登録中…" : kind === "pension" && existingPension ? "閉じる" : kind === "pension" && linkId ? "この定期項目を税金タブに出す" : "登録する"}</button>
      </div>
    </SettingsSheet>
  );
}

// 国民年金：毎月／まとめて払う／前納
function PensionSheet({ cost, state, startYear, setNotice, reload, onClose, onEdit }: { cost: FixedCost; state: LedgerState; startYear: number; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void; onEdit: () => void }) {
  // 「月」はすべて「引き落とされる月」で考える。1か月分＝1件のまま、支払日だけを動かす
  const s = String(startYear);
  const fyMonths = fiscalMonths(startYear);
  const mine = (state.fixedCostOverrides ?? []).filter((item) => item.fixedCostId === cost.id);
  const savedMoves = mine.filter((item) => item.payDate && fyMonths.includes(item.month) && item.payDate.slice(0, 7) !== item.month).sort((x, y) => x.month.localeCompare(y.month));
  const [mode, setMode] = useState<"move" | "prepay">("move");
  const nowMonth = todayIso().slice(0, 7);
  const firstMonth = fyMonths.includes(nowMonth) ? nowMonth : `${s}-04`;
  const savedLast = savedMoves.length ? savedMoves[savedMoves.length - 1] : null;
  const savedTo = savedLast ? (savedLast.payDate!.slice(0, 7) > savedLast.month ? savedLast.payDate!.slice(0, 7) : savedLast.month) : null;
  const [fromMonth, setFromMonth] = useState(savedMoves[0]?.month ?? firstMonth);
  const [toMonth, setToMonth] = useState(savedTo ?? addMonthsKey(firstMonth, 2));
  const [payDateEdit, setPayDateEdit] = useState<string | null>(savedMoves[0]?.payDate ?? null);
  const [prepay, setPrepay] = useState<"half1" | "half2" | "year" | "two">("year");
  // 前納：4月末（後期は10月末）に払うと、その先の毎月の引き落としがなくなる
  const prepayPlan = {
    half1: { from: `${s}-05`, to: `${s}-10`, date: `${s}-04-30`, label: "6か月分（4月〜9月分）" },
    half2: { from: `${s}-11`, to: `${startYear + 1}-04`, date: `${s}-10-31`, label: "6か月分（10月〜翌3月分）" },
    year: { from: `${s}-05`, to: `${startYear + 1}-04`, date: `${s}-04-30`, label: "1年分（4月〜翌3月分）" },
    two: { from: `${s}-05`, to: `${startYear + 2}-04`, date: `${s}-04-30`, label: "2年分" }
  }[prepay];
  const from = mode === "move" ? fromMonth : prepayPlan.from;
  const to = mode === "move" ? toMonth : prepayPlan.to;
  const count = to >= from ? Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7)) - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7))) + 1 : 0;
  const rangeMonths = Array.from({ length: Math.max(count, 0) }, (_, index) => addMonthsKey(from, index));
  const [amountEdit, setAmountEdit] = useState<number | null>(null);
  const amount = amountEdit ?? cost.amount * count;
  const moveDate = payDateEdit ?? `${toMonth}-${String(Math.min(cost.dueDay, lastDayOfMonth(toMonth))).padStart(2, "0")}`;
  const date = mode === "move" ? moveDate : prepayPlan.date;
  const payMonth = date.slice(0, 7);
  const payInRange = payMonth >= from && payMonth <= to;
  const [saving, setSaving] = useState(false);
  const monthOptions = Array.from({ length: 24 }, (_, index) => addMonthsKey(`${s}-04`, index));
  const label = (month: string) => `${month.slice(0, 4)}年${monthNumber(month)}月`;
  // 以前の「まとめ払い・前納・支払日変更」の設定
  const isPlanOverride = (item: NonNullable<LedgerState["fixedCostOverrides"]>[number]) => Boolean(item.skipped || item.payDate || /まとめ払い|前納/.test(item.memo ?? ""));
  const clearPayload = { amount: cost.amount, dueDay: cost.dueDay, skipped: false, memo: "", payDate: "" };

  async function clearPlans(months: Set<string>) {
    const targets = mine.filter((item) => months.has(item.month) && isPlanOverride(item));
    await Promise.all(targets.map((item) => upsertFixedCostOverride(state.householdId ?? "", cost.id, item.month, clearPayload)));
  }

  async function save() {
    if (count <= 0) return setNotice("月を正しく選んでください（はじめ ≦ おわり）。");
    if (mode === "prepay" && !amount) return setNotice("金額を入力してください。");
    setSaving(true);
    try {
      // 前の設定は、いったん毎月払いに戻してから設定し直す
      await clearPlans(new Set([...fyMonths, ...rangeMonths, payMonth]));
      const active = rangeMonths.filter((month) => isFixedCostActiveInMonth(cost, month));
      if (mode === "move") {
        // 1か月分ずつ、支払日だけを変える
        await Promise.all(active.map((month) => upsertFixedCostOverride(state.householdId ?? "", cost.id, month, { ...clearPayload, payDate: date })));
        setNotice(`国民年金の${monthNumber(from)}月〜${monthNumber(to)}月分の支払日を ${date.replace(/-/g, "/")} にしました。`);
      } else {
        const memo = `${prepayPlan.label} 前納`;
        await Promise.all([
          ...active.filter((month) => month !== payMonth).map((month) => upsertFixedCostOverride(state.householdId ?? "", cost.id, month, { ...clearPayload, skipped: true, memo: `${monthNumber(payMonth)}月に前納済み` })),
          // 支払う月：前納額（支払う月が対象に入っていなければ、その月のふだんの分も足す）
          upsertFixedCostOverride(state.householdId ?? "", cost.id, payMonth, { ...clearPayload, amount: amount + (payInRange ? 0 : cost.amount), dueDay: Number(date.slice(8, 10)), memo })
        ]);
        setNotice(`国民年金を「${memo}」にしました。`);
      }
      await reload();
      onClose();
    } catch (error) {
      setNotice(toJapaneseError(error, "国民年金の払い方の変更に失敗しました。"));
    } finally {
      setSaving(false);
    }
  }

  async function resetYear() {
    setSaving(true);
    try {
      await clearPlans(new Set(fyMonths));
      await reload();
      setNotice(`${startYear}年度の国民年金を毎月払いに戻しました。`);
      onClose();
    } catch (error) {
      setNotice(toJapaneseError(error, "毎月払いに戻せませんでした。"));
    } finally {
      setSaving(false);
    }
  }
  const hasPlan = mine.some((item) => fyMonths.includes(item.month) && isPlanOverride(item));
  const short = (month: string) => `${monthNumber(month)}月`;

  return (
    <SettingsSheet title="国民年金の払い方" onClose={onClose}>
      <div className="pension-sheet">
        <div className="pension-head"><span className="tax-mark" style={{ background: TAX_KIND_META.pension.color }}>年</span><b>{cost.name}</b><small className="num">毎月 {plainAmount(cost.amount)}円</small></div>
        <div className="segmented compact" role="tablist" aria-label="払い方">
          <button type="button" className={mode === "move" ? "selected" : ""} onClick={() => { setMode("move"); setAmountEdit(null); }}>支払日を変える</button>
          <button type="button" className={mode === "prepay" ? "selected" : ""} onClick={() => { setMode("prepay"); setAmountEdit(null); }}>前納</button>
        </div>
        {mode === "move" ? (
          <>
            <p className="pension-hint">ふだん毎月{cost.dueDay >= 28 ? "末" : `${cost.dueDay}日`}に引き落とされる年金の支払日を、まとめて別の日に変えます。1か月分ずつ、変えた日に表示されます。</p>
            <div className="form-grid">
              <label>変える月（はじめ）<select value={fromMonth} onChange={(event) => setFromMonth(event.target.value)}>{monthOptions.map((month) => <option key={month} value={month}>{label(month)}分</option>)}</select></label>
              <label>変える月（おわり）<select value={toMonth} onChange={(event) => { setToMonth(event.target.value); setPayDateEdit(null); }}>{monthOptions.map((month) => <option key={month} value={month}>{label(month)}分</option>)}</select></label>
            </div>
            <label>新しい支払日<input type="date" value={moveDate} onChange={(event) => setPayDateEdit(event.target.value)} /></label>
            <div className="pension-calc">
              {rangeMonths.slice(0, 12).map((month) => (
                <div key={month}><span>{short(month)}分 {plainAmount(cost.amount)}円</span><b className="num">{month === payMonth ? date.slice(5).replace("-", "/") : `→ ${date.slice(5).replace("-", "/")}`}</b></div>
              ))}
              <div><span>{date.replace(/-/g, "/")} の合計</span><b className="num">{plainAmount(cost.amount * count + (payInRange ? 0 : cost.amount))}</b></div>
            </div>
          </>
        ) : (
          <>
            <div className="pension-options">
              {(["half1", "half2", "year", "two"] as const).map((value) => {
                const plan = { half1: ["6か月前納（前期）", "4月末に4月〜9月分を払う"], half2: ["6か月前納（後期）", "10月末に10月〜翌3月分を払う"], year: ["1年前納", "4月末に1年分を払う"], two: ["2年前納", "4月末に2年分を払う"] }[value];
                return (
                  <button key={value} type="button" className={`pension-option${prepay === value ? " selected" : ""}`} onClick={() => { setPrepay(value); setAmountEdit(null); }}>
                    <span className="ledger-purpose-radio" aria-hidden="true" /><span><b>{plan[0]}</b><small>{plan[1]}</small></span>
                  </button>
                );
              })}
            </div>
            <label>支払う金額（割引後の額に直してください）<input type="number" inputMode="numeric" value={numberInputValue(amount)} onChange={(event) => setAmountEdit(Number(event.target.value || 0))} /></label>
            <div className="pension-calc">
              <div><span>{plainAmount(cost.amount)}円 × {count}か月</span><b className="num">{plainAmount(cost.amount * count)}</b></div>
              <div><span>{date.replace(/-/g, "/")} に払う額</span><b className="num">{plainAmount(amount + (payInRange ? 0 : cost.amount))}</b></div>
              <div><span>対象の月の毎月の引き落とし</span><b>なし</b></div>
            </div>
          </>
        )}
        <p className="settings-note">前に支払日の変更や前納を設定していた場合は、いったん毎月払いに戻してから、この内容で設定し直します。残高の見込みにもそのまま入ります。</p>
        <button className="full-primary" type="button" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存する"}</button>
        {hasPlan && <button className="google-button" type="button" disabled={saving} onClick={resetYear}>{startYear}年度を毎月払いに戻す</button>}
        <button className="template-save" type="button" onClick={onEdit}>月額や口座を変える</button>
        <TaxDeleteActions cost={cost} state={state} startYear={startYear} setNotice={setNotice} reload={reload} onDone={onClose} />
      </div>
    </SettingsSheet>
  );
}

// 定期項目の一覧に出す「税金・社会保険」のまとまり（種類ごとに1行）
function TaxFixedGroup({ state, onOpenTaxes }: { state: LedgerState; onOpenTaxes?: () => void }) {
  const today = todayIso();
  const startYear = fiscalStartYear(today.slice(0, 7));
  const months = fiscalMonths(startYear);
  const rows = TAX_KIND_ORDER.map((kind) => {
    const costs = state.fixedCosts.filter((cost) => cost.taxKind === kind);
    if (costs.length === 0) return null;
    const occurrences = months.flatMap((month) => fixedCostOccurrencesForMonth(costs, month, state));
    const total = occurrences.reduce((sum, item) => sum + item.amount, 0);
    const next = occurrences.filter((item) => item.date >= today && item.amount > 0).sort((a, b) => a.date.localeCompare(b.date))[0];
    const monthly = costs.find((cost) => !isTaxInstallment(cost));
    const sub = monthly && kind === "pension" ? `毎月 ${plainAmount(monthly.amount)}円` : `${startYear}年度 年${occurrences.length}回`;
    return { kind, total, next, sub };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="settings-sec-h"><span>税金・社会保険</span><span>{startYear}年度 計 {plainAmount(rows.reduce((sum, row) => sum + row.total, 0))}</span></div>
      <div className="settings-list">
        {rows.map((row) => (
          <button key={row.kind} type="button" className="settings-row fixed-item" onClick={() => onOpenTaxes?.()}>
            <span className="tax-mark" style={{ background: TAX_KIND_META[row.kind].color }}>{TAX_KIND_META[row.kind].mark}</span>
            <span className="settings-row-text"><b>{TAX_KIND_META[row.kind].label}</b><small>{row.sub}{row.next ? `・次 ${shortDate(row.next.date)}` : ""}</small></span>
            <span className="settings-amount num">{plainAmount(row.total)}</span>
            <ChevronRight size={16} className="settings-chev" />
          </button>
        ))}
      </div>
      <p className="settings-note">タップすると 資産 › 税金 で、1回ごとの支払い日と金額を確認・変更できます。</p>
    </div>
  );
}

function FixedCostsOverview({ state, onEdit, onOpenTaxes }: { state: LedgerState; onEdit: (id: string) => void; onOpenTaxes?: () => void }) {
  const currentMonth = todayIso().slice(0, 7);
  // 税金の1回ごとの納付は「資産 › 税金」で管理するので、ここには出さない
  const listed = state.fixedCosts.filter((cost) => !isTaxInstallment(cost));
  const taxInstallmentCount = state.fixedCosts.length - listed.length;
  const active = listed.filter((cost) => !cost.effectiveTo || cost.effectiveTo.slice(0, 7) >= currentMonth);
  const ended = listed.filter((cost) => cost.effectiveTo && cost.effectiveTo.slice(0, 7) < currentMonth);
  const sum = (kind: TransactionType) => active.filter((cost) => cost.kind === kind).reduce((total, cost) => total + cost.amount, 0);
  // 分割で生まれた後続レコードは代表1件にまとめる（今月有効なものを優先）
  const installments = new Map<string, { cost: LedgerState["fixedCosts"][number]; info: InstallmentInfo }>();
  active.forEach((cost) => {
    if (cost.kind === "income") return;
    const info = installmentInfo(state, cost);
    if (!info) return;
    const key = info.chainIds.join(",");
    const existing = installments.get(key);
    const isCurrent = (!cost.effectiveFrom || cost.effectiveFrom.slice(0, 7) <= currentMonth);
    if (!existing || isCurrent) installments.set(key, { cost, info });
  });
  const installmentIds = new Set(Array.from(installments.values()).flatMap(({ info }) => info.chainIds));
  const income = sum("income");
  const expense = sum("expense");
  const row = (cost: LedgerState["fixedCosts"][number], isEnded = false) => {
    const account = state.accounts.find((item) => item.id === cost.accountId);
    const transferTo = state.accounts.find((item) => item.id === cost.transferToAccountId);
    const sub = cost.transferGroupId ? fixedLedgerLine(cost, account?.name) : cost.kind === "transfer" ? `${account?.name ?? "未設定"} → ${transferTo?.name ?? "未設定"}` : `${categoryPathLabel(state, cost.categoryId) || "カテゴリなし"}／${account?.name ?? "未設定"}`;
    return (
      <button type="button" className={`settings-row fixed-item${isEnded ? " ended" : ""}`} key={cost.id} onClick={() => onEdit(cost.id)}>
        <span className="fixed-day num">{cost.dueDay}日<small>{isEnded ? "終了" : "毎月"}</small></span>
        <span className="settings-row-text"><b>{cost.name}{cost.variable && <em className="vtag">変動</em>}{cost.transferGroupId && <em className="vtag move">資金移動</em>}</b><small>{sub}</small></span>
        <span className={`settings-amount num${cost.kind === "income" || cost.transferDirection === "in" ? " pos" : ""}`}>{cost.kind === "income" || cost.transferDirection === "in" ? "+" : ""}{cost.variable ? "約 " : ""}{plainAmount(cost.amount)}</span>
        <ChevronRight size={16} className="settings-chev" />
      </button>
    );
  };
  const groups: { kind: TransactionType; label: string }[] = [
    { kind: "income", label: "収入" },
    { kind: "expense", label: "支出" },
    { kind: "transfer", label: "振替" }
  ];
  const installmentList = Array.from(installments.values()).sort((x, y) => x.info.remaining - y.info.remaining);
  return (
    <>
      <div className="fixed-summary">
        <div><span>毎月の収入</span><b className="num pos">{plainAmount(income)}</b></div>
        <div><span>毎月の支出</span><b className="num">{plainAmount(expense)}</b></div>
        <div><span>差し引き</span><b className={`num ${income - expense >= 0 ? "pos" : "neg"}`}>{income - expense > 0 ? "+" : income - expense < 0 ? "−" : ""}{plainAmount(income - expense)}</b></div>
      </div>
      <TaxFixedGroup state={state} onOpenTaxes={onOpenTaxes} />
      {installmentList.length > 0 && (
        <div>
          <div className="settings-sec-h"><span>ローン・分割払い</span><span>残り {plainAmount(installmentList.reduce((total, item) => total + item.info.remainingAmount, 0))}</span></div>
          <div className="settings-list">
            {installmentList.map(({ cost, info }) => {
              const account = state.accounts.find((item) => item.id === cost.accountId);
              const progress = info.total > 0 ? (info.paid / info.total) * 100 : 0;
              const soon = info.remaining > 0 && info.remaining <= 3;
              return (
                <button type="button" className={`settings-row fixed-item installment-item${soon ? " soon" : ""}`} key={cost.id} onClick={() => onEdit(cost.id)}>
                  <span className="fixed-day num">{cost.dueDay}日<small>毎月</small></span>
                  <span className="settings-row-text"><b>{cost.name}</b><small>{categoryPathLabel(state, cost.categoryId) || "振替"}／{account?.name ?? "未設定"}</small></span>
                  <span className="settings-amount num">{plainAmount(cost.amount)}</span>
                  <ChevronRight size={16} className="settings-chev" />
                  <span className="installment-progress">
                    <span className="installment-bar"><i style={{ width: `${progress}%` }} /></span>
                    <span className="installment-meta">
                      <b>{info.remaining === 0 ? "支払い完了" : `残り ${info.remaining}/${info.total}回`}</b>
                      <span>{info.remaining > 0 ? `残り ${plainAmount(info.remainingAmount)}／${Number(info.endMonth.slice(0, 4))}年${Number(info.endMonth.slice(5, 7))}月まで` : `${formatMonthLabel(info.endMonth)}に完了`}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {groups.map(({ kind, label }) => {
        const rows = active.filter((cost) => cost.kind === kind && !installmentIds.has(cost.id) && !cost.taxKind).sort((a, b) => a.dueDay - b.dueDay);
        if (rows.length === 0) return null;
        return (
          <div key={kind}>
            <div className="settings-sec-h"><span>{label}</span></div>
            <div className="settings-list">{rows.map((cost) => row(cost))}</div>
          </div>
        );
      })}
      {active.length === 0 && <div className="settings-list"><div className="empty-state">定期項目はまだありません。家賃や給与など、毎月の予定を右上の「追加」から登録できます。</div></div>}
      {ended.length > 0 && (
        <>
          <div className="settings-sec-h"><span>終了した項目</span></div>
          <div className="settings-list">{ended.map((cost) => row(cost, true))}</div>
        </>
      )}
    </>
  );
}

function InvestmentSettings({ state, setNotice, reload }: { state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const investmentAccounts = state.investmentAccounts ?? [];
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState(defaultInvestmentAccountDraft());

  async function saveNew() {
    if (!addDraft.name.trim()) { setNotice("口座名を入力してください。"); return; }
    try {
      await createInvestmentAccount(state.householdId ?? "", { ...addDraft, initialPrincipal: addDraft.initialPrincipal ?? undefined });
      await reload();
      setShowAddForm(false);
      setAddDraft(defaultInvestmentAccountDraft());
      setNotice("投資口座を追加しました。");
    } catch (error) {
      setNotice(toJapaneseError(error, "投資口座の追加に失敗しました。"));
    }
  }

  return (
    <section className="panel">
      <div className="section-title">
        <h2>投資口座の管理</h2>
        <button className="mini-button" type="button" onClick={() => { setShowAddForm(!showAddForm); setAddDraft(defaultInvestmentAccountDraft()); }}>
          {showAddForm ? "閉じる" : "口座を追加"}
        </button>
      </div>

      {showAddForm && (
        <div className="crud-form compact-form inv-add-form">
          <p className="setting-copy" style={{ marginBottom: 8 }}>新しい投資口座を追加します。証券口座・iDeCo・NISAに対応しています。</p>
          <label>種類<select value={addDraft.accountKind ?? "securities"} onChange={(e) => setAddDraft({ ...addDraft, accountKind: e.target.value as "securities" | "ideco" | "nisa" })}>
            <option value="securities">証券口座</option>
            <option value="ideco">iDeCo</option>
            <option value="nisa">NISA</option>
          </select></label>
          <label>口座名<input value={addDraft.name} placeholder="例: SBI証券・つみたてNISA" onChange={(e) => setAddDraft({ ...addDraft, name: e.target.value })} /></label>
          <label>開始月<input type="month" value={addDraft.startMonth} onChange={(e) => setAddDraft({ ...addDraft, startMonth: e.target.value || todayIso().slice(0, 7) })} /></label>
          <label>開始時の評価額<input type="number" value={numberInputValue(addDraft.initialAmount)} onChange={(e) => setAddDraft({ ...addDraft, initialAmount: Number(e.target.value || 0) })} /><small style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>今の評価額（グラフ・目標計算の起点）</small></label>
          <label>
            開始時の投資元金
            <input
              type="number"
              placeholder={String(addDraft.initialAmount || 0)}
              value={addDraft.initialPrincipal != null ? numberInputValue(addDraft.initialPrincipal) : ""}
              onChange={(e) => setAddDraft({ ...addDraft, initialPrincipal: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <small style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>途中から記録する場合、実際に投入した元金を入力。含み益の計算に使用。空欄なら評価額と同じとみなします。</small>
          </label>
          <label>毎月積立額<input type="number" value={numberInputValue(addDraft.monthlyContribution)} onChange={(e) => setAddDraft({ ...addDraft, monthlyContribution: Number(e.target.value || 0) })} /></label>
          <label>目標年利(%)<input type="number" step="0.01" value={addDraft.targetAnnualRate} onChange={(e) => setAddDraft({ ...addDraft, targetAnnualRate: Number(e.target.value || 0) })} /></label>
          <label>表示色<input type="color" value={addDraft.color} onChange={(e) => setAddDraft({ ...addDraft, color: e.target.value })} /></label>
          <button className="full-primary" type="button" onClick={saveNew}>口座を追加</button>
        </div>
      )}

      {investmentAccounts.length === 0 && !showAddForm ? (
        <div className="empty-state"><span>「口座を追加」から投資口座を登録してください。証券口座・iDeCo・NISAに対応しています。</span></div>
      ) : (
        <div className="inv-manage-list">
          {investmentAccounts.map((account) => (
            <InvestmentAccountCard
              key={account.id}
              account={account}
              state={state}
              setNotice={setNotice}
              reload={reload}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function InvestmentAccountCard({ account, state, setNotice, reload }: { account: LedgerState["investmentAccounts"][number]; state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const investmentContributionChanges = state.investmentContributionChanges ?? [];
  const [panel, setPanel] = useState<"closed" | "edit" | "contribution">("closed");
  const [editDraft, setEditDraft] = useState({ name: account.name, accountKind: account.accountKind ?? "securities" as "securities" | "ideco" | "nisa", startMonth: account.startMonth, initialAmount: account.initialAmount, initialPrincipal: account.initialPrincipal ?? null as number | null, monthlyContribution: account.monthlyContribution, targetAnnualRate: account.targetAnnualRate, color: account.color });
  const [contributionDraft, setContributionDraft] = useState({ month: todayIso().slice(0, 7), monthlyContribution: account.monthlyContribution });
  const contributionChanges = investmentContributionChanges.filter((c) => c.investmentAccountId === account.id).sort((a, b) => b.month.localeCompare(a.month));
  const kindColor = account.color || investmentKindColor(account.accountKind);

  function toggle(next: "edit" | "contribution") {
    setPanel((prev) => {
      if (prev === next) return "closed";
      if (next === "edit") setEditDraft({ name: account.name, accountKind: account.accountKind ?? "securities", startMonth: account.startMonth, initialAmount: account.initialAmount, initialPrincipal: account.initialPrincipal ?? null, monthlyContribution: account.monthlyContribution, targetAnnualRate: account.targetAnnualRate, color: account.color });
      return next;
    });
  }

  async function saveEdit() {
    if (!editDraft.name.trim()) { setNotice("口座名を入力してください。"); return; }
    try {
      await updateInvestmentAccount(account.id, { ...editDraft, initialPrincipal: editDraft.initialPrincipal ?? undefined });
      await reload();
      setPanel("closed");
      setNotice("投資口座を更新しました。");
    } catch (error) {
      setNotice(toJapaneseError(error, "投資口座の更新に失敗しました。"));
    }
  }

  async function removeAccount() {
    if (!window.confirm(`${account.name}を削除します。よろしいですか？`)) return;
    try {
      await deleteInvestmentAccount(account.id);
      await reload();
      setNotice("投資口座を削除しました。");
    } catch (error) {
      setNotice(toJapaneseError(error, "投資口座の削除に失敗しました。"));
    }
  }

  async function saveContribution() {
    if (!contributionDraft.month) { setNotice("変更開始月を選択してください。"); return; }
    try {
      await upsertInvestmentContributionChange(state.householdId ?? "", { investmentAccountId: account.id, month: contributionDraft.month, monthlyContribution: contributionDraft.monthlyContribution });
      await reload();
      setNotice(`${formatMonthLabel(contributionDraft.month)}からの積立額を保存しました。`);
    } catch (error) {
      setNotice(toJapaneseError(error, "積立額の変更保存に失敗しました。"));
    }
  }

  return (
    <div className="inv-manage-card">
      {/* ヘッダー行 */}
      <div className="inv-manage-head">
        <div className="account-mark" style={{ background: kindColor }}>{account.name.slice(0, 1)}</div>
        <div className="inv-manage-info">
          <strong>{account.name}</strong>
          <small>{investmentKindLabel(account.accountKind)} ／ 積立 {yen.format(account.monthlyContribution)}/月 ／ 目標年利 {account.targetAnnualRate}%</small>
        </div>
        <div className="inv-manage-actions">
          <button className={`mini-button ${panel === "edit" ? "active" : ""}`} type="button" onClick={() => toggle("edit")}>編集</button>
          <button className={`mini-button ${panel === "contribution" ? "active" : ""}`} type="button" onClick={() => toggle("contribution")}>積立変更</button>
          <button className="danger-button" type="button" onClick={removeAccount}>削除</button>
        </div>
      </div>

      {/* 口座情報編集パネル */}
      {panel === "edit" && (
        <div className="inv-manage-body">
          <div className="crud-form compact-form">
            <label>種類<select value={editDraft.accountKind ?? "securities"} onChange={(e) => setEditDraft({ ...editDraft, accountKind: e.target.value as "securities" | "ideco" | "nisa" })}>
              <option value="securities">証券口座</option>
              <option value="ideco">iDeCo</option>
              <option value="nisa">NISA</option>
            </select></label>
            <label>口座名<input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></label>
            <label>開始月<input type="month" value={editDraft.startMonth} onChange={(e) => setEditDraft({ ...editDraft, startMonth: e.target.value || todayIso().slice(0, 7) })} /></label>
            <label>開始時の評価額<input type="number" value={numberInputValue(editDraft.initialAmount)} onChange={(e) => setEditDraft({ ...editDraft, initialAmount: Number(e.target.value || 0) })} /><small style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>今の評価額（グラフ・目標計算の起点）</small></label>
            <label>
              開始時の投資元金
              <input
                type="number"
                placeholder={String(editDraft.initialAmount || 0)}
                value={editDraft.initialPrincipal != null ? numberInputValue(editDraft.initialPrincipal) : ""}
                onChange={(e) => setEditDraft({ ...editDraft, initialPrincipal: e.target.value === "" ? null : Number(e.target.value) })}
              />
              <small style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>途中から記録する場合に設定。空欄なら評価額と同じとみなします。</small>
            </label>
            <label>毎月積立額<input type="number" value={numberInputValue(editDraft.monthlyContribution)} onChange={(e) => setEditDraft({ ...editDraft, monthlyContribution: Number(e.target.value || 0) })} /></label>
            <label>目標年利(%)<input type="number" step="0.01" value={editDraft.targetAnnualRate} onChange={(e) => setEditDraft({ ...editDraft, targetAnnualRate: Number(e.target.value || 0) })} /></label>
            <label>表示色<input type="color" value={editDraft.color} onChange={(e) => setEditDraft({ ...editDraft, color: e.target.value })} /></label>
            <button className="full-primary" type="button" onClick={saveEdit}>変更を保存</button>
          </div>
        </div>
      )}

      {/* 積立額変更パネル */}
      {panel === "contribution" && (
        <div className="inv-manage-body">
          <p className="setting-copy">指定した月から新しい積立額を適用します。</p>
          <div className="crud-form compact-form">
            <label>変更開始月<input type="month" value={contributionDraft.month} onChange={(e) => setContributionDraft({ ...contributionDraft, month: e.target.value })} /></label>
            <label>毎月積立額<input type="number" value={numberInputValue(contributionDraft.monthlyContribution)} onChange={(e) => setContributionDraft({ ...contributionDraft, monthlyContribution: Number(e.target.value || 0) })} /></label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="google-button" type="button" style={{ flex: 1 }} onClick={() => setContributionDraft({ ...contributionDraft, monthlyContribution: 0 })}>積立停止（0円）</button>
              <button className="full-primary" type="button" style={{ flex: 1 }} onClick={saveContribution}>積立額を保存</button>
            </div>
          </div>
          <div className="investment-change-list">
            <div><span>開始時の積立額</span><strong>{yen.format(account.monthlyContribution)}/月</strong></div>
            {contributionChanges.map((change) => (
              <div key={change.id}>
                <span>{formatMonthLabel(change.month)}から</span>
                <strong>{yen.format(change.monthlyContribution)}/月</strong>
                <button className="mini-button" type="button" onClick={() => setContributionDraft({ month: change.month, monthlyContribution: change.monthlyContribution })}>この内容で編集</button>
                <button className="danger-button" type="button" onClick={async () => {
                  try { await deleteInvestmentContributionChange(change.id); await reload(); setNotice("積立額の変更を削除しました。"); }
                  catch (error) { setNotice(toJapaneseError(error, "削除に失敗しました。")); }
                }}>削除</button>
              </div>
            ))}
          </div>
        </div>
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
  const [confirmAction, setConfirmAction] = useState<"deleteHousehold" | "suspendUser" | "resumeUser" | "deleteUser" | "toggleRole" | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState<string | null>(null);
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
                    <div><span>表示名</span><strong>{editingDisplayName !== null ? <input type="text" value={editingDisplayName} onChange={(e) => setEditingDisplayName(e.target.value)} placeholder="ユーザー名" /> : selectedUser.displayName}</strong></div>
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
                    {editingDisplayName !== null ? (
                      <div>
                        <input type="text" value={editingDisplayName} onChange={(e) => setEditingDisplayName(e.target.value)} placeholder="新しい表示名" />
                        <button type="button" onClick={async () => { try { await adminUpdateUserDisplayName(selectedUser.id, editingDisplayName); await reloadDashboard(); setEditingDisplayName(null); } catch (caught) { setError(toJapaneseError(caught, "ユーザー名の更新に失敗しました。")); } }}>保存</button>
                        <button type="button" onClick={() => setEditingDisplayName(null)}>キャンセル</button>
                      </div>
                    ) : !confirmAction ? (
                      <div>
                        <button type="button" onClick={() => setEditingDisplayName(selectedUser.displayName || "")}>名前を編集</button>
                        <button type="button" onClick={() => setConfirmAction("toggleRole")}>権限を{selectedUser.role === "admin" ? "解除" : "付与"}</button>
                        {selectedUser.deletedAt ? (
                          <button type="button" onClick={() => setConfirmAction("resumeUser")}>アカウントを再開</button>
                        ) : (
                          <button type="button" onClick={() => setConfirmAction("suspendUser")}>アカウントを停止</button>
                        )}
                        <button className="danger-button" type="button" onClick={() => setConfirmAction("deleteUser")}>アカウントを削除</button>
                      </div>
                    ) : null}
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
                    {confirmAction === "toggleRole" && (
                      <>
                        <p>「{selectedUser.displayName}」の権限を{selectedUser.role === "admin" ? "一般ユーザーに変更" : "管理者に昇格"}しますか？</p>
                        <div>
                          <button type="button" onClick={async () => { try { await adminToggleUserRole(selectedUser.id); await reloadDashboard(); setConfirmAction(null); } catch (caught) { setError(toJapaneseError(caught, "権限の変更に失敗しました。")); } }}>確認</button>
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
                        <p>本当に「{selectedHousehold.name}」を削除しますか？ 取引・口座・固定費も見えなくなります。</p>
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

function FutureSnapshotNotice({ state, setNotice, reload }: { state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void> }) {
  const months = futureSnapshotMonths(state);
  if (months.length === 0) return null;
  return (
    <div className="future-snapshot-warning">
      <b>まだ来ていない月が「確定」になっています</b>
      <p>来月以降の月末資産は実際の残高ではないので、計算には使っていません。その月が来ると古い金額がそのまま使われてしまうので、取り消してください。</p>
      {months.map((month) => (
        <div className="future-snapshot-row" key={month}>
          <span>{formatMonthLabel(month)}（{yen.format(state.assetSnapshots.filter((snapshot) => snapshot.month === month).reduce((sum, snapshot) => sum + snapshot.amount, 0))}）</span>
          <button type="button" onClick={async () => {
            try {
              await deleteAssetSnapshotsForMonth(state.householdId ?? "", month);
              await reload();
              setNotice(`${formatMonthLabel(month)}の確定を取り消しました。`);
            } catch (error) { setNotice(toJapaneseError(error, "月末資産の取り消しに失敗しました。")); }
          }}>確定を取り消す</button>
        </div>
      ))}
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
      <FutureSnapshotNotice state={state} setNotice={setNotice} reload={() => reloadHousehold(state.householdId ?? "")} />
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
          <label>引落口座<AccountSelect value={withdrawalAccountId} onChange={(nextId: string) => setWithdrawalAccountId(nextId)} accounts={state.accounts.filter((item) => item.type !== "credit")} placeholder="選択してください" /></label>
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reassignTo, setReassignTo] = useState("");

  // 削除時に影響する取引と子カテゴリを算出
  const childCategoryIds = state.categories
    .filter((c) => c.parentId === category.id)
    .map((c) => c.id);
  const affectedTxCount = state.transactions.filter(
    (t) => t.categoryId === category.id || childCategoryIds.includes(t.categoryId ?? "")
  ).length;
  const hasChildren = childCategoryIds.length > 0;

  // 移行先として選べるカテゴリ（自身と子を除く・同じkind）
  const reassignOptions = sortCategories(
    state.categories.filter((c) => c.id !== category.id && !childCategoryIds.includes(c.id) && c.kind === kind)
  );

  const handleDelete = async () => {
    try {
      // 取引を移行先に一括更新（件数に関わらず実行、移行先なしの場合はnull）
      await reassignCategoryTransactions(category.id, reassignTo || null);
      for (const childId of childCategoryIds) {
        await reassignCategoryTransactions(childId, reassignTo || null);
      }
      // 子カテゴリも削除
      for (const childId of childCategoryIds) {
        await deleteCategory(childId);
      }
      await deleteCategory(category.id);
      await reloadHousehold(state.householdId ?? "");
      onDone();
      setNotice("カテゴリーを削除しました。");
    } catch (error) {
      setNotice(toJapaneseError(error, "カテゴリー削除に失敗しました。"));
    }
  };

  if (confirmDelete) {
    return (
      <div className="edit-row balanced-edit">
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--expense)", marginBottom: 4 }}>
          カテゴリーを削除しますか？
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
          {affectedTxCount > 0
            ? <>このカテゴリーの取引が <strong style={{ color: "var(--ink)" }}>{affectedTxCount}件</strong> あります。移行先を指定してください。</>
            : "このカテゴリーに関連する取引はありません。"}
        </div>
        {hasChildren && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
            サブカテゴリー {childCategoryIds.length}件 も同時に削除されます。
          </div>
        )}
        <label>
          取引の移行先カテゴリー
          <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
            <option value="">カテゴリーなし（未分類）にする</option>
            {reassignOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <button onClick={handleDelete} style={{ background: "var(--expense)", color: "#fff" }}>
          {affectedTxCount > 0 ? `${affectedTxCount}件を移動して削除` : "削除する"}
        </button>
        <button type="button" onClick={() => setConfirmDelete(false)}>キャンセル</button>
      </div>
    );
  }

  return (
    <div className="edit-row balanced-edit">
      <label>{category.parentId ? "サブカテゴリー名" : "カテゴリー名"}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>用途<select value={kind} onChange={(event) => setKind(event.target.value as "expense" | "income")}><option value="expense">支出</option><option value="income">収入</option></select></label>
      <label>分類<select value={parentId} onChange={(event) => { const nextParentId = event.target.value; setParentId(nextParentId); const parent = state.categories.find((item) => item.id === nextParentId); if (parent) { setKind(parent.kind); setColor(nextSubcategoryColor(state.categories.filter((item) => item.id !== category.id), nextParentId)); } }}><option value="">カテゴリーにする</option>{sortCategories(state.categories.filter((item) => !item.parentId && item.id !== category.id && item.kind === kind)).map((item) => <option value={item.id} key={item.id}>{item.name} のサブカテゴリーにする</option>)}</select></label>
      <label>{parentId ? "色（自動グラデーション）" : "色"}<input type="color" value={color} disabled={Boolean(parentId)} onChange={(event) => setColor(event.target.value)} /></label>
      <button onClick={async () => { try { if (!name.trim()) { setNotice("カテゴリー名を入力してください。"); return; } await updateCategory(category.id, { name, parentId, color, kind }); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice(parentId ? "サブカテゴリーを更新しました。" : "カテゴリーを更新しました。サブカテゴリーをグラデーションに揃えました。"); } catch (error) { setNotice(toJapaneseError(error, "カテゴリー更新に失敗しました。")); } }}>変更を保存</button>
      <button type="button" onClick={() => setConfirmDelete(true)}>カテゴリーを削除</button>
      <button type="button" onClick={onDone}>編集をやめる</button>
    </div>
  );
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

// 定期項目の詳細（タップで開く）。「編集」を押したときだけ編集フォームにする
function FixedCostDetail({ cost, state, setNotice, reloadHousehold, onClose }: { cost: FixedCost; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <EditableFixedCostRow cost={cost} state={state} setNotice={setNotice} reloadHousehold={reloadHousehold} onDone={() => setEditing(false)} onSaved={onClose} />;
  const account = state.accounts.find((item) => item.id === cost.accountId);
  const transferTo = state.accounts.find((item) => item.id === cost.transferToAccountId);
  const isLedger = Boolean(cost.transferGroupId);
  const isIn = cost.transferDirection === "in";
  const kindLabel = cost.taxKind ? TAX_KIND_META[cost.taxKind].label : isLedger ? (isIn ? "資金移動（受け取り）" : "資金移動") : cost.kind === "income" ? "定期収入" : cost.kind === "transfer" ? "定期振替" : "定期支出";
  const dayLabel = isLedger ? "移動日" : cost.kind === "income" ? "入金日" : cost.kind === "transfer" ? "振替日" : "支払日";
  const info = cost.kind !== "income" && !isLedger && !isTaxInstallment(cost) ? installmentInfo(state, cost) : null;
  const rows: Array<[string, React.ReactNode]> = [
    ["種類", kindLabel],
    isTaxInstallment(cost)
      ? ["支払日", `${(cost.effectiveFrom ?? "").slice(0, 4)}年${Number((cost.effectiveFrom ?? "").slice(5, 7))}月${cost.dueDay}日`]
      : [dayLabel, `毎月${cost.dueDay}日`]
  ];
  if (cost.categoryId || (cost.kind !== "transfer" && !isLedger)) rows.push(["カテゴリ", categoryPathLabel(state, cost.categoryId) || "なし"]);
  if (isLedger) {
    rows.push([isIn ? "入ってくる口座" : "移動元の口座", account ? <span className="fixed-detail-acct"><AccountMark account={account} size="sm" />{account.name}</span> : "未設定"]);
    rows.push([isIn ? "移動元" : "移動先", `${cost.counterpartyHouseholdName ?? "別の家計簿"}${cost.counterpartyAccountName ? `（${cost.counterpartyAccountName}）` : ""}`]);
    rows.push([isIn ? "収入として数える" : "支出として数える", (isIn ? cost.kind === "income" : cost.kind === "expense") ? "はい" : "いいえ（残高だけ動く）"]);
  } else {
    rows.push([cost.kind === "income" ? "入金先" : cost.kind === "transfer" ? "振替元" : "支払元", account ? <span className="fixed-detail-acct"><AccountMark account={account} size="sm" />{account.name}</span> : "未設定"]);
    if (cost.kind === "transfer") rows.push(["振替先", transferTo ? <span className="fixed-detail-acct"><AccountMark account={transferTo} size="sm" />{transferTo.name}</span> : "未設定"]);
  }
  if (!isTaxInstallment(cost)) rows.push(["期間", `${cost.effectiveFrom ? formatMonthLabel(cost.effectiveFrom.slice(0, 7)) : "開始月なし"} 〜 ${cost.effectiveTo ? formatMonthLabel(cost.effectiveTo.slice(0, 7)) : "ずっと続く"}`]);
  if (info) rows.push(["支払い回数", `残り ${info.remaining}/${info.total}回（残り ${plainAmount(info.remainingAmount)}円）`]);
  if (cost.memo) rows.push(["メモ", <span className="fixed-detail-memo">{cost.memo}</span>]);
  return (
    <div className="fixed-detail-view">
      <div className="fixed-detail-amount">
        <span>{isTaxInstallment(cost) ? "この回の金額" : cost.variable ? "毎月（約）" : "毎月"}</span>
        <b className={`num${cost.kind === "income" || isIn ? " pos" : ""}`}>{cost.kind === "income" || isIn ? "+" : ""}{plainAmount(cost.amount)}<small>円</small></b>
      </div>
      <dl className="fixed-detail-list">
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <button type="button" className="full-primary" onClick={() => setEditing(true)}>編集</button>
    </div>
  );
}

function EditableFixedCostRow({ onSaved, ...props }: { cost: LedgerState["fixedCosts"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onDone: () => void; onSaved?: () => void }) {
  // onDone は「編集をやめる」、保存・削除のあとは onSaved（なければ onDone）
  const cancel = props.onDone;
  const finished = onSaved ?? props.onDone;
  const shared = { ...props, onDone: finished, onCancel: cancel };
  if (props.cost.transferGroupId) return <LedgerFixedCostEditor {...shared} />;
  return <PlainFixedCostEditor {...shared} />;
}

function LedgerFixedCostEditor({ cost, state, setNotice, reloadHousehold, onDone, onCancel }: { cost: LedgerState["fixedCosts"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onDone: () => void; onCancel?: () => void }) {
  const isIn = cost.transferDirection === "in";
  const [draft, setDraft] = useState(cost);
  // 送る側は「支出」、受け取る側は「収入」として数えるか
  const [countAsExpense, setCountAsExpense] = useState(cost.transferDirection === "in" ? cost.kind === "income" : cost.kind === "expense");
  const [scope, setScope] = useState<"all" | "future">("all");
  const [fromMonth, setFromMonth] = useState(todayIso().slice(0, 7));
  const [overdraft, setOverdraft] = useState<OverdraftInfo | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOverdraft(null); }, [draft.amount, draft.dueDay, draft.accountId]);
  const other = `${cost.counterpartyHouseholdName ?? "別の家計簿"}${cost.counterpartyAccountName ? `（${cost.counterpartyAccountName}）` : ""}`;
  const onlyEndMonthChanged = (draft.memo ?? "") === (cost.memo ?? "") && draft.name === cost.name && draft.amount === cost.amount && draft.categoryId === cost.categoryId && draft.accountId === cost.accountId && draft.dueDay === cost.dueDay && countAsExpense === (cost.transferDirection === "in" ? cost.kind === "income" : cost.kind === "expense") && (draft.effectiveFrom ?? "") === (cost.effectiveFrom ?? "") && (draft.effectiveTo ?? "") !== (cost.effectiveTo ?? "");
  async function save(allowOverdraft = false) {
    if (!draft.accountId) return setNotice("口座を選択してください。");
    if (!isIn && !allowOverdraft) {
      const nextDate = nextFixedOccurrenceDate(draft.dueDay, scope === "future" ? `${fromMonth}-01` : draft.effectiveFrom, draft.effectiveTo);
      // 編集前の自分の分を除いて計算する
      const without = { ...state, fixedCosts: state.fixedCosts.filter((item) => item.id !== cost.id) };
      const info = nextDate ? overdraftFor(without, draft.accountId, draft.amount, nextDate, undefined, true) : null;
      if (info) return setOverdraft(info);
    }
    setBusy(true);
    try {
      const updateScope = onlyEndMonthChanged ? "all" : scope;
      await updateLedgerFixedTransfer({
        groupId: cost.transferGroupId ?? "",
        householdId: state.householdId ?? "",
        name: draft.name,
        amount: draft.amount,
        dueDay: draft.dueDay,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo,
        categoryId: draft.categoryId || undefined,
        accountId: draft.accountId,
        countAsExpense,
        scope: updateScope,
        fromMonth
      });
      if ((draft.memo ?? "") !== (cost.memo ?? "")) {
        if (updateScope === "future") await saveLedgerFixedMemoFromMonth(state.householdId ?? "", cost.transferDirection ?? "out", draft.name, fromMonth, (draft.memo ?? "").trim());
        else await saveLedgerFixedMemo(cost.transferGroupId ?? "", (draft.memo ?? "").trim());
      }
      await reloadHousehold(state.householdId ?? "");
      onDone();
      setNotice(updateScope === "future" ? "指定月以降の定期の資金移動を更新しました（相手の家計簿にも反映）。" : "定期の資金移動を更新しました（相手の家計簿にも反映）。");
    } catch (error) {
      setNotice(toJapaneseError(error, "定期の資金移動の更新に失敗しました。"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="edit-row">
      <div className="ledger-transfer-pair"><span>{isIn ? "移動元" : "移動先"}</span><b>{other}</b></div>
      <label>項目名<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>金額<input type="number" value={numberInputValue(draft.amount)} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value || 0) })} /></label>
      <CategoryPicker categories={state.categories} kind={isIn ? "income" : "expense"} value={draft.categoryId ?? ""} onChange={(id) => setDraft({ ...draft, categoryId: id })} label="この家計簿のカテゴリ" optional />
      <label>{isIn ? "入ってくる口座" : "移動元の口座"}<AccountSelect value={draft.accountId} onChange={(nextId: string) => setDraft({ ...draft, accountId: nextId })} accounts={sortAccountsByType(state.accounts.filter((account) => account.type !== "credit"))} /></label>
      <label>移動日<input type="number" min="1" max="31" value={numberInputValue(draft.dueDay)} onChange={(event) => setDraft({ ...draft, dueDay: Number(event.target.value || 0) })} /></label>
      <label className="ledger-transfer-toggle">
        <input type="checkbox" checked={countAsExpense} onChange={(event) => setCountAsExpense(event.target.checked)} />
        {isIn
          ? <span><b>この家計簿の収入として数える</b><small>{countAsExpense ? "受け取る金額が、この家計簿の毎月の収入に入ります。" : "収入には入れず、残高だけが増えます。"}</small></span>
          : <span><b>この家計簿の支出として数える</b><small>{countAsExpense ? "移動した金額が、この家計簿の毎月の支出に入ります。" : "支出には入れず、残高だけが動きます。"}</small></span>}
      </label>
      <label>開始月<input type="month" value={(draft.effectiveFrom ?? todayIso()).slice(0, 7)} onChange={(event) => setDraft({ ...draft, effectiveFrom: `${event.target.value}-01` })} /></label>
      <InstallmentFields
        startMonth={(draft.effectiveFrom ?? todayIso()).slice(0, 7)}
        endMonth={draft.effectiveTo?.slice(0, 7)}
        onChange={(end) => setDraft({ ...draft, effectiveTo: end ? `${end}-01` : undefined })}
      />
      <label className="fixed-memo-field">メモ（相手の家計簿にも表示）<textarea className="memo-input" rows={2} placeholder="例: 2人で月6万円ずつ" value={draft.memo ?? ""} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} /></label>
      <label>削除・変更の範囲<select value={scope} onChange={(event) => setScope(event.target.value as "all" | "future")}><option value="all">過去分も含めてすべてに反映</option><option value="future">指定した月以降だけに反映</option></select></label>
      {scope === "future" && <label>指定月<input type="month" value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} /></label>}
      <p className="settings-note">名称・金額・移動日・期間・メモは相手の家計簿にも反映されます。カテゴリと口座はこの家計簿の分だけ変わります。</p>
      {overdraft
        ? <OverdraftConfirm info={overdraft} busy={busy} onCancel={() => setOverdraft(null)} onConfirm={() => save(true)} />
        : <button type="button" disabled={busy} onClick={() => save(false)}>{busy ? "保存中…" : "変更を保存"}</button>}
      <button type="button" onClick={async () => { try { await deleteLedgerFixedTransfer(cost.transferGroupId ?? "", scope, fromMonth); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice(scope === "future" ? "指定月以降の定期の資金移動を終了しました（相手の家計簿も）。" : "定期の資金移動を削除しました（相手の家計簿からも）。"); } catch (error) { setNotice(toJapaneseError(error, "定期の資金移動の削除に失敗しました。")); } }}>定期項目を削除（両方の家計簿）</button>
      <button type="button" onClick={onCancel ?? onDone}>編集をやめる</button>
    </div>
  );
}

function PlainFixedCostEditor({ cost, state, setNotice, reloadHousehold, onDone, onCancel }: { cost: LedgerState["fixedCosts"][number]; state: LedgerState; setNotice: (message: string) => void; reloadHousehold: (householdId: string) => Promise<void>; onDone: () => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState(cost);
  // 税金の1回分（その月だけの項目）は「支払日」を年月日で直す
  const oneOff = isTaxInstallment(cost);
  const oneOffDate = `${(draft.effectiveFrom ?? todayIso()).slice(0, 7)}-${String(Math.min(draft.dueDay, lastDayOfMonth((draft.effectiveFrom ?? todayIso()).slice(0, 7)))).padStart(2, "0")}`;
  const hasOtherLedgers = (state.households ?? []).some((ledger) => ledger.id !== state.householdId);
  const [transferScope, setTransferScope] = useState<"self" | "ledger">("self");
  const [dest, setDest] = useState<LedgerDestination>(() => { const memory = readLedgerTransferMemory(state.householdId); return { toHouseholdId: memory.toHouseholdId, toAccountId: memory.toAccountId, fromCategoryId: memory.fromCategoryId, toCategoryId: memory.toCategoryId, countAsExpense: memory.countAsExpense, countAsIncome: memory.countAsIncome }; });
  const toLedger = draft.kind === "transfer" && hasOtherLedgers && transferScope === "ledger";
  const [overdraft, setOverdraft] = useState<OverdraftInfo | null>(null);
  useEffect(() => { setOverdraft(null); }, [draft.amount, draft.dueDay, draft.accountId, draft.kind]);
  const [scope, setScope] = useState<"all" | "future">("all");
  const [fromMonth, setFromMonth] = useState(todayIso().slice(0, 7));
  const onlyEndMonthChanged = (
    draft.kind === cost.kind &&
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
  function changeKind(kind: TransactionType) {
    if (kind === draft.kind) return;
    const normal = state.accounts.filter((account) => account.type !== "credit");
    const currentAccount = state.accounts.find((account) => account.id === draft.accountId);
    const accountId = kind !== "expense" && currentAccount?.type === "credit" ? normal[0]?.id ?? "" : draft.accountId;
    const categoryStillFits = state.categories.find((category) => category.id === draft.categoryId)?.kind === kind;
    const originalFits = kind === cost.kind;
    setDraft({
      ...draft,
      kind,
      accountId,
      categoryId: kind === "transfer" ? "" : originalFits ? cost.categoryId : categoryStillFits ? draft.categoryId : "",
      transferToAccountId: kind === "transfer" ? (cost.kind === "transfer" && cost.transferToAccountId !== accountId ? cost.transferToAccountId : normal.find((account) => account.id !== accountId)?.id ?? "") : undefined
    });
  }
  async function saveAsLedger(allowOverdraft: boolean) {
    try {
      if (!draft.accountId) { setNotice("移動元の口座を選択してください。"); return; }
      if (!dest.toAccountId) { setNotice("移動先の口座を選択してください。"); return; }
      const startFrom = scope === "future" ? `${fromMonth}-01` : draft.effectiveFrom;
      if (!allowOverdraft) {
        const nextDate = nextFixedOccurrenceDate(draft.dueDay, startFrom, draft.effectiveTo);
        const info = nextDate ? overdraftFor({ ...state, fixedCosts: state.fixedCosts.filter((item) => item.id !== cost.id) }, draft.accountId, draft.amount, nextDate, undefined, true) : null;
        if (info) { setOverdraft(info); return; }
      }
      // 先に資金移動を作ってから、元の定期項目を終わらせる（失敗しても元が消えないように）
      const groupId = await createLedgerFixedTransfer({
        fromHouseholdId: state.householdId ?? "",
        fromAccountId: draft.accountId,
        fromCategoryId: dest.fromCategoryId || undefined,
        toHouseholdId: dest.toHouseholdId,
        toAccountId: dest.toAccountId,
        toCategoryId: dest.toCategoryId || undefined,
        name: draft.name || "資金移動",
        amount: draft.amount,
        dueDay: draft.dueDay,
        effectiveFrom: startFrom,
        effectiveTo: draft.effectiveTo,
        countAsExpense: dest.countAsExpense,
        countAsIncome: dest.countAsIncome
      });
      if ((draft.memo ?? "").trim() && groupId) await saveLedgerFixedMemo(groupId, (draft.memo ?? "").trim());
      await deleteFixedCost(cost.id, scope, fromMonth);
      await reloadHousehold(state.householdId ?? "");
      onDone();
      setNotice(scope === "future" ? "指定月以降を家計簿間の資金移動に変更しました（相手の家計簿にも登録）。" : "家計簿間の資金移動に変更しました（相手の家計簿にも登録）。");
    } catch (error) { setNotice(toJapaneseError(error, "資金移動への変更に失敗しました。")); }
  }
  async function savePlain(allowOverdraft: boolean) { if (toLedger) { await saveAsLedger(allowOverdraft); return; } try { if (draft.kind !== "transfer" && !draft.categoryId && !draft.taxKind) { setNotice(draft.kind === "income" ? "固定収入のカテゴリを選択してください。" : "固定費のカテゴリを選択してください。"); return; } if (!draft.accountId) { setNotice(draft.kind === "income" ? "固定収入の入金先を選択してください。" : draft.kind === "transfer" ? "定期振替の振替元を選択してください。" : "固定費の支払元を選択してください。"); return; } if (draft.kind === "transfer" && !draft.transferToAccountId) { setNotice("定期振替の振替先を選択してください。"); return; } if (draft.kind === "transfer" && !allowOverdraft) { const nextDate = nextFixedOccurrenceDate(draft.dueDay, scope === "future" ? `${fromMonth}-01` : draft.effectiveFrom, draft.effectiveTo); const info = nextDate ? overdraftFor({ ...state, fixedCosts: state.fixedCosts.filter((item) => item.id !== cost.id) }, draft.accountId, draft.amount, nextDate, undefined, true) : null; if (info) { setOverdraft(info); return; } } const updateScope = onlyEndMonthChanged ? "all" : scope; await updateFixedCost(cost.id, { ...draft, status: "planned" }, updateScope, fromMonth); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice(updateScope === "future" ? "指定月以降の固定項目を更新しました。" : "固定項目を更新しました。"); } catch (error) { setNotice(toJapaneseError(error, "固定項目更新に失敗しました。")); } }
  return (
    <div className="edit-row">
      {!oneOff && <div className="fixed-kind-field">
        <span>種類</span>
        <div className="segmented compact" role="tablist" aria-label="定期項目の種類">
          {(["expense", "income", "transfer"] as TransactionType[]).map((kind) => (
            <button key={kind} type="button" className={draft.kind === kind ? "selected" : ""} onClick={() => changeKind(kind)}>{kind === "expense" ? "支出" : kind === "income" ? "収入" : "振替"}</button>
          ))}
        </div>
        {draft.kind !== cost.kind && <small>{cost.kind === "expense" ? "支出" : cost.kind === "income" ? "収入" : "振替"}から{draft.kind === "expense" ? "支出" : draft.kind === "income" ? "収入" : "振替"}に変わります。{draft.kind === "transfer" ? "振替先を選んでください。" : "カテゴリを選び直してください。"}</small>}
      </div>}
      <label>項目名<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>金額<input type="number" value={numberInputValue(draft.amount)} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value || 0) })} /></label>
      {draft.kind !== "transfer" && <label>カテゴリ<select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">選択してください</option><CategoryOptions categories={state.categories} kind={draft.kind} /></select></label>}
      <label>{draft.kind === "income" ? "入金先" : draft.kind === "transfer" ? (toLedger ? "移動元の口座" : "振替元") : "支払元"}<AccountSelect value={draft.accountId} onChange={(nextId: string) => setDraft({ ...draft, accountId: nextId, transferToAccountId: nextId === draft.transferToAccountId ? "" : draft.transferToAccountId })} accounts={sortAccountsByType(state.accounts.filter((account) => draft.kind === "expense" || account.type !== "credit"))} placeholder="選択してください" /></label>
      {draft.kind === "transfer" && hasOtherLedgers && (
        <div className="segmented compact transfer-scope fixed-kind-scope" role="tablist" aria-label="移動先">
          <button type="button" className={transferScope === "self" ? "selected" : ""} onClick={() => setTransferScope("self")}>自分の口座間</button>
          <button type="button" className={transferScope === "ledger" ? "selected" : ""} onClick={() => setTransferScope("ledger")}>別の家計簿へ</button>
        </div>
      )}
      {toLedger && <div className="fixed-ledger-dest"><LedgerDestinationFields state={state} value={dest} onChange={setDest} recurring /></div>}
      {draft.kind === "transfer" && !toLedger && <label>振替先<AccountSelect value={draft.transferToAccountId ?? ""} onChange={(nextId: string) => setDraft({ ...draft, transferToAccountId: nextId })} accounts={state.accounts.filter((account) => account.type !== "credit" && account.id !== draft.accountId)} placeholder="選択してください" /></label>}
      {oneOff ? (
        <label>支払日<input type="date" value={oneOffDate} onChange={(event) => { const value = event.target.value; if (!value) return; setDraft({ ...draft, effectiveFrom: `${value.slice(0, 7)}-01`, effectiveTo: `${value.slice(0, 7)}-01`, dueDay: Number(value.slice(8, 10)) }); }} /></label>
      ) : (<>
      <label>{draft.kind === "income" ? "入金日" : draft.kind === "transfer" ? "振替日" : "支払日"}<input type="number" min="1" max="31" value={numberInputValue(draft.dueDay)} onChange={(event) => setDraft({ ...draft, dueDay: Number(event.target.value || 0) })} /></label>
      <label>開始月<input type="month" value={(draft.effectiveFrom ?? todayIso()).slice(0, 7)} onChange={(event) => setDraft({ ...draft, effectiveFrom: `${event.target.value}-01` })} /></label>
      <InstallmentFields
        startMonth={(fixedCostChain(state, cost)[0].effectiveFrom ?? draft.effectiveFrom ?? todayIso()).slice(0, 7)}
        endMonth={draft.effectiveTo?.slice(0, 7)}
        onChange={(end) => setDraft({ ...draft, effectiveTo: end ? `${end}-01` : undefined })}
      />
      </>)}
      <label className="fixed-memo-field">メモ<textarea className="memo-input" rows={2} placeholder="例: 年1回の更新料込み" value={draft.memo ?? ""} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} /></label>
      {!oneOff && <>
      <label>削除・変更の範囲<select value={scope} onChange={(event) => setScope(event.target.value as "all" | "future")}><option value="all">過去分も含めてすべてに反映</option><option value="future">指定した月以降だけに反映</option></select></label>
      {scope === "future" && <label>指定月<input type="month" value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} /></label>}
      </>}
      {overdraft
        ? <OverdraftConfirm info={overdraft} onCancel={() => setOverdraft(null)} onConfirm={() => savePlain(true)} />
        : <button onClick={() => savePlain(false)}>変更を保存</button>}
      <button onClick={async () => { try { await deleteFixedCost(cost.id, scope, fromMonth); await reloadHousehold(state.householdId ?? ""); onDone(); setNotice(scope === "future" ? "指定月以降の定期項目を削除しました。" : "定期項目を削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "定期項目の削除に失敗しました。")); } }}>定期項目を削除</button>
      <button type="button" onClick={onCancel ?? onDone}>編集をやめる</button>
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

function MonthSwitcher({ monthKey, setMonthKey, setSelectedDate }: { monthKey: string; setMonthKey: (value: string) => void; setSelectedDate: (value: string) => void }) {
  function updateMonth(nextMonth: string) {
    if (!nextMonth) return;
    setMonthKey(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  }
  const isCurrent = monthKey === todayIso().slice(0, 7);
  return (
    <div className="month-switcher" aria-label="表示月">
      {/* 「今月」は場所を確保したまま出し入れして、矢印の位置がずれないようにする */}
      <button type="button" className={`month-switcher-today${isCurrent ? " is-hidden" : ""}`} onClick={() => updateMonth(todayIso().slice(0, 7))} tabIndex={isCurrent ? -1 : 0} aria-hidden={isCurrent}>今月</button>
      <button type="button" className="month-switcher-arrow" onClick={() => updateMonth(shiftMonthKey(monthKey, -1))} aria-label="前月"><ChevronLeft size={20} /></button>
      <label className="month-switcher-label">
        <span>{monthKey.replace("-", ".")}</span>
        <input type="month" value={monthKey} onChange={(event) => updateMonth(event.target.value)} aria-label="月を選択" />
      </label>
      <button type="button" className="month-switcher-arrow" onClick={() => updateMonth(shiftMonthKey(monthKey, 1))} aria-label="翌月"><ChevronRight size={20} /></button>
    </div>
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

function TransactionList({ state, limit, setNotice, reload, leading = "date" }: { state: LedgerState; limit?: number; setNotice: (message: string) => void; reload: () => Promise<void>; leading?: "date" | "kind" }) {
  const rows = state.transactions.slice(0, limit);
  return (
    <div className="transaction-list">
      {rows.map((transaction) => {
        return <TransactionRow key={transaction.id} transaction={transaction} state={state} setNotice={setNotice} reload={reload} leading={leading} />;
      })}
    </div>
  );
}

function TransactionRow({ transaction, state, setNotice, reload, leading = "date" }: { transaction: LedgerState["transactions"][number]; state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void>; leading?: "date" | "kind" }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(transaction);
  const category = state.categories.find((item) => item.id === transaction.categoryId);
  const account = state.accounts.find((item) => item.id === transaction.accountId);
  const normalAccounts = state.accounts.filter((item) => item.type !== "credit");
  const draftCreditAccount = state.accounts.find((item) => item.id === draft.accountId && item.type === "credit");
  const isDraftCreditExpense = draft.type === "expense" && Boolean(draftCreditAccount);
  const autoWithdrawalDate = isDraftCreditExpense && draftCreditAccount ? nextWithdrawalDate(draftCreditAccount, draft.date) : undefined;
  const [overdraft, setOverdraft] = useState<OverdraftInfo | null>(null);
  useEffect(() => { setOverdraft(null); }, [draft.amount, draft.accountId, draft.date, draft.type]);
  async function saveDraft(allowOverdraft = false) {
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
    if (draft.type === "transfer" && !allowOverdraft) {
      const info = overdraftFor(state, draft.accountId, draft.amount, draft.date, transaction.id);
      if (info) { setOverdraft(info); return; }
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
  const categoryLabel = categoryPathLabel(state, transaction.categoryId);
  const transferTo = transaction.type === "transfer" ? state.accounts.find((item) => item.id === transaction.transferToAccountId) : undefined;
  const isLedgerMove = Boolean(transaction.transferGroupId);
  const isMoveIn = transaction.transferDirection === "in";
  const subLine = isLedgerMove
    ? ledgerTransferLine(transaction, account?.name)
    : transaction.type === "transfer"
    ? `${account?.name ?? "口座未設定"} → ${transferTo?.name ?? "未設定"}`
    : `${categoryLabel || "カテゴリなし"}／${account?.name ?? "口座未設定"}`;
  return (
    <>
      <article className={`tx-row${expanded ? " expanded" : ""}`}>
        <button className="tx-main" type="button" onClick={() => setExpanded(!expanded)}>
          {leading === "kind"
            ? <div className={`tx-lead kind ${transaction.type}`}>{txKindLabel(transaction, state)}</div>
            : <div className="tx-lead">{shortDate(transaction.date)}<small>{weekdayOf(transaction.date)}</small></div>}
          <div className="tx-body">
            <strong>{transaction.memo || category?.name || (isLedgerMove ? (isMoveIn ? "資金移動（受け取り）" : "資金移動") : transactionTypeLabel[transaction.type])}</strong>
            <small>{subLine}</small>
          </div>
          <em className={`tx-amount ${isLedgerMove ? (isMoveIn ? "move-in" : "move-out") : transaction.type}`}>
            {transaction.type === "income" || isMoveIn ? "+" : ""}{plainAmount(transaction.amount)}
            {transaction.reflectedDate && <small>{shortDate(transaction.reflectedDate)} 引落</small>}
          </em>
        </button>
        {expanded && (
          <div className="tx-actions">
            <button type="button" onClick={() => setEditing(true)}>編集</button>
            <button className="danger" type="button" onClick={async () => { try { if (transaction.transferGroupId) { await deleteLedgerTransfer(transaction.transferGroupId); await reload(); setNotice("資金移動を削除しました（相手の家計簿の記録も削除）。"); return; } await deleteTransaction(transaction.id); await reload(); setNotice("取引を削除しました。"); } catch (error) { setNotice(toJapaneseError(error, "取引削除に失敗しました。")); } }}>削除</button>
          </div>
        )}
      </article>
      {editing && isLedgerMove && (
        <LedgerTransferEditSheet transaction={transaction} state={state} setNotice={setNotice} reload={reload} onClose={() => { setEditing(false); setExpanded(false); }} />
      )}
      {editing && !isLedgerMove && (
        <TransactionEditSheet
          transaction={transaction}
          draft={draft}
          setDraft={setDraft}
          state={state}
          setNotice={setNotice}
          saveDraft={saveDraft}
          onClose={() => { setEditing(false); setExpanded(false); }}
          isDraftCreditExpense={isDraftCreditExpense}
          draftCreditAccount={draftCreditAccount}
          autoWithdrawalDate={autoWithdrawalDate}
          normalAccounts={normalAccounts}
          overdraft={overdraft}
          clearOverdraft={() => setOverdraft(null)}
        />
      )}
    </>
  );
}

function fixedLedgerLine(cost: Pick<FixedCost, "transferDirection" | "counterpartyHouseholdName" | "counterpartyAccountName">, accountName?: string) {
  const other = `${cost.counterpartyHouseholdName ?? "別の家計簿"}${cost.counterpartyAccountName ? `（${cost.counterpartyAccountName}）` : ""}`;
  return cost.transferDirection === "in" ? `${other} → ${accountName ?? "未設定"}` : `${accountName ?? "未設定"} → ${other}`;
}

function ledgerTransferLine(transaction: Transaction, accountName?: string) {
  const other = `${transaction.counterpartyHouseholdName ?? "別の家計簿"}${transaction.counterpartyAccountName ? `（${transaction.counterpartyAccountName}）` : ""}`;
  return transaction.transferDirection === "in"
    ? `${other} → ${accountName ?? "口座未設定"}`
    : `${accountName ?? "口座未設定"} → ${other}`;
}

function LedgerTransferEditSheet({ transaction, state, setNotice, reload, onClose }: { transaction: Transaction; state: LedgerState; setNotice: (message: string) => void; reload: () => Promise<void>; onClose: () => void }) {
  const isIn = transaction.transferDirection === "in";
  const normalAccounts = state.accounts.filter((item) => item.type !== "credit");
  const [amount, setAmount] = useState(transaction.amount);
  const [date, setDate] = useState(transaction.date);
  const [memo, setMemo] = useState(transaction.memo ?? "");
  const [accountId, setAccountId] = useState(transaction.accountId);
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? "");
  // 送る側は「支出」、受け取る側は「収入」として数えるか
  const [countAsExpense, setCountAsExpense] = useState(isIn ? transaction.type === "income" : transaction.type === "expense");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [overdraft, setOverdraft] = useState<OverdraftInfo | null>(null);
  useEffect(() => { setOverdraft(null); }, [amount, accountId, date]);
  const other = `${transaction.counterpartyHouseholdName ?? "別の家計簿"}${transaction.counterpartyAccountName ? `（${transaction.counterpartyAccountName}）` : ""}`;
  async function save(allowOverdraft = false) {
    if (!amount || amount <= 0) return setNotice("金額を入力してください。");
    if (!accountId) return setNotice("口座を選択してください。");
    if (!isIn && !allowOverdraft) {
      const info = overdraftFor(state, accountId, amount, date, transaction.id);
      if (info) return setOverdraft(info);
    }
    setSaving(true);
    try {
      await updateLedgerTransfer({
        groupId: transaction.transferGroupId ?? "",
        householdId: state.householdId ?? "",
        amount,
        date,
        memo,
        categoryId: categoryId || undefined,
        accountId,
        countAsExpense
      });
      await reload();
      setNotice("資金移動を更新しました。");
      onClose();
    } catch (error) {
      setNotice(toJapaneseError(error, "資金移動の更新に失敗しました。"));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    setRemoving(true);
    try {
      await deleteLedgerTransfer(transaction.transferGroupId ?? "");
      await reload();
      setNotice("資金移動を削除しました（相手の家計簿の記録も削除）。");
      onClose();
    } catch (error) {
      setNotice(toJapaneseError(error, "資金移動の削除に失敗しました。"));
    } finally {
      setRemoving(false);
    }
  }
  return createPortal(
    <div className="sheet-backdrop" style={{ zIndex: 90 }} onClick={onClose}>
      <form className="bottom-sheet" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (!saving) save(); }}>
        <div className="sheet-handle" />
        <div className="section-title">
          <h2>資金移動を編集</h2>
          <span>{isIn ? "受け取り" : "送った"} · {date}</span>
        </div>
        <div className="ledger-transfer-pair">
          <span>{isIn ? "相手" : "移動先"}</span>
          <b>{other}</b>
        </div>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
          金額
          <input className="amount-input" style={{ fontSize: 36, padding: "10px 4px 8px" }} inputMode="numeric" type="number" min="1" value={amount === 0 ? "" : amount} onChange={(e) => setAmount(Number(e.target.value || 0))} required />
        </label>
        <CategoryPicker categories={state.categories} kind={isIn ? "income" : "expense"} value={categoryId} onChange={setCategoryId} label="この家計簿のカテゴリ" optional />
        <div className="form-grid">
          <label>{isIn ? "入ってきた口座" : "移動元の口座"}<AccountSelect value={accountId} onChange={setAccountId} accounts={sortAccountsByType(normalAccounts)} /></label>
          <label>日付<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <label className="ledger-transfer-toggle">
          <input type="checkbox" checked={countAsExpense} onChange={(event) => setCountAsExpense(event.target.checked)} />
          {isIn
            ? <span><b>この家計簿の収入として数える</b><small>{countAsExpense ? "受け取った金額が、この家計簿の収入に入ります。" : "収入には入れず、残高だけが増えます。"}</small></span>
            : <span><b>この家計簿の支出として数える</b><small>{countAsExpense ? "移動した金額が、この家計簿の支出に入ります。" : "支出には入れず、残高だけが動きます。"}</small></span>}
        </label>
        <input placeholder="メモ" value={memo} onChange={(e) => setMemo(e.target.value)} />
        <p className="settings-note">金額・日付・メモは相手の家計簿にも反映されます。カテゴリと口座はこの家計簿の分だけ変わります。</p>
        {overdraft
          ? <OverdraftConfirm info={overdraft} busy={saving} onCancel={() => setOverdraft(null)} onConfirm={() => save(true)} />
          : <button className="full-primary" type="submit" disabled={saving}>{saving ? "保存中…" : "変更を保存"}</button>}
        <button className="google-button" type="button" onClick={onClose}>キャンセル</button>
        <button className="template-save danger-text" type="button" disabled={removing} onClick={remove}>{removing ? "削除中…" : "この資金移動を削除（両方の家計簿から）"}</button>
      </form>
    </div>,
    document.body
  );
}

function TransactionEditSheet({
  transaction,
  draft,
  setDraft,
  state,
  setNotice,
  saveDraft,
  onClose,
  isDraftCreditExpense,
  draftCreditAccount,
  autoWithdrawalDate,
  normalAccounts,
  overdraft,
  clearOverdraft
}: {
  transaction: LedgerState["transactions"][number];
  draft: LedgerState["transactions"][number];
  setDraft: (d: LedgerState["transactions"][number]) => void;
  state: LedgerState;
  setNotice: (message: string) => void;
  saveDraft: (allowOverdraft?: boolean) => Promise<void>;
  onClose: () => void;
  isDraftCreditExpense: boolean;
  draftCreditAccount: LedgerState["accounts"][number] | undefined;
  autoWithdrawalDate: string | undefined;
  normalAccounts: LedgerState["accounts"];
  overdraft?: OverdraftInfo | null;
  clearOverdraft?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const typeLabel = draft.type === "income" ? "収入" : draft.type === "transfer" ? "振替" : "支出";
  return createPortal(
    <div className="sheet-backdrop" style={{ zIndex: 90 }} onClick={onClose}>
      <form
        className="bottom-sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          try { await saveDraft(); } catch (error) { setNotice(toJapaneseError(error, "取引更新に失敗しました。")); }
          finally { setSaving(false); }
        }}
      >
        <div className="sheet-handle" />
        <div className="section-title">
          <h2>取引を編集</h2>
          <span>{typeLabel} · {draft.date}</span>
        </div>

        <div className="segmented" role="tablist" aria-label="取引種別">
          {(["expense", "income", "transfer"] as TransactionType[]).map((item) => (
            <button
              key={item}
              type="button"
              className={draft.type === item ? "selected" : ""}
              onClick={() => setDraft({ ...draft, type: item, categoryId: "", accountId: "", transferToAccountId: "", reflectedDate: undefined, creditStatus: undefined })}
            >
              {transactionTypeLabel[item]}
            </button>
          ))}
        </div>

        <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
          金額
          <input
            className="amount-input"
            style={{ fontSize: 36, padding: "10px 4px 8px" }}
            inputMode="numeric"
            type="number"
            min="1"
            value={draft.amount === 0 ? "" : draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value || 0) })}
            required
          />
        </label>

        {draft.type !== "transfer" && (
          <CategoryPicker
            categories={state.categories}
            kind={draft.type === "income" ? "income" : "expense"}
            value={draft.categoryId ?? ""}
            onChange={(id) => setDraft({ ...draft, categoryId: id })}
          />
        )}
        <div className="form-grid">
          <label>{draft.type === "income" ? "入金先" : draft.type === "transfer" ? "振替元" : "支払元"}
            <AccountSelect value={draft.accountId} onChange={(nextId: string) => {
              const nextAccountId = nextId;
              const nextCreditAccount = state.accounts.find((item) => item.id === nextAccountId && item.type === "credit");
              setDraft({
                ...draft,
                accountId: nextAccountId,
                transferToAccountId: nextAccountId === draft.transferToAccountId ? "" : draft.transferToAccountId,
                reflectedDate: draft.type === "expense" && nextCreditAccount ? nextWithdrawalDate(nextCreditAccount, draft.date) : undefined,
                creditStatus: draft.type === "expense" && nextCreditAccount ? draft.creditStatus ?? "unconfirmed" : undefined
              });
            }} accounts={sortAccountsByType(draft.type === "income" || draft.type === "transfer" ? normalAccounts : state.accounts)} placeholder="選択してください" />
          </label>
          {draft.type === "transfer" && (
            <label>振替先
              <AccountSelect value={draft.transferToAccountId ?? ""} onChange={(nextId: string) => setDraft({ ...draft, transferToAccountId: nextId })} accounts={normalAccounts.filter((item) => item.id !== draft.accountId)} placeholder="選択してください" />
            </label>
          )}
          <label>{isDraftCreditExpense ? "使用日" : "日付"}
            <input type="date" value={draft.date} onChange={(e) => {
              const nextDate = e.target.value;
              const nextAutoDate = draftCreditAccount ? nextWithdrawalDate(draftCreditAccount, nextDate) : undefined;
              setDraft({ ...draft, date: nextDate, reflectedDate: isDraftCreditExpense ? nextAutoDate : undefined });
            }} />
          </label>
        </div>

        {isDraftCreditExpense && (
          <div className="credit-posting-mode">
            <span>計上する日付</span>
            <div className="segmented compact">
              <button type="button" className={draft.reflectedDate ? "selected" : ""} onClick={() => setDraft({ ...draft, reflectedDate: autoWithdrawalDate })}>引落日</button>
              <button type="button" className={!draft.reflectedDate ? "selected" : ""} onClick={() => setDraft({ ...draft, reflectedDate: undefined })}>使用日</button>
            </div>
            {draft.reflectedDate && (
              <>
                <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                  引落日
                  <input type="date" value={draft.reflectedDate ?? autoWithdrawalDate ?? ""} onChange={(e) => setDraft({ ...draft, reflectedDate: e.target.value })} />
                </label>
                <div className="date-adjust-actions">
                  <button type="button" onClick={() => setDraft({ ...draft, reflectedDate: shiftMonth(draft.reflectedDate ?? autoWithdrawalDate ?? draft.date, -1) })}>前月へ</button>
                  <button type="button" onClick={() => setDraft({ ...draft, reflectedDate: autoWithdrawalDate })}>自動計算</button>
                  <button type="button" onClick={() => setDraft({ ...draft, reflectedDate: shiftMonth(draft.reflectedDate ?? autoWithdrawalDate ?? draft.date, 1) })}>翌月へ</button>
                </div>
              </>
            )}
          </div>
        )}

        <input
          placeholder="メモ"
          value={draft.memo ?? ""}
          onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
        />

        {overdraft
          ? <OverdraftConfirm info={overdraft} busy={saving} onCancel={() => clearOverdraft?.()} onConfirm={async () => { setSaving(true); try { await saveDraft(true); } catch (error) { setNotice(toJapaneseError(error, "取引更新に失敗しました。")); } finally { setSaving(false); } }} />
          : <button className="full-primary" type="submit" disabled={saving}>{saving ? "保存中…" : "変更を保存"}</button>}
        <button className="google-button" type="button" onClick={onClose}>キャンセル</button>
        <button className="template-save" type="button" onClick={() => {
          const { template, duplicate } = saveTransactionAsTemplate(transaction, state);
          setNotice(duplicate ? `「${template.label}」はすでにテンプレートに保存されています。` : `「${template.label}」をテンプレートに保存しました。クイック入力から呼び出せます。`);
          onClose();
        }}><Star size={14} /> この取引をテンプレートに保存</button>
      </form>
    </div>,
    document.body
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


// 口座の目印（通帳の表紙／カード）
function AccountMark({ account, size = "md" }: { account: Pick<LedgerState["accounts"][number], "name" | "type" | "color">; size?: "sm" | "md" | "lg" }) {
  if (account.type === "credit") {
    return <span className={`acct-mark card ${size}`} style={{ background: account.color }} aria-hidden="true"><i /></span>;
  }
  if (account.type === "cash") {
    // お札：縁取り＋中央の ¥ メダリオン、後ろにもう1枚重なっている
    return <span className={`acct-mark cash ${size}`} style={{ background: account.color, color: account.color }} aria-hidden="true"><b>¥</b></span>;
  }
  return <span className={`acct-mark ${size}`} style={{ background: account.color }} aria-hidden="true">{account.name.slice(0, 1)}</span>;
}

// 口座を選ぶ欄（マーク付き）。ネイティブの select はアイコンを出せないため自前で描く
function AccountSelect({ value, onChange, accounts, placeholder = "選択してください" }: { value?: string; onChange: (id: string) => void; accounts: LedgerState["accounts"]; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((account) => account.id === value);
  const banks = sortAccountsByType(accounts.filter((account) => account.type !== "credit"));
  const cards = accounts.filter((account) => account.type === "credit");
  const groups = [
    { label: "口座", items: banks },
    { label: "カード", items: cards }
  ].filter((group) => group.items.length > 0);
  return (
    <span className={`account-select${open ? " open" : ""}`}>
      <button type="button" className="account-select-btn" aria-haspopup="listbox" aria-expanded={open} onClick={(event) => { event.preventDefault(); setOpen((v) => !v); }}>
        {selected ? (
          <>
            <AccountMark account={selected} size="sm" />
            <span className="account-select-name">{selected.name}<small>{accountTypeLabel(selected.type)}</small></span>
          </>
        ) : <span className="account-select-placeholder">{accounts.length ? placeholder : "選べる口座がありません"}</span>}
        <ChevronDown size={16} className="account-select-chev" />
      </button>
      {open && (
        <span className="account-select-list" role="listbox">
          {groups.map((group) => (
            <span className="account-select-group" key={group.label}>
              {groups.length > 1 && <span className="account-select-group-label">{group.label}</span>}
              {group.items.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  role="option"
                  aria-selected={account.id === value}
                  className={`account-select-option${account.id === value ? " on" : ""}`}
                  onClick={(event) => { event.preventDefault(); onChange(account.id); setOpen(false); }}
                >
                  <AccountMark account={account} size="sm" />
                  <span className="account-select-name">{account.name}<small>{accountTypeLabel(account.type)}</small></span>
                  {account.id === value && <Check size={16} />}
                </button>
              ))}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}


function sortAccountsByType<T extends { type: string }>(accounts: T[]): T[] {
  const order: Record<string, number> = { credit: 0, bank: 1, saving: 2, cash: 3 };
  return [...accounts].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
}
