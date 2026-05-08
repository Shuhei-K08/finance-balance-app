"use client";

import { supabase } from "./supabase";
import { initialState } from "./sample-data";
import {
  Account,
  AccountType,
  Category,
  FixedCost,
  FixedCostStatus,
  Goal,
  HouseholdSummary,
  LedgerMode,
  LedgerState,
  SpaceType,
  Transaction,
  TransactionType
} from "./types";

type DbHousehold = {
  id: string;
  name: string;
  space_type: SpaceType;
  mode: LedgerMode;
  invite_code: string | null;
};

type DbHouseholdSummary = DbHousehold & {
  household_members?: { member_role: "owner" | "member" }[];
};

type DbProfile = {
  role: "user" | "admin";
};

type DbAccount = {
  id: string;
  name: string;
  account_type: AccountType;
  opening_balance: number | string;
  opening_balance_date: string | null;
  color: string | null;
  closing_day: number | null;
  withdrawal_day: number | null;
  withdrawal_account_id: string | null;
};

type DbCategory = {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
};

type DbTransaction = {
  id: string;
  transaction_type: TransactionType;
  amount: number | string;
  category_id: string | null;
  account_id: string;
  transfer_to_account_id: string | null;
  occurred_on: string;
  reflected_on: string | null;
  credit_status: Transaction["creditStatus"] | null;
  memo: string | null;
};

type DbFixedCost = {
  id: string;
  name: string;
  category_id: string;
  account_id: string;
  amount: number | string;
  is_variable: boolean;
  due_day: number;
  status: FixedCostStatus;
};

type DbGoal = {
  id: string;
  name: string;
  account_id: string;
  target_amount: number | string;
  deadline: string;
  monthly_boost: number | string | null;
};

function requireSupabase() {
  if (!supabase) throw new Error("Supabase environment variables are not configured.");
  return supabase;
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const client = requireSupabase();
  const { error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: typeof window === "undefined" ? undefined : window.location.origin
    }
  });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: typeof window === "undefined" ? undefined : window.location.origin
    }
  });
  if (error) throw error;
}

export async function signOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function claimFirstAdmin() {
  const client = requireSupabase();
  const { error } = await client.rpc("claim_first_admin");
  if (error) throw error;
}

export async function ensurePersonalLedger() {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) throw new Error("ログインが必要です。");

  const displayName = user.user_metadata?.display_name || user.email?.split("@")[0] || "ユーザー";
  const { error: profileError } = await client
    .from("profiles")
    .upsert({ id: user.id, display_name: displayName }, { onConflict: "id" });
  if (profileError) throw profileError;

  const { data: householdId, error: ledgerError } = await client.rpc("ensure_personal_ledger");
  if (ledgerError) throw ledgerError;
  return householdId as string;
}

export async function createSharedLedger(name: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_shared_ledger", { ledger_name: name || "共有家計簿" });
  if (error) throw new Error(`${error.message}${error.details ? ` / ${error.details}` : ""}${error.hint ? ` / ${error.hint}` : ""}`);
  return data as string;
}

export async function joinSharedLedger(inviteCode: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("join_shared_ledger", { code: inviteCode.trim().toUpperCase() });
  if (error) throw new Error(`${error.message}${error.details ? ` / ${error.details}` : ""}${error.hint ? ` / ${error.hint}` : ""}`);
  return data as string;
}

async function loadHouseholds(): Promise<HouseholdSummary[]> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("ログインが必要です。");

  const { data, error } = await client
    .from("households")
    .select("id,name,space_type,mode,invite_code,household_members!inner(member_role)")
    .eq("household_members.user_id", userId)
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as DbHouseholdSummary[]).map((household) => ({
    id: household.id,
    name: household.name,
    spaceType: household.space_type,
    mode: household.mode,
    inviteCode: household.invite_code ?? undefined,
    memberRole: household.household_members?.[0]?.member_role ?? "member"
  }));
}

