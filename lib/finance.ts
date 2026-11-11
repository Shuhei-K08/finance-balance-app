import { Account, FixedCost, Goal, LedgerState, Transaction } from "./types";

export const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

export const transactionTypeLabel: Record<Transaction["type"], string> = {
  income: "収入",
  expense: "支出",
  transfer: "振替"
};

export const fixedCostStatusLabel: Record<FixedCost["status"], string> = {
  planned: "見込み",
  confirmed: "金額確定",
  paid: "支払済"
};

export const creditStatusLabel: Record<NonNullable<Transaction["creditStatus"]>, string> = {
  unconfirmed: "未確定",
  confirmed: "確定済",
  withdrawn: "引落済"
};

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function endOfMonthIso(base = new Date()) {
  return new Date(base.getFullYear(), base.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function monthKeyFromDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeyToDate(monthKey?: string) {
  if (!monthKey) return new Date();
  return new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1);
}

// 確定した月末資産のうち、計算に使えるもの。
// まだ来ていない月（来月以降）の「確定」は実際の残高ではありえないので使わない
export function usableSnapshots(state: Pick<LedgerState, "assetSnapshots">) {
  const currentMonth = todayIso().slice(0, 7);
  return state.assetSnapshots.filter((snapshot) => snapshot.month <= currentMonth);
}

export function futureSnapshotMonths(state: Pick<LedgerState, "assetSnapshots">) {
  const currentMonth = todayIso().slice(0, 7);
  return Array.from(new Set(state.assetSnapshots.filter((snapshot) => snapshot.month > currentMonth).map((snapshot) => snapshot.month))).sort();
}

function monthEndKey(monthKey: string) {
  const end = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

function previousMonthKey(monthKey: string) {
  const date = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// 予定の定期項目を数え始める月（この月は含まない）。
// 確定した月末資産があればその翌月から。無ければ今月から数える
// （来月以降の見込みに、今月分の定期項目を入れ忘れないように）
function fixedCostStartExclusive(snapshotMonth: string | undefined, targetMonth: string) {
  if (snapshotMonth) return snapshotMonth;
  const currentMonth = todayIso().slice(0, 7);
  return targetMonth > currentMonth ? previousMonthKey(currentMonth) : "";
}

function monthsBetween(startExclusive: string, endInclusive: string) {
  const start = startExclusive
    ? new Date(Number(startExclusive.slice(0, 4)), Number(startExclusive.slice(5, 7)), 1)
    : new Date(Number(endInclusive.slice(0, 4)), Number(endInclusive.slice(5, 7)) - 1, 1);
  const end = new Date(Number(endInclusive.slice(0, 4)), Number(endInclusive.slice(5, 7)) - 1, 1);
  const months: string[] = [];
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export function transactionLedgerDate(transaction: Transaction) {
  return transaction.reflectedDate || transaction.date;
}

export function calculateAccountBalance(account: Account, transactions: Transaction[], throughMonthKey?: string) {
  const rows = throughMonthKey ? transactions.filter((transaction) => transactionLedgerDate(transaction) <= monthEndKey(throughMonthKey)) : transactions;
  return rows.reduce((balance, transaction) => {
    if (transaction.type === "income" && transaction.accountId === account.id) return balance + transaction.amount;
    if (transaction.type === "expense" && transaction.accountId === account.id && account.type !== "credit") return balance - transaction.amount;
    if (transaction.type === "transfer" && transaction.transferDirection === "in") return transaction.accountId === account.id ? balance + transaction.amount : balance;
    if (transaction.type === "transfer" && transaction.accountId === account.id) return balance - transaction.amount;
    if (transaction.type === "transfer" && transaction.transferToAccountId === account.id) return balance + transaction.amount;
    return balance;
  }, account.openingBalance);
}

export function calculateAccountBalanceInState(account: Account, state: LedgerState, throughMonthKey?: string) {
  if (!throughMonthKey) {
    // 現在月のスナップショットは除外（現在月の取引が無視されるため）
    const currentMonth = todayIso().slice(0, 7);
    const snapshots = usableSnapshots(state)
      .filter((snapshot) => snapshot.accountId === account.id && snapshot.month < currentMonth)
      .sort((a, b) => b.month.localeCompare(a.month));
    const latestSnapshot = snapshots[0];
    const since = latestSnapshot ? monthEndKey(latestSnapshot.month) : "";
    const rows = state.transactions.filter((transaction) => !since || transactionLedgerDate(transaction) > since);
    return rows.reduce((balance, transaction) => {
      return balance + transactionAssetDeltaForAccount(transaction, account, state.accounts);
    }, latestSnapshot?.amount ?? account.openingBalance);
  }
  const snapshots = usableSnapshots(state)
    .filter((snapshot) => snapshot.accountId === account.id && snapshot.month < throughMonthKey)
    .sort((a, b) => b.month.localeCompare(a.month));
  const latestSnapshot = snapshots[0];
  const since = latestSnapshot ? monthEndKey(latestSnapshot.month) : "";
  const until = monthEndKey(throughMonthKey);
  const fixedOccurrences = monthsBetween(fixedCostStartExclusive(latestSnapshot?.month, throughMonthKey), throughMonthKey).flatMap((monthKey) => fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state, { carryOverdue: true }));
  const rows = state.transactions.filter((transaction) => {
    const ledgerDate = transactionLedgerDate(transaction);
    return (!since || ledgerDate > since) && ledgerDate <= until;
  });
  const transactionBalance = rows.reduce((balance, transaction) => {
    return balance + transactionAssetDeltaForAccount(transaction, account, state.accounts);
  }, latestSnapshot?.amount ?? account.openingBalance);
  return fixedOccurrences
    .filter((cost) => (!since || cost.date > since) && cost.date <= until)
    .reduce((balance, cost) => balance + fixedCostAssetDeltaForAccount(cost, account, state.accounts), transactionBalance);
}

export type BalanceBreakdownItem = { date: string; label: string; detail: string; amount: number; source: "transaction" | "fixed" };
export type BalanceBreakdown = {
  monthKey: string;
  baseLabel: string;
  baseAmount: number;
  earlierAmount: number;
  earlierCount: number;
  items: BalanceBreakdownItem[];
  total: number;
  confirmed: boolean;
};

// 口座の月末残高がどう計算されたかの内訳（confirmedAccountBalance と同じ計算）
export function accountBalanceBreakdown(account: Account, state: LedgerState, monthKey: string): BalanceBreakdown {
  const ownSnapshot = usableSnapshots(state).find((item) => item.accountId === account.id && item.month === monthKey);
  if (ownSnapshot) {
    return { monthKey, baseLabel: "この月の確定した月末資産", baseAmount: ownSnapshot.amount, earlierAmount: 0, earlierCount: 0, items: [], total: ownSnapshot.amount, confirmed: true };
  }
  const latestSnapshot = usableSnapshots(state)
    .filter((snapshot) => snapshot.accountId === account.id && snapshot.month < monthKey)
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  const since = latestSnapshot ? monthEndKey(latestSnapshot.month) : "";
  const until = monthEndKey(monthKey);
  const monthStart = `${monthKey}-01`;
  const accountName = (id?: string) => state.accounts.find((item) => item.id === id)?.name ?? "";
  const categoryName = (id?: string) => state.categories.find((item) => item.id === id)?.name ?? "";
  const items: BalanceBreakdownItem[] = [];
  let earlierAmount = 0;
  let earlierCount = 0;
  state.transactions.forEach((transaction) => {
    const ledgerDate = transactionLedgerDate(transaction);
    if ((since && ledgerDate <= since) || ledgerDate > until) return;
    const amount = transactionAssetDeltaForAccount(transaction, account, state.accounts);
    if (!amount) return;
    if (ledgerDate < monthStart) { earlierAmount += amount; earlierCount += 1; return; }
    const source = state.accounts.find((item) => item.id === transaction.accountId);
    items.push({
      date: ledgerDate,
      label: transaction.memo || categoryName(transaction.categoryId) || (transaction.type === "transfer" ? "振替" : transaction.type === "income" ? "収入" : "支出"),
      detail: source && source.id !== account.id ? `${source.name}の${source.type === "credit" ? "引落" : "振替"}` : transaction.type === "transfer" ? (transaction.transferDirection ? "資金移動" : `振替（${accountName(transaction.transferToAccountId) || "相手口座"}）`) : "取引",
      amount,
      source: "transaction"
    });
  });
  monthsBetween(fixedCostStartExclusive(latestSnapshot?.month, monthKey), monthKey)
    .flatMap((key) => fixedCostOccurrencesForMonth(state.fixedCosts, key, state, { carryOverdue: true }))
    .filter((cost) => (!since || cost.date > since) && cost.date <= until)
    .forEach((cost) => {
      const amount = fixedCostAssetDeltaForAccount(cost, account, state.accounts);
      if (!amount) return;
      if (cost.date < monthStart) { earlierAmount += amount; earlierCount += 1; return; }
      const source = state.accounts.find((item) => item.id === cost.accountId);
      items.push({
        date: cost.date,
        label: cost.name,
        detail: source && source.id !== account.id ? `定期・${source.name}${source.type === "credit" ? "の引落" : "から"}` : "定期",
        amount,
        source: "fixed"
      });
    });
  items.sort((a, b) => a.date.localeCompare(b.date));
  const baseAmount = latestSnapshot?.amount ?? account.openingBalance;
  const total = baseAmount + earlierAmount + items.reduce((sum, item) => sum + item.amount, 0);
  return {
    monthKey,
    baseLabel: latestSnapshot ? `${Number(latestSnapshot.month.slice(5, 7))}月末の確定した月末資産` : "初期残高",
    baseAmount,
    earlierAmount,
    earlierCount,
    items,
    total,
    confirmed: false
  };
}

// 指定日の終わり時点の残高（予定の定期項目も含む）。編集中の取引は excludeTransactionId で除外できる
export function accountBalanceOnDate(account: Account, state: LedgerState, date: string, excludeTransactionId?: string) {
  const monthKey = date.slice(0, 7);
  const snapshots = usableSnapshots(state)
    .filter((snapshot) => snapshot.accountId === account.id && snapshot.month < monthKey)
    .sort((a, b) => b.month.localeCompare(a.month));
  const latestSnapshot = snapshots[0];
  const since = latestSnapshot ? monthEndKey(latestSnapshot.month) : "";
  const transactionBalance = state.transactions
    .filter((transaction) => {
      if (transaction.id === excludeTransactionId) return false;
      const ledgerDate = transactionLedgerDate(transaction);
      return (!since || ledgerDate > since) && ledgerDate <= date;
    })
    .reduce((balance, transaction) => balance + transactionAssetDeltaForAccount(transaction, account, state.accounts), latestSnapshot?.amount ?? account.openingBalance);
  return monthsBetween(fixedCostStartExclusive(latestSnapshot?.month, monthKey), monthKey)
    .flatMap((key) => fixedCostOccurrencesForMonth(state.fixedCosts, key, state, { carryOverdue: true }))
    .filter((cost) => (!since || cost.date > since) && cost.date <= date)
    .reduce((balance, cost) => balance + fixedCostAssetDeltaForAccount(cost, account, state.accounts), transactionBalance);
}

export function confirmedAccountBalance(account: Account, state: LedgerState, monthKey: string) {
  const currentMonth = todayIso().slice(0, 7);
  if (monthKey >= currentMonth) {
    // ユーザーが当月（以降）の月末資産を確定している場合は、その確定額を最優先する。
    // 確定後にその月へ取引を追加しても確定額は固定され、翌月以降の基準となる。
    const currentSnapshot = usableSnapshots(state).find((item) => item.accountId === account.id && item.month === monthKey);
    if (currentSnapshot) return currentSnapshot.amount;
    return calculateAccountBalanceInState(account, state, monthKey);
  }
  const snapshot = usableSnapshots(state).find((item) => item.accountId === account.id && item.month === monthKey);
  return snapshot?.amount ?? calculateAccountBalanceInState(account, state, monthKey);
}

export function totalAssets(state: LedgerState, throughMonthKey?: string) {
  const cashAssets = state.accounts
    .filter((account) => account.type !== "credit")
    .reduce((total, account) => total + (throughMonthKey ? confirmedAccountBalance(account, state, throughMonthKey) : calculateAccountBalanceInState(account, state)), 0);
  return cashAssets + investmentAssets(state, throughMonthKey);
}

export function investmentAssets(state: LedgerState, throughMonthKey = todayIso().slice(0, 7)) {
  return (state.investmentAccounts ?? []).reduce((sum, account) => {
    const latest = (state.investmentRecords ?? [])
      .filter((record) => record.investmentAccountId === account.id && record.month <= throughMonthKey)
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    // レコードがあればstartMonthより前でも使用する
    if (latest) return sum + latest.monthEndValue;
    // レコードがない場合はstartMonth以降のみ初期金額を使用
    if (account.startMonth && throughMonthKey < account.startMonth) return sum;
    return sum + (account.initialAmount ?? 0);
  }, 0);
}

function transactionAssetDeltaForAccount(transaction: Transaction, account: Account, accounts: Account[]) {
  if (transaction.type === "income" && transaction.accountId === account.id) return transaction.amount;
  if (transaction.type === "expense") {
    const sourceAccount = accounts.find((item) => item.id === transaction.accountId);
    if (sourceAccount?.type === "credit") {
      // クレジット支出は引落口座から即時控除
      return sourceAccount.withdrawalAccountId === account.id ? -transaction.amount : 0;
    }
    return transaction.accountId === account.id && account.type !== "credit" ? -transaction.amount : 0;
  }
  if (transaction.type === "transfer" && transaction.transferDirection === "in") {
    // 別の家計簿から入ってきた資金移動
    return transaction.accountId === account.id ? transaction.amount : 0;
  }
  if (transaction.type === "transfer" && transaction.accountId === account.id) {
    // クレジットカードへの振替（カード支払い）は除外：クレジット費用は即時控除済みのため二重計上を防ぐ
    const toAccount = accounts.find((a) => a.id === transaction.transferToAccountId);
    if (toAccount?.type === "credit") return 0;
    return -transaction.amount;
  }
  if (transaction.type === "transfer" && transaction.transferToAccountId === account.id) return transaction.amount;
  return 0;
}

function fixedCostAssetDeltaForAccount(cost: FixedCostOccurrence, account: Account, accounts: Account[]) {
  const sourceAccount = accounts.find((item) => item.id === cost.accountId);
  if (cost.kind === "income") return cost.accountId === account.id ? cost.amount : 0;
  if (cost.kind === "transfer" && cost.transferDirection === "in") {
    // 別の家計簿から毎月入ってくる資金移動
    return cost.accountId === account.id ? cost.amount : 0;
  }
  if (cost.kind === "transfer") {
    if (cost.accountId === account.id) {
      // クレジットカードへの振替（カード支払い）は除外：クレジット費用は即時控除済みのため二重計上を防ぐ
      const toAccount = accounts.find((a) => a.id === cost.transferToAccountId);
      if (toAccount?.type === "credit") return 0;
      return -cost.amount;
    }
    if (cost.transferToAccountId === account.id) return cost.amount;
    return 0;
  }
  // クレジット固定費は引落口座から即時控除（transactionAssetDeltaForAccountと同じロジック）
  if (sourceAccount?.type === "credit") {
    return sourceAccount.withdrawalAccountId === account.id ? -cost.amount : 0;
  }
  return cost.accountId === account.id && account.type !== "credit" ? -cost.amount : 0;
}

function monthlyAssetMovement(state: LedgerState, monthKey: string) {
  const assetAccounts = state.accounts.filter((account) => account.type !== "credit");
  const transactionMovement = monthTransactionsByKey(state.transactions, monthKey).reduce((sum, transaction) => {
    return sum + assetAccounts.reduce((accountSum, account) => accountSum + transactionAssetDeltaForAccount(transaction, account, state.accounts), 0);
  }, 0);
  return fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state, { carryOverdue: true }).reduce((sum, cost) => {
    return sum + assetAccounts.reduce((accountSum, account) => accountSum + fixedCostAssetDeltaForAccount(cost, account, state.accounts), 0);
  }, transactionMovement);
}

export function monthTransactions(transactions: Transaction[], date = new Date()) {
  const key = monthKeyFromDate(date);
  return transactions.filter((transaction) => transactionLedgerDate(transaction).startsWith(key));
}

export function monthTransactionsByKey(transactions: Transaction[], monthKey: string) {
  return transactions.filter((transaction) => transactionLedgerDate(transaction).startsWith(monthKey));
}

export function monthlyExpense(transactions: Transaction[]) {
  return transactions.filter((transaction) => transaction.type === "expense").reduce((total, transaction) => total + transaction.amount, 0);
}

export function monthlyIncome(transactions: Transaction[]) {
  return transactions.filter((transaction) => transaction.type === "income").reduce((total, transaction) => total + transaction.amount, 0);
}

// occurrenceMonth: もともとの月（◯月分）。
// dueDate: 期日（「支払日を変える」で動かした日も含む）。paidOn: 実際に払った日。
// date: 残高で使う日付＝払っていれば払った日、まだなら期日。
// overdue: 税金・年金で期日を過ぎたのに「支払った」が押されていないもの
export type FixedCostOccurrence = FixedCost & { date: string; occurrenceMonth: string; dueDate: string; overrideId?: string; overrideMemo?: string; payDateMoved?: boolean; paidOn?: string; overdue?: boolean };

function isOverdueOccurrence(occurrence: FixedCostOccurrence, today: string) {
  return Boolean(occurrence.taxKind && !occurrence.paidOn && occurrence.amount > 0 && occurrence.dueDate < today);
}

// 期日を過ぎた未払いは、まだ口座から出ていないお金として「明日」に出ていく扱いにする
// （今日の残高からは引かず、これからの見込みでは必ず引く。月末日なら今日）
function overdueCarryDate(today: string) {
  const next = new Date(`${today}T00:00:00`);
  next.setDate(next.getDate() + 1);
  const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  return key.slice(0, 7) === today.slice(0, 7) ? key : today;
}

// options.carryOverdue: 残高の計算用。未払いをもとの日から外し、今月の「明日」にまとめて載せる
// options.byDueDate: 税金タブ用。払った日ではなく期日の月に並べる
export function fixedCostOccurrencesForMonth(fixedCosts: FixedCost[], monthKey: string, state?: Pick<LedgerState, "fixedCostOverrides">, options?: { carryOverdue?: boolean; byDueDate?: boolean }): FixedCostOccurrence[] {
  const today = todayIso();
  const raw = rawFixedCostOccurrencesForMonth(fixedCosts, monthKey, state, Boolean(options?.byDueDate)).map((occurrence) => (isOverdueOccurrence(occurrence, today) ? { ...occurrence, overdue: true } : occurrence));
  const currentMonth = today.slice(0, 7);
  if (!options?.carryOverdue || monthKey > currentMonth || !fixedCosts.some((cost) => cost.taxKind)) return raw;
  const rows = raw.filter((occurrence) => !occurrence.overdue);
  if (monthKey < currentMonth) return rows;
  // 今月：これまでの未払いをまとめて載せる
  const carry = overdueCarryDate(today);
  const overdue: FixedCostOccurrence[] = [];
  fixedCosts.filter((cost) => cost.taxKind).forEach((cost) => {
    const start = (cost.effectiveFrom ?? `${currentMonth}-01`).slice(0, 7);
    const end = cost.effectiveTo && cost.effectiveTo.slice(0, 7) < currentMonth ? cost.effectiveTo.slice(0, 7) : currentMonth;
    for (let month = start; month <= end; month = addMonths(month, 1)) {
      rawFixedCostOccurrencesForMonth([cost], month, state, false)
        .filter((occurrence) => isOverdueOccurrence(occurrence, today))
        .forEach((occurrence) => overdue.push({ ...occurrence, overdue: true, date: carry }));
    }
  });
  return [...overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), ...rows];
}

function addMonths(monthKey: string, diff: number) {
  const date = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1 + diff, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function defaultDueDate(month: string, dueDay: number) {
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return `${month}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`;
}

function rawFixedCostOccurrencesForMonth(fixedCosts: FixedCost[], monthKey: string, state: Pick<LedgerState, "fixedCostOverrides"> | undefined, byDueDate: boolean): FixedCostOccurrence[] {
  const build = (cost: FixedCost, month: string, override: NonNullable<LedgerState["fixedCostOverrides"]>[number] | undefined): FixedCostOccurrence => {
    const dueDay = override?.dueDay ?? cost.dueDay;
    const dueDate = override?.payDate ?? defaultDueDate(month, dueDay);
    const date = override?.paidOn ?? dueDate;
    return {
      ...cost,
      name: override?.name ?? cost.name,
      categoryId: override?.categoryId ?? cost.categoryId,
      accountId: override?.accountId ?? cost.accountId,
      transferToAccountId: override?.transferToAccountId ?? cost.transferToAccountId,
      amount: override?.amount ?? cost.amount,
      dueDay: override?.payDate ? Number(override.payDate.slice(8, 10)) : dueDay,
      overrideId: override?.id,
      // その月だけのメモがあればそれを、なければ定期項目のメモ
      memo: override?.memo || cost.memo,
      overrideMemo: override?.memo,
      occurrenceMonth: month,
      payDateMoved: (byDueDate ? dueDate : date).slice(0, 7) !== month,
      paidOn: override?.paidOn,
      dueDate,
      date
    };
  };
  // その分を並べる月（期日 or 払った日の月）
  const placeOf = (override: NonNullable<LedgerState["fixedCostOverrides"]>[number]) => (byDueDate ? override.payDate : override.paidOn ?? override.payDate);
  const rows: Array<FixedCostOccurrence | null> = fixedCosts
    .filter((cost) => isFixedCostActiveInMonth(cost, monthKey))
    .map((cost) => {
      const override = state?.fixedCostOverrides?.find((item) => item.fixedCostId === cost.id && item.month === monthKey);
      if (override?.skipped) return null;
      // 別の月に動いた分は、その月には出さない（動いた先の月に出す）
      const place = override ? placeOf(override) : undefined;
      if (place && place.slice(0, 7) !== monthKey) return null;
      return build(cost, monthKey, override);
    });
  // ほかの月の分で、この月に動いてきたもの（同じ定期項目のこの月の分の前に、古い月から順に並べる）
  const moved: FixedCostOccurrence[] = [];
  [...(state?.fixedCostOverrides ?? [])].sort((a, b) => a.month.localeCompare(b.month)).forEach((override) => {
    const place = placeOf(override);
    if (!place || override.skipped || override.month === monthKey || place.slice(0, 7) !== monthKey) return;
    const cost = fixedCosts.find((item) => item.id === override.fixedCostId);
    if (!cost || !isFixedCostActiveInMonth(cost, override.month)) return;
    moved.push(build(cost, override.month, override));
  });
  const result = rows.filter((cost): cost is FixedCostOccurrence => Boolean(cost));
  moved.forEach((item) => {
    const own = result.findIndex((row) => row.id === item.id && !row.payDateMoved && row.occurrenceMonth > item.occurrenceMonth);
    const lastSame = result.map((row) => row.id === item.id && row.payDateMoved).lastIndexOf(true);
    if (lastSame >= 0) result.splice(lastSame + 1, 0, item);
    else if (own >= 0) result.splice(own, 0, item);
    else result.push(item);
  });
  return result;
}

export function monthlyFixedCostExpense(state: LedgerState, date = new Date()) {
  const monthKey = monthKeyFromDate(date);
  return fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state).filter((cost) => cost.kind === "expense").reduce((total, cost) => total + cost.amount, 0);
}

export function monthlyExpenseWithFixed(state: LedgerState, date = new Date()) {
  return monthlyExpense(monthTransactions(state.transactions, date)) + monthlyFixedCostExpense(state, date);
}

export function monthlyExpenseWithFixedByKey(state: LedgerState, monthKey: string) {
  return monthlyExpense(monthTransactionsByKey(state.transactions, monthKey)) + fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state).filter((cost) => cost.kind === "expense").reduce((total, cost) => total + cost.amount, 0);
}

