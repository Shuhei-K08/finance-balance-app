export type SpaceType = "personal" | "shared";
export type LedgerMode = "cashflow" | "balance";
export type TransactionType = "income" | "expense" | "transfer";
export type AccountType = "bank" | "cash" | "credit" | "saving";
export type FixedCostStatus = "planned" | "confirmed" | "paid";
export type CreditStatus = "unconfirmed" | "confirmed" | "withdrawn";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  openingBalanceDate?: string;
  color: string;
  closingDay?: number;
  withdrawalDay?: number;
  withdrawalAccountId?: string;
};

export type Category = {
  id: string;
  name: string;
  parentId?: string;
  kind: "expense" | "income";
  color: string;
  sortOrder?: number;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId?: string;
  subcategoryId?: string;
  accountId: string;
  transferToAccountId?: string;
  paymentMethodId?: string;
  date: string;
  reflectedDate?: string;
  memo?: string;
  creditStatus?: CreditStatus;
};

export type FixedCost = {
  id: string;
  name: string;
  kind: TransactionType;
  categoryId: string;
  accountId: string;
  transferToAccountId?: string;
  amount: number;
  variable: boolean;
  dueDay: number;
  status: FixedCostStatus;
  effectiveFrom?: string;
  effectiveTo?: string;
};

export type FixedCostOverride = {
  id: string;
  fixedCostId: string;
  month: string;
  name?: string;
  categoryId?: string;
  accountId?: string;
  transferToAccountId?: string;
  amount?: number;
  dueDay?: number;
  skipped?: boolean;
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  accountId: string;
  deadline: string;
  monthlyBoost: number;
};

export type AssetSnapshot = {
  id: string;
  accountId: string;
  month: string;
  amount: number;
};

export type InvestmentAccount = {
  id: string;
  name: string;
  startMonth: string;
  initialAmount: number;
  monthlyContribution: number;
  targetAnnualRate: number;
  color: string;
};

export type InvestmentMonthlyRecord = {
  id: string;
  investmentAccountId: string;
  month: string;
  monthEndValue: number;
  additionalInvestment: number;
  note?: string;
};

export type HouseholdSummary = {
  id: string;
  name: string;
  spaceType: SpaceType;
  mode: LedgerMode;
  inviteCode?: string;
  memberRole?: "owner" | "member";
};

export type HouseholdMember = {
  userId: string;
  displayName: string;
  memberRole: "owner" | "member";
};

export type AdminDashboard = {
  users: Array<{
    id: string;
    displayName: string;
    role: "user" | "admin";
    createdAt?: string;
    deletedAt?: string;
    households: Array<{ id: string; name: string; spaceType: SpaceType; memberRole: "owner" | "member"; deletedAt?: string }>;
  }>;
  households: Array<{
    id: string;
    name: string;
    spaceType: SpaceType;
    createdAt?: string;
    deletedAt?: string;
    members: Array<{ userId: string; displayName: string; memberRole: "owner" | "member" }>;
  }>;
};

export type LedgerState = {
  householdId?: string;
  householdName?: string;
  inviteCode?: string;
  profileRole?: "user" | "admin";
  households?: HouseholdSummary[];
  needsOpeningSetup?: boolean;
  activeSpace: SpaceType;
  mode: LedgerMode;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  fixedCosts: FixedCost[];
  fixedCostOverrides: FixedCostOverride[];
  goals: Goal[];
  assetSnapshots: AssetSnapshot[];
  investmentAccounts: InvestmentAccount[];
  investmentRecords: InvestmentMonthlyRecord[];
};