export async function loadRemoteState(selectedHouseholdId?: string): Promise<LedgerState> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("ログインが必要です。");

  const personalHouseholdId = await ensurePersonalLedger();
  const households = await loadHouseholds();
  const householdId = households.some((household) => household.id === selectedHouseholdId)
    ? selectedHouseholdId!
    : personalHouseholdId;

  const [
    profileResult,
    householdResult,
    accountsResult,
    categoriesResult,
    transactionsResult,
    fixedCostsResult,
    goalsResult
  ] = await Promise.all([
    client.from("profiles").select("role").eq("id", userId).maybeSingle(),
    client.from("households").select("id,name,space_type,mode,invite_code").eq("id", householdId).is("deleted_at", null).maybeSingle(),
    client.from("accounts").select("id,name,account_type,opening_balance,opening_balance_date,color,closing_day,withdrawal_day,withdrawal_account_id").eq("household_id", householdId).is("deleted_at", null).order("created_at"),
    client.from("categories").select("id,name,parent_id,color").eq("household_id", householdId).is("deleted_at", null).order("created_at"),
    client.from("transactions").select("id,transaction_type,amount,category_id,account_id,transfer_to_account_id,occurred_on,reflected_on,credit_status,memo").eq("household_id", householdId).is("deleted_at", null).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
    client.from("fixed_costs").select("id,name,category_id,account_id,amount,is_variable,due_day,status").eq("household_id", householdId).is("deleted_at", null).order("due_day"),
    client.from("saving_goals").select("id,name,account_id,target_amount,deadline,monthly_boost").eq("household_id", householdId).is("deleted_at", null).order("created_at")
  ]);

  for (const result of [profileResult, householdResult, accountsResult, categoriesResult, transactionsResult, fixedCostsResult, goalsResult]) {
    if (result.error) throw result.error;
  }

  if (!householdResult.data) throw new Error("家計簿が見つかりません。ログアウトして再ログインしてください。");
  const household = householdResult.data as DbHousehold;
  return {
    householdId,
    householdName: household.name,
    inviteCode: household.invite_code ?? undefined,
    profileRole: (profileResult.data as DbProfile | null)?.role ?? "user",
    households,
    needsOpeningSetup: ((accountsResult.data ?? []) as DbAccount[]).some((account) => account.account_type !== "credit") &&
      ((accountsResult.data ?? []) as DbAccount[]).filter((account) => account.account_type !== "credit").every((account) => toNumber(account.opening_balance) === 0) &&
      ((transactionsResult.data ?? []) as DbTransaction[]).length === 0,
    activeSpace: household.space_type,
    mode: household.mode,
    accounts: ((accountsResult.data ?? []) as DbAccount[]).map((account): Account => ({
      id: account.id,
      name: account.name,
      type: account.account_type,
      openingBalance: toNumber(account.opening_balance),
      openingBalanceDate: account.opening_balance_date ?? undefined,
      color: account.color ?? "#0f766e",
      closingDay: account.closing_day ?? undefined,
      withdrawalDay: account.withdrawal_day ?? undefined,
      withdrawalAccountId: account.withdrawal_account_id ?? undefined
    })),
    categories: ((categoriesResult.data ?? []) as DbCategory[]).map((category): Category => ({
      id: category.id,
      name: category.name,
      parentId: category.parent_id ?? undefined,
      color: category.color
    })),
    transactions: ((transactionsResult.data ?? []) as DbTransaction[]).map((transaction): Transaction => ({
      id: transaction.id,
      type: transaction.transaction_type,
      amount: toNumber(transaction.amount),
      categoryId: transaction.category_id ?? undefined,
      accountId: transaction.account_id,
      transferToAccountId: transaction.transfer_to_account_id ?? undefined,
      date: transaction.occurred_on,
      reflectedDate: transaction.reflected_on ?? undefined,
      memo: transaction.memo ?? undefined,
      creditStatus: transaction.credit_status ?? undefined
    })),
    fixedCosts: ((fixedCostsResult.data ?? []) as DbFixedCost[]).map((cost): FixedCost => ({
      id: cost.id,
      name: cost.name,
      categoryId: cost.category_id,
      accountId: cost.account_id,
      amount: toNumber(cost.amount),
      variable: cost.is_variable,
      dueDay: cost.due_day,
      status: cost.status
    })),
    goals: ((goalsResult.data ?? []) as DbGoal[]).map((goal): Goal => ({
      id: goal.id,
      name: goal.name,
      accountId: goal.account_id,
      targetAmount: toNumber(goal.target_amount),
      deadline: goal.deadline,
      monthlyBoost: toNumber(goal.monthly_boost)
    }))
  };
}

