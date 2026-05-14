"use client";

import { supabase } from "./supabase";
import { initialState } from "./sample-data";
import {
  Account,
  AccountType,
  AdminDashboard,
  AssetSnapshot,
  Category,
  FixedCost,
  FixedCostOverride,
  FixedCostStatus,
  Goal,
  HouseholdMember,
  HouseholdSummary,
  LedgerMode,
  LedgerState,
  SpaceType,
  Transaction,
  TransactionType
} from "./types";

const errorTranslations: Array<[RegExp, string]> = [
  [/Invalid login credentials/i, "メールアドレスまたはパスワードが正しくありません。"],
  [/Email not confirmed/i, "メール確認が完了していません。受信メールの確認リンクを開いてください。"],
  [/User already registered/i, "このメールアドレスはすでに登録されています。ログインしてください。"],
  [/Password should be at least/i, "パスワードは8文字以上で入力してください。"],
  [/Supabase environment variables are not configured/i, "Supabase の接続情報が設定されていません。"],
  [/new row violates row-level security policy/i, "データベースの権限設定により保存できませんでした。Supabase SQL Editor で最新の schema.sql を実行してください。"],
  [/row-level security policy/i, "データベースの権限設定により操作できませんでした。Supabase のRLS設定を確認してください。"],
  [/Cannot coerce the result to a single JSON object/i, "データ取得結果の形式が想定と異なります。最新の schema.sql を実行してください。"],
  [/column .* does not exist/i, "データベースに必要な列がありません。最新の schema.sql を実行してください。"],
  [/relation .* does not exist/i, "データベースに必要なテーブルがありません。最新の schema.sql を実行してください。"],
  [/function .* does not exist/i, "データベースに必要な関数がありません。最新の schema.sql を実行してください。"],
  [/missing FROM-clause entry/i, "データベース関数の内容が古い可能性があります。最新の schema.sql を実行してください。"],
  [/duplicate key value violates unique constraint/i, "同じデータがすでに登録されています。"],
  [/violates foreign key constraint/i, "関連するデータが見つからないため保存できませんでした。画面を再読み込みしてください。"],
  [/login required/i, "ログインが必要です。"],
  [/admin already exists/i, "管理者はすでに設定されています。"],
  [/not allowed as admin/i, "このメールアドレスは管理者として許可されていません。"],
  [/共有家計簿が見つかりません/i, "共有家計簿が見つかりません。共有IDを確認してください。"],
  [/Failed to fetch/i, "Supabase に接続できませんでした。URL、anon key、ネットワーク接続を確認してください。"]
];

export function toJapaneseError(error: unknown, fallback = "処理に失敗しました。") {
  const raw = extractErrorText(error, fallback);
  const message = raw.trim();
  const matched = errorTranslations.find(([pattern]) => pattern.test(message));
  if (matched) return matched[1];
  if (/^[\x00-\x7F\s:;,.!?"'`()/_-]+$/.test(message)) return `${fallback}（詳細: ${message}）`;
  return message || fallback;
}

export function extractErrorText(error: unknown, fallback = "処理に失敗しました。") {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [
      record.code ? `code=${String(record.code)}` : "",
      record.message ? `message=${String(record.message)}` : "",
      record.details ? `details=${String(record.details)}` : "",
      record.hint ? `hint=${String(record.hint)}` : ""
    ].filter(Boolean).join(" / ") || JSON.stringify(record);
  }
  return fallback;
}

function throwJapanese(error: unknown, fallback?: string): never {
  throw new Error(toJapaneseError(error, fallback));
}

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

type DbHouseholdMember = {
  user_id: string;
  member_role: "owner" | "member";
  profiles?: { display_name: string | null } | { display_name: string | null }[] | null;
};

type DbHouseholdMemberRpc = {
  user_id: string;
  display_name: string | null;
  member_role: "owner" | "member";
};

type DbProfile = {
  role: "user" | "admin";
  deleted_at: string | null;
};

type DbAdminProfile = DbProfile & {
  id: string;
  display_name: string | null;
  deleted_at: string | null;
  created_at: string | null;
};

type DbAdminHousehold = {
  id: string;
  name: string;
  space_type: SpaceType;
  deleted_at: string | null;
  created_at: string | null;
};

type DbAdminHouseholdMember = {
  household_id: string;
  user_id: string;
  member_role: "owner" | "member";
  profiles?: { display_name: string | null } | { display_name: string | null }[] | null;
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
  category_kind: "expense" | "income" | null;
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
  idempotency_key?: string | null;
};

type DbFixedCost = {
  id: string;
  name: string;
  fixed_type: Transaction["type"] | null;
  category_id: string | null;
  account_id: string;
  transfer_to_account_id?: string | null;
  amount: number | string;
  is_variable: boolean;
  due_day: number;
  status: FixedCostStatus;
  effective_from: string | null;
  effective_to: string | null;
};

type DbFixedCostOverride = {
  id: string;
  fixed_cost_id: string;
  target_month: string;
  name: string | null;
  category_id: string | null;
  account_id: string | null;
  transfer_to_account_id?: string | null;
  amount: number | string | null;
  due_day: number | null;
  skipped: boolean | null;
};

type DbGoal = {
  id: string;
  name: string;
  account_id: string;
  target_amount: number | string;
  deadline: string;
  monthly_boost: number | string | null;
};

type DbAssetSnapshot = {
  id: string;
  account_id: string;
  snapshot_month: string;
  amount: number | string;
};

function requireSupabase() {
  if (!supabase) throw new Error("Supabase の接続情報が設定されていません。");
  return supabase;
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const parsed = Number.parseInt(value, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function subcategoryColor(parentColor: string, index: number) {
  const base = hexToRgb(parentColor || "#0f766e");
  const mix = Math.min(0.24 + index * 0.12, 0.76);
  return rgbToHex({
    r: base.r + (255 - base.r) * mix,
    g: base.g + (255 - base.g) * mix,
    b: base.b + (255 - base.b) * mix
  });
}

function calculateWithdrawalDate(account: DbAccount, occurredOn: string) {
  const closingDay = account.closing_day ?? 25;
  const withdrawalDay = account.withdrawal_day ?? 10;
  const usedAt = new Date(`${occurredOn}T00:00:00`);
  const monthsToAdd = usedAt.getDate() <= closingDay ? 1 : 2;
  const targetMonth = new Date(usedAt.getFullYear(), usedAt.getMonth() + monthsToAdd, 1);
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
  const target = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(withdrawalDay, lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

function appRedirectOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window === "undefined") return undefined;
  if (window.location.hostname === "localhost" && window.location.port === "3000") {
    return "https://finance-balance-app-mocha.vercel.app";
  }
  return window.location.origin;
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throwJapanese(error, "ログインに失敗しました。");
}

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const client = requireSupabase();
  const { error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: appRedirectOrigin()
    }
  });
  if (error) throwJapanese(error, "アカウント作成に失敗しました。");
}