export function monthlyIncomeWithFixedByKey(state: LedgerState, monthKey: string) {
  return monthlyIncome(monthTransactionsByKey(state.transactions, monthKey)) + fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state).filter((cost) => cost.kind === "income").reduce((total, cost) => total + cost.amount, 0);
}

export function averageMonthlySaving(state: LedgerState) {
  const monthly = new Map<string, { income: number; expense: number; savingTransfer: number }>();
  state.transactions.forEach((transaction) => {
    const key = transactionLedgerDate(transaction).slice(0, 7);
    const current = monthly.get(key) ?? { income: 0, expense: 0, savingTransfer: 0 };
    if (transaction.type === "income") current.income += transaction.amount;
    if (transaction.type === "expense") current.expense += transaction.amount;
    if (transaction.type === "transfer" && state.accounts.find((account) => account.id === transaction.transferToAccountId)?.type === "saving") {
      current.savingTransfer += transaction.amount;
    }
    monthly.set(key, current);
  });
  state.fixedCosts.forEach((cost) => {
    const from = (cost.effectiveFrom ?? todayIso()).slice(0, 7);
    const to = (cost.effectiveTo ?? todayIso()).slice(0, 7);
    const months = Array.from(monthly.keys()).filter((key) => key >= from && key <= to);
    const targetMonths = months.length ? months : [from];
    targetMonths.forEach((key) => {
      if (!isFixedCostActiveInMonth(cost, key)) return;
      const current = monthly.get(key) ?? { income: 0, expense: 0, savingTransfer: 0 };
      if (cost.kind === "income") current.income += cost.amount;
      else if (cost.kind === "expense") current.expense += cost.amount;
      monthly.set(key, current);
    });
  });
  const values = Array.from(monthly.values()).map((item) => Math.max(item.savingTransfer || item.income - item.expense, 0)).filter((value) => value > 0);
  if (!values.length) return Math.max(monthlyIncome(monthTransactions(state.transactions)) - monthlyExpenseWithFixed(state), 0);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function pendingCreditWithdrawals(state: LedgerState) {
  const creditIds = new Set(state.accounts.filter((account) => account.type === "credit").map((account) => account.id));
  return state.transactions
    .filter((transaction) => transaction.type === "expense" && creditIds.has(transaction.accountId) && transaction.creditStatus !== "withdrawn")
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function monthlyCreditWithdrawals(state: LedgerState, date = new Date()) {
  const monthKey = monthKeyFromDate(date);
  return monthlyCreditWithdrawalsByKey(state, monthKey);
}

export function monthlyCreditWithdrawalsByKey(state: LedgerState, monthKey: string) {
  const creditIds = new Set(state.accounts.filter((account) => account.type === "credit").map((account) => account.id));
  const transactionTotal = state.transactions
    .filter((transaction) => (
      transaction.type === "expense" &&
      creditIds.has(transaction.accountId) &&
      transaction.creditStatus !== "withdrawn" &&
      transactionLedgerDate(transaction).startsWith(monthKey)
    ))
    .reduce((total, transaction) => total + transaction.amount, 0);
  const fixedTotal = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state)
    .filter((cost) => cost.kind === "expense" && creditIds.has(cost.accountId))
    .reduce((total, cost) => total + cost.amount, 0);
  return transactionTotal + fixedTotal;
}

export function fixedCostForecast(fixedCosts: FixedCost[], monthKey = todayIso().slice(0, 7)) {
  return fixedCosts.filter((cost) => isFixedCostActiveInMonth(cost, monthKey) && cost.kind === "expense").reduce((total, cost) => total + cost.amount, 0);
}

export function isFixedCostActiveInMonth(cost: FixedCost, monthKey: string) {
  const monthStart = `${monthKey}-01`;
  const monthEnd = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0);
  const monthEndKey = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
  const effectiveFrom = cost.effectiveFrom && cost.effectiveFrom.length === 7 ? `${cost.effectiveFrom}-01` : cost.effectiveFrom;
  const effectiveTo = cost.effectiveTo && cost.effectiveTo.length === 7
    ? `${cost.effectiveTo}-${String(new Date(Number(cost.effectiveTo.slice(0, 4)), Number(cost.effectiveTo.slice(5, 7)), 0).getDate()).padStart(2, "0")}`
    : cost.effectiveTo;
  return (!effectiveFrom || effectiveFrom <= monthEndKey) && (!effectiveTo || effectiveTo >= monthStart);
}