export async function insertRemoteTransaction(householdId: string, transaction: Omit<Transaction, "id">) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("transactions")
    .insert({
      household_id: householdId,
      transaction_type: transaction.type,
      amount: transaction.amount,
      category_id: transaction.categoryId ?? null,
      account_id: transaction.accountId,
      transfer_to_account_id: transaction.transferToAccountId ?? null,
      occurred_on: transaction.date,
      reflected_on: transaction.reflectedDate ?? null,
      credit_status: transaction.creditStatus ?? null,
      memo: transaction.memo ?? null
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("取引IDを取得できませんでした。");
  return data.id as string;
}

export async function updateRemoteGoalBoost(goalId: string, monthlyBoost: number) {
  const client = requireSupabase();
  const { error } = await client.from("saving_goals").update({ monthly_boost: monthlyBoost }).eq("id", goalId);
  if (error) throw error;
}

export async function updateOpeningBalances(balances: Record<string, { amount: number; date: string }>) {
  const client = requireSupabase();
  await Promise.all(Object.entries(balances).map(async ([accountId, value]) => {
    const { error } = await client
      .from("accounts")
      .update({ opening_balance: value.amount, opening_balance_date: value.date || null })
      .eq("id", accountId);
    if (error) throw new Error(`${error.message}${error.details ? ` / ${error.details}` : ""}`);
  }));
}

export async function createAccount(householdId: string, input: { name: string; type: AccountType; openingBalance: number; openingBalanceDate: string }) {
  const client = requireSupabase();
  const { error } = await client.from("accounts").insert({
    household_id: householdId,
    name: input.name,
    account_type: input.type,
    opening_balance: input.openingBalance,
    opening_balance_date: input.openingBalanceDate || null,
    color: input.type === "saving" ? "#059669" : input.type === "cash" ? "#d97706" : input.type === "credit" ? "#7c3aed" : "#2563eb"
  });
  if (error) throw new Error(error.message);
}

export async function updateAccount(accountId: string, input: { name: string; openingBalance: number; openingBalanceDate: string }) {
  const client = requireSupabase();
  const { error } = await client.from("accounts").update({
    name: input.name,
    opening_balance: input.openingBalance,
    opening_balance_date: input.openingBalanceDate || null
  }).eq("id", accountId);
  if (error) throw new Error(error.message);
}

export async function deleteAccount(accountId: string) {
  const client = requireSupabase();
  const { error } = await client.from("accounts").update({ deleted_at: new Date().toISOString() }).eq("id", accountId);
  if (error) throw new Error(error.message);
}

export async function createCategory(householdId: string, input: { name: string; parentId?: string; color: string }) {
  const client = requireSupabase();
  const { error } = await client.from("categories").insert({
    household_id: householdId,
    name: input.name,
    parent_id: input.parentId || null,
    color: input.color || "#0f766e"
  });
  if (error) throw new Error(error.message);
}

export async function updateCategory(categoryId: string, input: { name: string; parentId?: string; color: string }) {
  const client = requireSupabase();
  const { error } = await client.from("categories").update({
    name: input.name,
    parent_id: input.parentId || null,
    color: input.color || "#0f766e"
  }).eq("id", categoryId);
  if (error) throw new Error(error.message);
}

export async function deleteCategory(categoryId: string) {
  const client = requireSupabase();
  const { error } = await client.from("categories").update({ deleted_at: new Date().toISOString() }).eq("id", categoryId);
  if (error) throw new Error(error.message);
}

export async function createFixedCost(householdId: string, input: Omit<FixedCost, "id">) {
  const client = requireSupabase();
  const { error } = await client.from("fixed_costs").insert({
    household_id: householdId,
    name: input.name,
    category_id: input.categoryId,
    account_id: input.accountId,
    amount: input.amount,
    is_variable: input.variable,
    due_day: input.dueDay,
    status: input.status
  });
  if (error) throw new Error(error.message);
}

export async function updateFixedCost(fixedCostId: string, input: Omit<FixedCost, "id">) {
  const client = requireSupabase();
  const { error } = await client.from("fixed_costs").update({
    name: input.name,
    category_id: input.categoryId,
    account_id: input.accountId,
    amount: input.amount,
    is_variable: input.variable,
    due_day: input.dueDay,
    status: input.status
  }).eq("id", fixedCostId);
  if (error) throw new Error(error.message);
}

export async function deleteFixedCost(fixedCostId: string) {
  const client = requireSupabase();
  const { error } = await client.from("fixed_costs").update({ deleted_at: new Date().toISOString() }).eq("id", fixedCostId);
  if (error) throw new Error(error.message);
}

export async function updateTransaction(transactionId: string, transaction: Omit<Transaction, "id">) {
  const client = requireSupabase();
  const { error } = await client.from("transactions").update({
    transaction_type: transaction.type,
    amount: transaction.amount,
    category_id: transaction.categoryId || null,
    account_id: transaction.accountId,
    transfer_to_account_id: transaction.transferToAccountId || null,
    occurred_on: transaction.date,
    reflected_on: transaction.reflectedDate || null,
    credit_status: transaction.creditStatus || null,
    memo: transaction.memo || null
  }).eq("id", transactionId);
  if (error) throw new Error(error.message);
}

export async function deleteTransaction(transactionId: string) {
  const client = requireSupabase();
  const { error } = await client.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", transactionId);
  if (error) throw new Error(error.message);
}

export async function updateRemoteHouseholdSpace(householdId: string, activeSpace: SpaceType) {
  const client = requireSupabase();
  const { error } = await client.from("households").update({ space_type: activeSpace }).eq("id", householdId);
  if (error) throw error;
}