export async function signInWithGoogle() {
  const client = requireSupabase();
  const redirectTo = appRedirectOrigin();
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "select_account"
      }
    }
  });
  if (error) throwJapanese(error, "Googleログインに失敗しました。");
}

export async function signOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throwJapanese(error, "ログアウトに失敗しました。");
}

export async function claimFirstAdmin() {
  const client = requireSupabase();
  const { error } = await client.rpc("claim_configured_admin");
  if (error) throwJapanese(error, "管理者設定に失敗しました。");
}

export async function ensurePersonalLedger() {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throwJapanese(userError, "ユーザー情報の取得に失敗しました。");
  const user = userData.user;
  if (!user) throw new Error("ログインが必要です。");

  const displayName = user.user_metadata?.display_name || user.email?.split("@")[0] || "ユーザー";
  const { error: profileError } = await client
    .from("profiles")
    .upsert({ id: user.id, display_name: displayName }, { onConflict: "id" });
  if (profileError) throwJapanese(profileError, "プロフィール作成に失敗しました。");
  const { data: profile, error: profileReadError } = await client
    .from("profiles")
    .select("deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileReadError) throwJapanese(profileReadError, "プロフィール確認に失敗しました。");
  if ((profile as { deleted_at?: string | null } | null)?.deleted_at) throw new Error("このアカウントは停止されています。管理者に確認してください。");

  const { data: householdId, error: ledgerError } = await client.rpc("ensure_personal_ledger");
  if (ledgerError) throwJapanese(ledgerError, "個人家計簿の初期作成に失敗しました。");
  return householdId as string;
}

export async function createSharedLedger(name: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_shared_ledger", { ledger_name: name || "共有家計簿" });
  if (error) throwJapanese(error, "共有家計簿の作成に失敗しました。");
  return data as string;
}

export async function joinSharedLedger(inviteCode: string) {
  const client = requireSupabase();
  const normalizedCode = inviteCode
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  if (!normalizedCode) throw new Error("招待コードを入力してください。");
  const { data, error } = await client.rpc("join_shared_ledger", { code: normalizedCode });
  if (error) {
    console.error("join_shared_ledger failed", { normalizedCode, error });
    throw new Error(extractErrorText(error, "共有家計簿への参加に失敗しました。"));
  }
  return data as string;
}

export async function loadHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  const client = requireSupabase();
  const { data: rpcData, error: rpcError } = await client.rpc("get_household_members", { target_household_id: householdId });
  if (!rpcError) {
    return ((rpcData ?? []) as DbHouseholdMemberRpc[]).map((member) => ({
      userId: member.user_id,
      displayName: member.display_name || `ユーザー ${member.user_id.slice(0, 8)}`,
      memberRole: member.member_role
    }));
  }
  const { data, error } = await client
    .from("household_members")
    .select("user_id,member_role,profiles(display_name)")
    .eq("household_id", householdId)
    .order("created_at");
  if (error) throwJapanese(error, "共有メンバーの取得に失敗しました。");
  return ((data ?? []) as unknown as DbHouseholdMember[]).map((member) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    return {
    userId: member.user_id,
    displayName: profile?.display_name || `ユーザー ${member.user_id.slice(0, 8)}`,
    memberRole: member.member_role
    };
  });
}

export async function renameSharedLedger(householdId: string, name: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("rename_shared_ledger", { target_household_id: householdId, new_name: name });
  if (error) throwJapanese(error, "家計簿名の変更に失敗しました。");
}