export function projectedMonthEnd(state: LedgerState, monthKey = todayIso().slice(0, 7)) {
  const baseMonth = previousMonthKey(monthKey);
  const baseAssets = totalAssets(state, baseMonth);
  return baseAssets + monthlyAssetMovement(state, monthKey);
}

export function categoryExpense(state: LedgerState, monthKey = todayIso().slice(0, 7)) {
  const month = monthTransactionsByKey(state.transactions, monthKey);
  const fixedCosts = fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state).filter((cost) => cost.kind === "expense");
  return state.categories
    .filter((category) => !category.parentId && category.kind === "expense")
    .map((category) => {
      const childIds = state.categories.filter((child) => child.parentId === category.id).map((child) => child.id);
      const ids = new Set([category.id, ...childIds]);
      const transactionValue = month
        .filter((transaction) => transaction.type === "expense" && transaction.categoryId && ids.has(transaction.categoryId))
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const fixedValue = fixedCosts
        .filter((cost) => ids.has(cost.categoryId))
        .reduce((sum, cost) => sum + cost.amount, 0);
      const value = transactionValue + fixedValue;
      return { name: category.name, value, fill: category.color };
    })
    .filter((item) => item.value > 0);
}

export function balanceTrend(state: LedgerState, endMonthKey = todayIso().slice(0, 7)) {
  const endMonth = monthKeyToDate(endMonthKey);
  const start = new Date(endMonth.getFullYear(), endMonth.getMonth() - 11, 1);
  const points: Array<{ label: string; actual?: number; forecast?: number }> = [];

  for (let index = 0; index < 12; index += 1) {
    const month = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    const value = totalAssets(state, key);
    points.push({ label: `${month.getMonth() + 1}月`, actual: value, forecast: value });
  }

  points.push({
    label: "予測",
    actual: undefined,
    forecast: projectedMonthEnd(state, endMonthKey)
  });
  return points;
}

