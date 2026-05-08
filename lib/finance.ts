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
  planned: "予定",
  confirmed: "確定",
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
  return transactions.filter((transaction) => transaction.date.startsWith(key));
}

export function monthlyExpense(transactions: Transaction[]) {
  return transactions.filter((transaction) => transaction.type === "expense").reduce((total, transaction) => total + transaction.amount, 0);
}

export function monthlyIncome(transactions: Transaction[]) {
  return transactions.filter((transaction) => transaction.type === "income").reduce((total, transaction) => total + transaction.amount, 0);
}

export function pendingCreditWithdrawals(state: LedgerState) {
  const creditIds = new Set(state.accounts.filter((account) => account.type === "credit").map((account) => account.id));
  return state.transactions
    .filter((transaction) => transaction.type === "expense" && creditIds.has(transaction.accountId) && transaction.creditStatus !== "withdrawn")
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function fixedCostForecast(fixedCosts: FixedCost[]) {
  return fixedCosts.filter((cost) => cost.status !== "paid").reduce((total, cost) => total + cost.amount, 0);
}

export function projectedMonthEnd(state: LedgerState) {
  return totalAssets(state) - fixedCostForecast(state.fixedCosts) - pendingCreditWithdrawals(state);
}

export function categoryExpense(state: LedgerState) {
  const month = monthTransactions(state.transactions);
  return state.categories
    .filter((category) => !category.parentId)
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
  const base = totalAssets(state) - monthlyIncome(state.transactions) + monthlyExpense(state.transactions);
  const actualExpense = monthlyExpense(monthTransactions(state.transactions));
  const actualIncome = monthlyIncome(monthTransactions(state.transactions));
  const forecastOut = fixedCostForecast(state.fixedCosts) + pendingCreditWithdrawals(state);
  const points = [
    { label: "月初", actual: base, forecast: base },
    { label: "今日", actual: base + actualIncome - actualExpense, forecast: base + actualIncome - actualExpense },
    { label: "月末", actual: undefined, forecast: base + actualIncome - actualExpense - forecastOut }
  ];
  return points;
}

export function goalProjection(goal: Goal, state: LedgerState) {
  const account = state.accounts.find((item) => item.id === goal.accountId);
  const current = account ? calculateAccountBalance(account, state.transactions) : 0;
  const remaining = Math.max(goal.targetAmount - current, 0);
  const month = monthTransactions(state.transactions);
  const savingTransfers = month
    .filter((transaction) => transaction.type === "transfer" && transaction.transferToAccountId === goal.accountId)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthlySaving = Math.max(savingTransfers + goal.monthlyBoost, 1);
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