export async function deleteOwnedLedger(householdId: string) {
  const client = requireSupabase();
  const deletedAt = new Date().toISOString();
  const { error } = await client.from("households").update({ deleted_at: deletedAt }).eq("id", householdId);
  if (error) throwJapanese(error, "家計簿の削除に失敗しました。");
  await Promise.all([
    client.from("accounts").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("categories").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("transactions").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("fixed_costs").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("fixed_cost_overrides").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("saving_goals").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("monthly_asset_snapshots").update({ deleted_at: deletedAt }).eq("household_id", householdId)
  ]);
}

export async function removeSharedLedgerMember(householdId: string, userId: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("remove_shared_ledger_member", {
    target_household_id: householdId,
    target_user_id: userId
  });
  if (error) throwJapanese(error, "共有メンバーの脱退処理に失敗しました。");
}

export async function leaveSharedLedger(householdId: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("leave_shared_ledger", { target_household_id: householdId });
  if (error) throwJapanese(error, "共有家計簿からの脱退に失敗しました。");
}

export async function deleteSharedLedger(householdId: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("delete_shared_ledger", { target_household_id: householdId });
  if (!error) return;

  const deletedAt = new Date().toISOString();
  const { error: householdError } = await client
    .from("households")
    .update({ deleted_at: deletedAt })
    .eq("id", householdId)
    .eq("space_type", "shared");
  if (householdError) throwJapanese(householdError, "共有家計簿の削除に失敗しました。");

  await Promise.all([
    client.from("accounts").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("categories").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("transactions").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("fixed_costs").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("fixed_cost_overrides").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("saving_goals").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("monthly_asset_snapshots").update({ deleted_at: deletedAt }).eq("household_id", householdId)
  ]);
}

export async function adminDeleteHousehold(householdId: string) {
  const client = requireSupabase();
  const deletedAt = new Date().toISOString();
  const { error } = await client.from("households").update({ deleted_at: deletedAt }).eq("id", householdId);
  if (error) throwJapanese(error, "家計簿の削除に失敗しました。");
  await Promise.all([
    client.from("accounts").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("categories").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("transactions").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("fixed_costs").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("fixed_cost_overrides").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("saving_goals").update({ deleted_at: deletedAt }).eq("household_id", householdId),
    client.from("monthly_asset_snapshots").update({ deleted_at: deletedAt }).eq("household_id", householdId)
  ]);
}

export async function adminSuspendUser(userId: string) {
  const client = requireSupabase();
  const { data: current } = await client.auth.getUser();
  if (current.user?.id === userId) throw new Error("自分自身のアカウントは停止できません。");
  const { error } = await client.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", userId);
  if (error) throwJapanese(error, "アカウント停止に失敗しました。");
}

export async function adminResumeUser(userId: string) {
  const client = requireSupabase();
  const { error } = await client.from("profiles").update({ deleted_at: null }).eq("id", userId);
  if (error) throwJapanese(error, "アカウント再開に失敗しました。");
}

export async function adminDeleteUser(userId: string) {
  const client = requireSupabase();
  const { data: current } = await client.auth.getUser();
  if (current.user?.id === userId) throw new Error("自分自身のアカウントは削除できません。");
  const deletedAt = new Date().toISOString();
  const { error } = await client.from("profiles").update({ deleted_at: deletedAt }).eq("id", userId);
  if (error) throwJapanese(error, "アカウント削除に失敗しました。");

  const { data: ownedHouseholds, error: householdError } = await client
    .from("households")
    .select("id")
    .eq("owner_id", userId)
    .is("deleted_at", null);
  if (householdError) throwJapanese(householdError, "ユーザーの家計簿取得に失敗しました。");
  await Promise.all(((ownedHouseholds ?? []) as Array<{ id: string }>).map((household) => adminDeleteHousehold(household.id)));
}

