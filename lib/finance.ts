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

export function transactionLedgerDate(transaction: Transaction) {
  return transaction.reflectedDate || transaction.date;
}

export function calculateAccountBalance(account: Account, transactions: Transaction[]) {
  return transactions.reduce((balance, transaction) => {
    if (transaction.type === "income" && transaction.accountId === account.id) return balance + transaction.amount;
    if (transaction.type === "expense" && transaction.accountId === account.id && account.type !== "credit") return balance - transaction.amount;
    if (transaction.type === "transfer" && transaction.accountId === account.id) return balance - transaction.amount;
    if (transaction.type === "transfer" && transaction.transferToAccountId === account.id) return balance + transaction.amount;
    return balance;
  }, account.openingBalance);
}

export function totalAssets(state: LedgerState) {
  return state.accounts
    .filter((account) => account.type !== "credit")
    .reduce((total, account) => total + calculateAccountBalance(account, state.transactions), 0);
}

export function monthTransactions(transactions: Transaction[], date = new Date()) {
  const key = date.toISOString().slice(0, 7);
  return transactions.filter((transaction) => transactionLedgerDate(transaction).startsWith(key));
}

export function monthlyExpense(transactions: Transaction[]) {
  return transactions.filter((transaction) => transaction.type === "expense").reduce((total, transaction) => total + transaction.amount, 0);
}

export function monthlyIncome(transactions: Transaction[]) {
  return transactions.filter((transaction) => transaction.type === "income").reduce((total, transaction) => total + transaction.amount, 0);
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
  const values = Array.from(monthly.values()).map((item) => Math.max(item.savingTransfer || item.income - item.expense, 0)).filter((value) => value > 0);
  if (!values.length) return Math.max(monthlyIncome(monthTransactions(state.transactions)) - monthlyExpense(monthTransactions(state.transactions)), 0);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function pendingCreditWithdrawals(state: LedgerState) {
  const creditIds = new Set(state.accounts.filter((account) => account.type === "credit").map((account) => account.id));
  return state.transactions
    .filter((transaction) => transaction.type === "expense" && creditIds.has(transaction.accountId) && transaction.creditStatus !== "withdrawn")
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function monthlyCreditWithdrawals(state: LedgerState, date = new Date()) {
  const monthKey = date.toISOString().slice(0, 7);
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

export function fixedCostForecast(fixedCosts: FixedCost[]) {
  const monthKey = todayIso().slice(0, 7);
  return fixedCosts.filter((cost) => isFixedCostActiveInMonth(cost, monthKey)).reduce((total, cost) => total + cost.amount, 0);
}

export function isFixedCostActiveInMonth(cost: FixedCost, monthKey: string) {
  const monthStart = `${monthKey}-01`;
  const monthEnd = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0);
  const monthEndKey = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
  return (!cost.effectiveFrom || cost.effectiveFrom <= monthEndKey) && (!cost.effectiveTo || cost.effectiveTo >= monthStart);
}

export function projectedMonthEnd(state: LedgerState) {
  return totalAssets(state) - fixedCostForecast(state.fixedCosts) - monthlyCreditWithdrawals(state);
}

export function categoryExpense(state: LedgerState) {
  const month = monthTransactions(state.transactions);
  return state.categories
    .filter((category) => !category.parentId && category.kind === "expense")
    .map((category) => {
      const childIds = state.categories.filter((child) => child.parentId === category.id).map((child) => child.id);
      const ids = new Set([category.id, ...childIds]);
      const value = month
        .filter((transaction) => transaction.type === "expense" && transaction.categoryId && ids.has(transaction.categoryId))
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      return { name: category.name, value, fill: category.color };
    })
    .filter((item) => item.value > 0);
}

export function balanceTrend(state: LedgerState) {
  const assetAccounts = state.accounts.filter((account) => account.type !== "credit");
  const base = assetAccounts.reduce((sum, account) => sum + account.openingBalance, 0);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const points: Array<{ label: string; actual?: number; forecast?: number }> = [];

  for (let index = 0; index < 12; index += 1) {
    const month = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const monthEndKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const value = state.transactions
      .filter((transaction) => transactionLedgerDate(transaction) < monthEndKey)
      .reduce((balance, transaction) => {
        if (transaction.type === "income" && assetAccounts.some((account) => account.id === transaction.accountId)) return balance + transaction.amount;
        if (transaction.type === "expense" && assetAccounts.some((account) => account.id === transaction.accountId)) return balance - transaction.amount;
        if (transaction.type === "transfer") {
          const fromAsset = assetAccounts.some((account) => account.id === transaction.accountId);
          const toAsset = assetAccounts.some((account) => account.id === transaction.transferToAccountId);
          if (fromAsset && !toAsset) return balance - transaction.amount;
          if (!fromAsset && toAsset) return balance + transaction.amount;
        }
        return balance;
      }, base);
    points.push({ label: `${month.getMonth() + 1}月`, actual: value, forecast: value });
  }

  points.push({
    label: "予測",
    actual: undefined,
    forecast: projectedMonthEnd(state)
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