export function goalProjection(goal: Goal, state: LedgerState) {
  const account = state.accounts.find((item) => item.id === goal.accountId);
  const current = account ? calculateAccountBalance(account, state.transactions) : 0;
  const remaining = Math.max(goal.targetAmount - current, 0);
  const monthlySaving = Math.max(averageMonthlySaving(state), 1);
  const months = Math.ceil(remaining / monthlySaving);
  const target = new Date();
  target.setMonth(target.getMonth() + months);
  return {
    current,
    remaining,
    progress: Math.min((current / goal.targetAmount) * 100, 100),
    months,
    projectedDate: `${target.getFullYear()}年${target.getMonth() + 1}月`
  };
}

export function spendingAdvice(state: LedgerState) {
  const categories = categoryExpense(state);
  const dining = categories.find((item) => item.name === "食費");
  if (!dining) {
    return "今月は大きな支出差がまだありません。固定費とクレカ引落を反映すると予測精度が上がります。";
  }
  const estimatedAverage = 42000;
  const diff = dining.value - estimatedAverage;
  if (diff > 0) {
    return `食費が平均より ${yen.format(diff)} 高めです。外食や買い足しを週1回減らすと、月末残高が約 ${yen.format(Math.round(diff * 0.6))} 改善しそうです。`;
  }
  return `食費は平均より ${yen.format(Math.abs(diff))} 抑えられています。このペースなら月末予測を少し上振れできそうです。`;
}