export async function loadAdminDashboard(): Promise<AdminDashboard> {
  const client = requireSupabase();
  const [profilesResult, householdsResult, membersResult] = await Promise.all([
    client.from("profiles").select("id,display_name,role,deleted_at,created_at").order("created_at", { ascending: false }),
    client.from("households").select("id,name,space_type,deleted_at,created_at").order("created_at", { ascending: false }),
    client.from("household_members").select("household_id,user_id,member_role,profiles(display_name)")
  ]);
  if (profilesResult.error) throwJapanese(profilesResult.error, "ユーザー一覧の取得に失敗しました。");
  if (householdsResult.error) throwJapanese(householdsResult.error, "家計簿一覧の取得に失敗しました。");
  if (membersResult.error) throwJapanese(membersResult.error, "家計簿メンバー一覧の取得に失敗しました。");
  const membersByHousehold = new Map<string, AdminDashboard["households"][number]["members"]>();
  ((membersResult.data ?? []) as DbAdminHouseholdMember[]).forEach((member) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    const members = membersByHousehold.get(member.household_id) ?? [];
    members.push({
      userId: member.user_id,
      displayName: profile?.display_name || `ユーザー ${member.user_id.slice(0, 8)}`,
      memberRole: member.member_role
    });
    membersByHousehold.set(member.household_id, members);
  });
  const householdRows = (householdsResult.data ?? []) as DbAdminHousehold[];
  const householdsByUser = new Map<string, AdminDashboard["users"][number]["households"]>();
  ((membersResult.data ?? []) as DbAdminHouseholdMember[]).forEach((member) => {
    const household = householdRows.find((item) => item.id === member.household_id);
    if (!household) return;
    const households = householdsByUser.get(member.user_id) ?? [];
    households.push({
      id: household.id,
      name: household.name,
      spaceType: household.space_type,
      memberRole: member.member_role,
      deletedAt: household.deleted_at ?? undefined
    });
    householdsByUser.set(member.user_id, households);
  });
  return {
    users: ((profilesResult.data ?? []) as DbAdminProfile[]).map((profile) => ({
      id: profile.id,
      displayName: profile.display_name || `ユーザー ${profile.id.slice(0, 8)}`,
      role: profile.role,
      createdAt: profile.created_at ?? undefined,
      deletedAt: profile.deleted_at ?? undefined,
      households: householdsByUser.get(profile.id) ?? []
    })),
    households: householdRows.map((household) => ({
      id: household.id,
      name: household.name,
      spaceType: household.space_type,
      createdAt: household.created_at ?? undefined,
      deletedAt: household.deleted_at ?? undefined,
      members: membersByHousehold.get(household.id) ?? []
    }))
  };
}

