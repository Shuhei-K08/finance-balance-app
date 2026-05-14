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

function monthEndKey(monthKey: string) {
  const end = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

function previousMonthKey(monthKey: string) {
  const date = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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
    if (transaction.type === "transfer" && transaction.accountId === account.id) return balance - transaction.amount;
    if (transaction.type === "transfer" && transaction.transferToAccountId === account.id) return balance + transaction.amount;
    return balance;
  }, account.openingBalance);
}

export function calculateAccountBalanceInState(account: Account, state: LedgerState, throughMonthKey?: string) {
  if (!throughMonthKey) return calculateAccountBalance(account, state.transactions);
  const snapshots = state.assetSnapshots
    .filter((snapshot) => snapshot.accountId === account.id && snapshot.month < throughMonthKey)
    .sort((a, b) => b.month.localeCompare(a.month));
  const latestSnapshot = snapshots[0];
  const since = latestSnapshot ? monthEndKey(latestSnapshot.month) : "";
  const until = monthEndKey(throughMonthKey);
  const fixedOccurrences = monthsBetween(latestSnapshot?.month ?? "", throughMonthKey).flatMap((monthKey) => fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state));
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

export function confirmedAccountBalance(account: Account, state: LedgerState, monthKey: string) {
  const currentMonth = todayIso().slice(0, 7);
  if (monthKey >= currentMonth) {
    const calculated = calculateAccountBalanceInState(account, state, monthKey);
    const hasEarlierSnapshot = state.assetSnapshots.some((item) => item.accountId === account.id && item.month < monthKey);
    const hasRows = state.transactions.some((transaction) => {
      const ledgerDate = transactionLedgerDate(transaction);
      return ledgerDate <= monthEndKey(monthKey) && (
        transaction.accountId === account.id ||
        transaction.transferToAccountId === account.id ||
        state.accounts.find((item) => item.id === transaction.accountId)?.withdrawalAccountId === account.id
      );
    });
    const currentSnapshot = state.assetSnapshots.find((item) => item.accountId === account.id && item.month === monthKey);
    if (currentSnapshot && calculated === 0 && !hasEarlierSnapshot && !hasRows && account.openingBalance === 0) return currentSnapshot.amount;
    return calculated;
  }
  const snapshot = state.assetSnapshots.find((item) => item.accountId === account.id && item.month === monthKey);
  return snapshot?.amount ?? calculateAccountBalanceInState(account, state, monthKey);
}

export function totalAssets(state: LedgerState, throughMonthKey?: string) {
  return state.accounts
    .filter((account) => account.type !== "credit")
    .reduce((total, account) => total + (throughMonthKey ? confirmedAccountBalance(account, state, throughMonthKey) : calculateAccountBalanceInState(account, state)), 0);
}

function transactionAssetDeltaForAccount(transaction: Transaction, account: Account, accounts: Account[]) {
  if (transaction.type === "income" && transaction.accountId === account.id) return transaction.amount;
  if (transaction.type === "expense") {
    const sourceAccount = accounts.find((item) => item.id === transaction.accountId);
    if (sourceAccount?.type === "credit") {
      return sourceAccount.withdrawalAccountId === account.id ? -transaction.amount : 0;
    }
    return transaction.accountId === account.id && account.type !== "credit" ? -transaction.amount : 0;
  }
  if (transaction.type === "transfer" && transaction.accountId === account.id) return -transaction.amount;
  if (transaction.type === "transfer" && transaction.transferToAccountId === account.id) return transaction.amount;
  return 0;
}

function fixedCostAssetDeltaForAccount(cost: FixedCostOccurrence, account: Account, accounts: Account[]) {
  const sourceAccount = accounts.find((item) => item.id === cost.accountId);
  if (cost.kind === "income") return cost.accountId === account.id ? cost.amount : 0;
  if (cost.kind === "transfer") {
    if (cost.accountId === account.id) return -cost.amount;
    if (cost.transferToAccountId === account.id) return cost.amount;
    return 0;
  }
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
  return fixedCostOccurrencesForMonth(state.fixedCosts, monthKey, state).reduce((sum, cost) => {
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

export type FixedCostOccurrence = FixedCost & { date: string; overrideId?: string };

export function fixedCostOccurrencesForMonth(fixedCosts: FixedCost[], monthKey: string, state?: Pick<LedgerState, "fixedCostOverrides">): FixedCostOccurrence[] {
  const lastDay = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  const rows: Array<FixedCostOccurrence | null> = fixedCosts
    .filter((cost) => isFixedCostActiveInMonth(cost, monthKey))
    .map((cost) => {
      const override = state?.fixedCostOverrides?.find((item) => item.fixedCostId === cost.id && item.month === monthKey);
      if (override?.skipped) return null;
      const dueDay = override?.dueDay ?? cost.dueDay;
      return {
        ...cost,
        name: override?.name ?? cost.name,
        categoryId: override?.categoryId ?? cost.categoryId,
        accountId: override?.accountId ?? cost.accountId,
        transferToAccountId: override?.transferToAccountId ?? cost.transferToAccountId,
        amount: override?.amount ?? cost.amount,
        dueDay,
        overrideId: override?.id,
        date: `${monthKey}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`
      };
    });
  return rows.filter((cost): cost is FixedCostOccurrence => Boolean(cost));
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
  const creditIds = new Set(state.accounts.filter((account) => account.type === "credit").map((account) => account.id));
  return state.transactions
    .filter((transaction) => (
      transaction.type === "expense" &&
      creditIds.has(transaction.accountId) &&
      transaction.creditStatus !== "withdrawn" &&
      transactionLedgerDate(transaction).startsWith(monthKey)
    ))
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function monthlyCreditWithdrawalsByKey(state: LedgerState, monthKey: string) {
  const creditIds = new Set(state.accounts.filter((account) => account.type === "credit").map((account) => account.id));
  return state.transactions
    .filter((transaction) => (
      transaction.type === "expense" &&
      creditIds.has(transaction.accountId) &&
      transaction.creditStatus !== "withdrawn" &&
      transactionLedgerDate(transaction).startsWith(monthKey)
    ))
    .reduce((total, transaction) => total + transaction.amount, 0);
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