async function loadHouseholds(): Promise<HouseholdSummary[]> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throwJapanese(userError, "ユーザー情報の取得に失敗しました。");
  const userId = userData.user?.id;
  if (!userId) throw new Error("ログインが必要です。");

  const { data, error } = await client
    .from("households")
    .select("id,name,space_type,mode,invite_code,household_members!inner(member_role)")
    .eq("household_members.user_id", userId)
    .is("deleted_at", null)
    .order("created_at");
  if (error) throwJapanese(error, "家計簿一覧の取得に失敗しました。");
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
  if (userError) throwJapanese(userError, "ユーザー情報の取得に失敗しました。");
  const userId = userData.user?.id;
  if (!userId) throw new Error("ログインが必要です。");

  const personalHouseholdId = await ensurePersonalLedger();
  const households = await loadHouseholds();
  const personalId = households.find((household) => household.spaceType === "personal")?.id ?? personalHouseholdId;
  const householdId = households.some((household) => household.id === selectedHouseholdId)
    ? selectedHouseholdId!
    : personalId;

  const [
    profileResult,
    householdResult,
    accountsResult,
    categoriesResult,
    transactionsResult,
    fixedCostsResult,
    fixedCostOverridesResult,
    goalsResult,
    assetSnapshotsResult
  ] = await Promise.all([
    client.from("profiles").select("role,deleted_at").eq("id", userId).maybeSingle(),
    client.from("households").select("id,name,space_type,mode,invite_code").eq("id", householdId).is("deleted_at", null).maybeSingle(),
    client.from("accounts").select("id,name,account_type,opening_balance,opening_balance_date,color,closing_day,withdrawal_day,withdrawal_account_id").eq("household_id", householdId).is("deleted_at", null).order("created_at"),
    client.from("categories").select("id,name,parent_id,category_kind,color").eq("household_id", householdId).is("deleted_at", null).order("created_at"),
    client.from("transactions").select("id,transaction_type,amount,category_id,account_id,transfer_to_account_id,occurred_on,reflected_on,credit_status,memo,idempotency_key").eq("household_id", householdId).is("deleted_at", null).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
    client.from("fixed_costs").select("id,name,fixed_type,category_id,account_id,transfer_to_account_id,amount,is_variable,due_day,status,effective_from,effective_to").eq("household_id", householdId).is("deleted_at", null).order("due_day"),
    client.from("fixed_cost_overrides").select("id,fixed_cost_id,target_month,name,category_id,account_id,transfer_to_account_id,amount,due_day,skipped").eq("household_id", householdId).is("deleted_at", null).order("target_month", { ascending: false }),
    client.from("saving_goals").select("id,name,account_id,target_amount,deadline,monthly_boost").eq("household_id", householdId).is("deleted_at", null).order("created_at"),
    client.from("monthly_asset_snapshots").select("id,account_id,snapshot_month,amount").eq("household_id", householdId).is("deleted_at", null).order("snapshot_month", { ascending: false })
  ]);

  const assetSnapshotTableMissing = assetSnapshotsResult.error && /monthly_asset_snapshots|does not exist|存在しません/i.test(assetSnapshotsResult.error.message);
  const fixedCostOverridesMissing = fixedCostOverridesResult.error && /fixed_cost_overrides|does not exist|存在しません/i.test(fixedCostOverridesResult.error.message);
  let fixedCostOverridesData: unknown = fixedCostOverridesResult.data;
  let fixedCostOverridesError = fixedCostOverridesResult.error;
  if (fixedCostOverridesError && /transfer_to_account_id|does not exist|存在しません/i.test(fixedCostOverridesError.message)) {
    const fallback = await client
      .from("fixed_cost_overrides")
      .select("id,fixed_cost_id,target_month,name,category_id,account_id,amount,due_day,skipped")
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("target_month", { ascending: false });
    fixedCostOverridesData = fallback.data;
    fixedCostOverridesError = fallback.error;
  }
  let transactionsData: unknown = transactionsResult.data;
  let transactionsError = transactionsResult.error;
  if (transactionsError && /idempotency_key|does not exist|存在しません/i.test(transactionsError.message)) {
    const fallback = await client
      .from("transactions")
      .select("id,transaction_type,amount,category_id,account_id,transfer_to_account_id,occurred_on,reflected_on,credit_status,memo")
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });
    transactionsData = fallback.data;
    transactionsError = fallback.error;
  }
  let fixedCostsData: unknown = fixedCostsResult.data;
  let fixedCostsError = fixedCostsResult.error;
  if (fixedCostsError && /fixed_type|transfer_to_account_id|does not exist|存在しません/i.test(fixedCostsError.message)) {
    const fallback = await client
      .from("fixed_costs")
      .select("id,name,category_id,account_id,amount,is_variable,due_day,status,effective_from,effective_to")
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("due_day");
    fixedCostsData = fallback.data;
    fixedCostsError = fallback.error;
  }
  for (const result of [profileResult, householdResult, accountsResult, categoriesResult, { error: transactionsError }, { error: fixedCostsError }, goalsResult]) {
    if (result.error) throwJapanese(result.error, "家計簿データの取得に失敗しました。");
  }
  if (assetSnapshotsResult.error && !assetSnapshotTableMissing) throwJapanese(assetSnapshotsResult.error, "月末資産データの取得に失敗しました。");
  if (fixedCostOverridesError && !fixedCostOverridesMissing) throwJapanese(fixedCostOverridesError, "固定費の月別変更データの取得に失敗しました。");
  if ((profileResult.data as DbProfile | null)?.deleted_at) throw new Error("このアカウントは停止されています。管理者に確認してください。");

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
      ((transactionsData ?? []) as DbTransaction[]).length === 0,
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
      kind: category.category_kind ?? (category.name === "給与" ? "income" : "expense"),
      color: category.color
    })),
    transactions: ((transactionsData ?? []) as DbTransaction[]).map((transaction): Transaction => {
      return {
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
      };
    }).sort((a, b) => (b.reflectedDate || b.date).localeCompare(a.reflectedDate || a.date)),
    fixedCosts: ((fixedCostsData ?? []) as DbFixedCost[]).map((cost): FixedCost => ({
      id: cost.id,
      name: cost.name,
      kind: cost.fixed_type ?? "expense",
      categoryId: cost.category_id ?? "",
      accountId: cost.account_id,
      transferToAccountId: cost.transfer_to_account_id ?? undefined,
      amount: toNumber(cost.amount),
      variable: cost.is_variable,
      dueDay: cost.due_day,
      status: cost.status,
      effectiveFrom: cost.effective_from ?? undefined,
      effectiveTo: cost.effective_to ?? undefined
    })),
    fixedCostOverrides: (fixedCostOverridesMissing ? [] : ((fixedCostOverridesData ?? []) as DbFixedCostOverride[])).map((override): FixedCostOverride => ({
      id: override.id,
      fixedCostId: override.fixed_cost_id,
      month: override.target_month.slice(0, 7),
      name: override.name ?? undefined,
      categoryId: override.category_id ?? undefined,
      accountId: override.account_id ?? undefined,
      transferToAccountId: override.transfer_to_account_id ?? undefined,
      amount: override.amount == null ? undefined : toNumber(override.amount),
      dueDay: override.due_day ?? undefined,
      skipped: override.skipped ?? false
    })),
    goals: ((goalsResult.data ?? []) as DbGoal[]).map((goal): Goal => ({
      id: goal.id,
      name: goal.name,
      accountId: goal.account_id,
      targetAmount: toNumber(goal.target_amount),
      deadline: goal.deadline,
      monthlyBoost: toNumber(goal.monthly_boost)
    })),
    assetSnapshots: (assetSnapshotTableMissing ? [] : ((assetSnapshotsResult.data ?? []) as DbAssetSnapshot[])).map((snapshot): AssetSnapshot => ({
      id: snapshot.id,
      accountId: snapshot.account_id,
      month: snapshot.snapshot_month.slice(0, 7),
      amount: toNumber(snapshot.amount)
    }))
  };
}

export async function insertRemoteTransaction(householdId: string, transaction: Omit<Transaction, "id"> & { idempotencyKey?: string }) {
  const client = requireSupabase();
  if (transaction.idempotencyKey) {
    const { data: existing, error: existingError } = await client
      .from("transactions")
      .select("id")
      .eq("household_id", householdId)
      .eq("idempotency_key", transaction.idempotencyKey)
      .maybeSingle();
    if (existingError) throwJapanese(existingError, "取引登録に失敗しました。");
    if (existing) return (existing as { id: string }).id;
  }
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
      idempotency_key: transaction.idempotencyKey ?? null,
      memo: transaction.memo ?? null
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (transaction.idempotencyKey && /duplicate|unique/i.test(error.message)) {
      const { data: existing } = await client
        .from("transactions")
        .select("id")
        .eq("household_id", householdId)
        .eq("idempotency_key", transaction.idempotencyKey)
        .maybeSingle();
      if (existing) return (existing as { id: string }).id;
    }
    throwJapanese(error, "取引登録に失敗しました。");
  }
  if (!data) throw new Error("取引IDを取得できませんでした。");
  return data.id as string;
}

export async function updateRemoteGoalBoost(goalId: string, monthlyBoost: number) {
  const client = requireSupabase();
  const { error } = await client.from("saving_goals").update({ monthly_boost: monthlyBoost }).eq("id", goalId);
  if (error) throwJapanese(error, "目標の更新に失敗しました。");
}

export async function createGoal(householdId: string, input: Omit<Goal, "id">) {
  const client = requireSupabase();
  const { error } = await client.from("saving_goals").insert({
    household_id: householdId,
    name: input.name,
    account_id: input.accountId,
    target_amount: input.targetAmount,
    deadline: input.deadline,
    monthly_boost: input.monthlyBoost
  });
  if (error) throwJapanese(error, "目標追加に失敗しました。");
}

export async function updateGoal(goalId: string, input: Omit<Goal, "id">) {
  const client = requireSupabase();
  const { error } = await client.from("saving_goals").update({
    name: input.name,
    account_id: input.accountId,
    target_amount: input.targetAmount,
    deadline: input.deadline,
    monthly_boost: input.monthlyBoost
  }).eq("id", goalId);
  if (error) throwJapanese(error, "目標更新に失敗しました。");
}

export async function deleteGoal(goalId: string) {
  const client = requireSupabase();
  const { error } = await client.from("saving_goals").update({ deleted_at: new Date().toISOString() }).eq("id", goalId);
  if (error) throwJapanese(error, "目標削除に失敗しました。");
}

export async function updateOpeningBalances(balances: Record<string, { amount: number; date: string }>) {
  const client = requireSupabase();
  await Promise.all(Object.entries(balances).map(async ([accountId, value]) => {
    const { error } = await client
      .from("accounts")
      .update({ opening_balance: value.amount, opening_balance_date: value.date || null })
      .eq("id", accountId);
    if (error) throwJapanese(error, "初期残高の更新に失敗しました。");
  }));
}

export async function upsertAssetSnapshots(householdId: string, month: string, balances: Record<string, number>) {
  const client = requireSupabase();
  const rows = Object.entries(balances).map(([accountId, amount]) => ({
    household_id: householdId,
    account_id: accountId,
    snapshot_month: `${month}-01`,
    amount
  }));
  const { error } = await client
    .from("monthly_asset_snapshots")
    .upsert(rows, { onConflict: "household_id,account_id,snapshot_month" });
  if (error) throwJapanese(error, "月末資産の確定に失敗しました。");
}

export async function createAccount(householdId: string, input: { name: string; type: AccountType; openingBalance: number; openingBalanceDate: string; color?: string; closingDay?: number; withdrawalDay?: number; withdrawalAccountId?: string }) {
  const client = requireSupabase();
  if (input.type === "credit" && !input.withdrawalAccountId) throw new Error("引落口座を選択してください。");
  const defaultColor = input.type === "saving" ? "#059669" : input.type === "cash" ? "#d97706" : input.type === "credit" ? "#7c3aed" : "#2563eb";
  const { error } = await client.from("accounts").insert({
    household_id: householdId,
    name: input.name,
    account_type: input.type,
    opening_balance: input.openingBalance,
    opening_balance_date: input.openingBalanceDate || null,
    color: input.color || defaultColor,
    closing_day: input.type === "credit" ? input.closingDay || 25 : null,
    withdrawal_day: input.type === "credit" ? input.withdrawalDay || 10 : null,
    withdrawal_account_id: input.type === "credit" ? input.withdrawalAccountId || null : null
  });
  if (error) throwJapanese(error, "口座追加に失敗しました。");
}

export async function updateAccount(accountId: string, input: { name: string; openingBalance: number; openingBalanceDate: string; color?: string; closingDay?: number; withdrawalDay?: number; withdrawalAccountId?: string }) {
  const client = requireSupabase();
  if ((input.closingDay || input.withdrawalDay) && !input.withdrawalAccountId) throw new Error("引落口座を選択してください。");
  const { error } = await client.from("accounts").update({
    name: input.name,
    opening_balance: input.openingBalance,
    opening_balance_date: input.openingBalanceDate || null,
    color: input.color || "#0f766e",
    closing_day: input.closingDay || null,
    withdrawal_day: input.withdrawalDay || null,
    withdrawal_account_id: input.withdrawalAccountId || null
  }).eq("id", accountId);
  if (error) throwJapanese(error, "口座更新に失敗しました。");
}

export async function deleteAccount(accountId: string) {
  const client = requireSupabase();
  const { error } = await client.from("accounts").update({ deleted_at: new Date().toISOString() }).eq("id", accountId);
  if (error) throwJapanese(error, "口座削除に失敗しました。");
}

export async function createCategory(householdId: string, input: { name: string; parentId?: string; color: string; kind?: "expense" | "income" }) {
  const client = requireSupabase();
  if (!input.name.trim()) throw new Error("カテゴリ名を入力してください。");
  let color = input.color || "#0f766e";
  let kind = input.kind ?? "expense";
  if (input.parentId) {
    const { data: parent, error: parentError } = await client.from("categories").select("color,category_kind").eq("id", input.parentId).maybeSingle();
    if (parentError) throwJapanese(parentError, "所属カテゴリーの取得に失敗しました。");
    const parentColor = (parent as { color?: string | null } | null)?.color ?? color;
    const { count, error: countError } = await client
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", input.parentId)
      .is("deleted_at", null);
    if (countError) throwJapanese(countError, "サブカテゴリー数の取得に失敗しました。");
    color = subcategoryColor(parentColor, count ?? 0);
    kind = ((parent as { category_kind?: "expense" | "income" | null } | null)?.category_kind ?? kind);
  }
  const { error } = await client.from("categories").insert({
    household_id: householdId,
    name: input.name.trim(),
    parent_id: input.parentId || null,
    category_kind: kind,
    color
  });
  if (error) throwJapanese(error, "カテゴリ追加に失敗しました。");
}

export async function updateCategory(categoryId: string, input: { name: string; parentId?: string; color: string; kind?: "expense" | "income" }) {
  const client = requireSupabase();
  if (!input.name.trim()) throw new Error("カテゴリ名を入力してください。");
  const { error } = await client.from("categories").update({
    name: input.name.trim(),
    parent_id: input.parentId || null,
    category_kind: input.kind ?? "expense",
    color: input.color || "#0f766e"
  }).eq("id", categoryId);
  if (error) throwJapanese(error, "カテゴリ更新に失敗しました。");
  if (!input.parentId) {
    const { data: children, error: childrenError } = await client
      .from("categories")
      .select("id,created_at")
      .eq("parent_id", categoryId)
      .is("deleted_at", null)
      .order("created_at");
    if (childrenError) throwJapanese(childrenError, "サブカテゴリーの取得に失敗しました。");
    const childUpdates = await Promise.all(((children ?? []) as Array<{ id: string }>).map((child, index) => {
      return client.from("categories").update({
        category_kind: input.kind ?? "expense",
        color: subcategoryColor(input.color || "#0f766e", index)
      }).eq("id", child.id);
    }));
    const childError = childUpdates.find((result) => result.error)?.error;
    if (childError) throwJapanese(childError, "サブカテゴリーの色更新に失敗しました。");
  }
}

export async function deleteCategory(categoryId: string) {
  const client = requireSupabase();
  const { error } = await client.from("categories").update({ deleted_at: new Date().toISOString() }).eq("id", categoryId);
  if (error) throwJapanese(error, "カテゴリ削除に失敗しました。");
}

export async function createFixedCost(householdId: string, input: Omit<FixedCost, "id">) {
  const client = requireSupabase();
  const { error } = await client.from("fixed_costs").insert({
    household_id: householdId,
    name: input.name,
    fixed_type: input.kind ?? "expense",
    category_id: input.kind === "transfer" ? null : input.categoryId,
    account_id: input.accountId,
    transfer_to_account_id: input.kind === "transfer" ? input.transferToAccountId ?? null : null,
    amount: input.amount,
    is_variable: input.variable,
    due_day: input.dueDay,
    status: "planned",
    effective_from: input.effectiveFrom ?? null,
    effective_to: input.effectiveTo ?? null
  });
  if (error) throwJapanese(error, "固定費追加に失敗しました。");
}

export async function updateFixedCost(fixedCostId: string, input: Omit<FixedCost, "id">, scope: "all" | "future" = "all", fromMonth?: string) {
  const client = requireSupabase();
  if (scope === "future" && fromMonth) {
    const effectiveFrom = `${fromMonth}-01`;
    const before = new Date(Number(fromMonth.slice(0, 4)), Number(fromMonth.slice(5, 7)) - 1, 0);
    const effectiveTo = `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, "0")}-${String(before.getDate()).padStart(2, "0")}`;
    const { data: original, error: originalError } = await client.from("fixed_costs").select("household_id").eq("id", fixedCostId).maybeSingle();
    if (originalError) throwJapanese(originalError, "固定費更新に失敗しました。");
    const householdId = (original as { household_id?: string } | null)?.household_id;
    if (!householdId) throw new Error("固定費が見つかりません。");
    const { error: closeError } = await client.from("fixed_costs").update({ effective_to: effectiveTo }).eq("id", fixedCostId);
    if (closeError) throwJapanese(closeError, "固定費更新に失敗しました。");
    const { error: insertError } = await client.from("fixed_costs").insert({
      household_id: householdId,
      name: input.name,
      fixed_type: input.kind ?? "expense",
      category_id: input.kind === "transfer" ? null : input.categoryId,
      account_id: input.accountId,
      transfer_to_account_id: input.kind === "transfer" ? input.transferToAccountId ?? null : null,
      amount: input.amount,
      is_variable: input.variable,
      due_day: input.dueDay,
      status: "planned",
      effective_from: effectiveFrom,
      effective_to: input.effectiveTo ?? null
    });
    if (insertError) throwJapanese(insertError, "固定費更新に失敗しました。");
    return;
  }
  const { error } = await client.from("fixed_costs").update({
    name: input.name,
    fixed_type: input.kind ?? "expense",
    category_id: input.kind === "transfer" ? null : input.categoryId,
    account_id: input.accountId,
    transfer_to_account_id: input.kind === "transfer" ? input.transferToAccountId ?? null : null,
    amount: input.amount,
    is_variable: input.variable,
    due_day: input.dueDay,
    status: "planned",
    effective_from: input.effectiveFrom ?? null,
    effective_to: input.effectiveTo ?? null
  }).eq("id", fixedCostId);
  if (error) throwJapanese(error, "固定費更新に失敗しました。");
}

export async function deleteFixedCost(fixedCostId: string, scope: "all" | "future" = "all", fromMonth?: string) {
  const client = requireSupabase();
  if (scope === "future" && fromMonth) {
    const before = new Date(Number(fromMonth.slice(0, 4)), Number(fromMonth.slice(5, 7)) - 1, 0);
    const effectiveTo = `${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, "0")}-${String(before.getDate()).padStart(2, "0")}`;
    const { error } = await client.from("fixed_costs").update({ effective_to: effectiveTo }).eq("id", fixedCostId);
    if (error) throwJapanese(error, "固定費削除に失敗しました。");
    return;
  }
  const { error } = await client.from("fixed_costs").update({ deleted_at: new Date().toISOString() }).eq("id", fixedCostId);
  if (!error) return;

  const { error: rpcError } = await client.rpc("delete_fixed_cost_safe", { target_fixed_cost_id: fixedCostId });
  if (!rpcError) return;

  const { error: hardDeleteError } = await client.from("fixed_costs").delete().eq("id", fixedCostId);
  if (hardDeleteError) throwJapanese(hardDeleteError, "固定費削除に失敗しました。");
}

export async function upsertFixedCostOverride(householdId: string, fixedCostId: string, month: string, input: {
  name?: string;
  categoryId?: string;
  accountId?: string;
  transferToAccountId?: string;
  amount?: number;
  dueDay?: number;
  skipped?: boolean;
}) {
  const client = requireSupabase();
  const { error } = await client.from("fixed_cost_overrides").upsert({
    household_id: householdId,
    fixed_cost_id: fixedCostId,
    target_month: `${month}-01`,
    name: input.name || null,
    category_id: input.categoryId || null,
    account_id: input.accountId || null,
    transfer_to_account_id: input.transferToAccountId || null,
    amount: input.amount ?? null,
    due_day: input.dueDay ?? null,
    skipped: input.skipped ?? false
  }, { onConflict: "fixed_cost_id,target_month" });
  if (error) throwJapanese(error, "選択月のみの固定費変更に失敗しました。");
}

export async function updateTransaction(transactionId: string, transaction: Omit<Transaction, "id">) {
  const client = requireSupabase();
  const payload = {
    transaction_type: transaction.type,
    amount: transaction.amount,
    category_id: transaction.categoryId || null,
    account_id: transaction.accountId,
    transfer_to_account_id: transaction.transferToAccountId || null,
    occurred_on: transaction.date,
    reflected_on: transaction.reflectedDate || null,
    credit_status: transaction.creditStatus || null,
    memo: transaction.memo || null
  };
  const { error } = await client.from("transactions").update(payload).eq("id", transactionId);
  if (!error) return;

  const { error: rpcError } = await client.rpc("update_transaction_safe", {
    target_transaction_id: transactionId,
    new_transaction_type: transaction.type,
    new_amount: transaction.amount,
    new_category_id: transaction.categoryId || null,
    new_account_id: transaction.accountId,
    new_transfer_to_account_id: transaction.transferToAccountId || null,
    new_occurred_on: transaction.date,
    new_reflected_on: transaction.reflectedDate || null,
    new_credit_status: transaction.creditStatus || null,
    new_memo: transaction.memo || null
  });
  if (!rpcError) return;

  const { data: original, error: originalError } = await client.from("transactions").select("household_id").eq("id", transactionId).maybeSingle();
  if (originalError) throwJapanese(originalError, "取引更新に失敗しました。");
  const householdId = (original as { household_id?: string } | null)?.household_id;
  if (!householdId) throwJapanese(rpcError, "取引更新に失敗しました。");
  const { error: insertError } = await client.from("transactions").insert({ household_id: householdId, ...payload });
  if (insertError) throwJapanese(insertError, "取引更新に失敗しました。");
  await client.from("transactions").delete().eq("id", transactionId);
}

export async function deleteTransaction(transactionId: string) {
  const client = requireSupabase();
  const { error } = await client.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", transactionId);
  if (!error) return;

  const { error: rpcError } = await client.rpc("delete_transaction_safe", { target_transaction_id: transactionId });
  if (!rpcError) return;

  const { error: hardDeleteError } = await client.from("transactions").delete().eq("id", transactionId);
  if (hardDeleteError) throwJapanese(hardDeleteError, "取引削除に失敗しました。");
}

export async function updateRemoteHouseholdSpace(householdId: string, activeSpace: SpaceType) {
  const client = requireSupabase();
  const { error } = await client.from("households").update({ space_type: activeSpace }).eq("id", householdId);
  if (error) throwJapanese(error, "家計簿設定の更新に失敗しました。");
}
