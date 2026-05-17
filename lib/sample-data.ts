import { LedgerState } from "./types";

export const initialState: LedgerState = {
  activeSpace: "personal",
  mode: "balance",
  accounts: [
    { id: "bank-main", name: "生活口座", type: "bank", openingBalance: 420000, color: "#2563eb" },
    { id: "saving", name: "貯金口座", type: "saving", openingBalance: 1280000, color: "#059669" },
    { id: "cash", name: "現金", type: "cash", openingBalance: 28000, color: "#d97706" },
    {
      id: "card-visa",
      name: "VISAカード",
      type: "credit",
      openingBalance: 0,
      color: "#7c3aed",
      closingDay: 25,
      withdrawalDay: 10,
      withdrawalAccountId: "bank-main"
    }
  ],
  categories: [
    { id: "food", name: "食費", kind: "expense", color: "#ef4444" },
    { id: "grocery", name: "スーパー", parentId: "food", kind: "expense", color: "#f97316" },
    { id: "dining", name: "外食", parentId: "food", kind: "expense", color: "#fb7185" },
    { id: "home", name: "住居", kind: "expense", color: "#64748b" },
    { id: "utility", name: "光熱費", parentId: "home", kind: "expense", color: "#0ea5e9" },
    { id: "fun", name: "娯楽", kind: "expense", color: "#8b5cf6" },
    { id: "sub", name: "サブスク", parentId: "fun", kind: "expense", color: "#a855f7" },
    { id: "salary", name: "給与", kind: "income", color: "#16a34a" },
    { id: "saving-cat", name: "貯金", kind: "expense", color: "#10b981" }
  ],
  transactions: [
    { id: "t1", type: "income", amount: 360000, categoryId: "salary", accountId: "bank-main", date: "2026-05-01", memo: "給与" },
    { id: "t2", type: "expense", amount: 6800, categoryId: "food", subcategoryId: "grocery", accountId: "card-visa", date: "2026-05-03", reflectedDate: "2026-06-10", memo: "週末まとめ買い", creditStatus: "unconfirmed" },
    { id: "t3", type: "expense", amount: 4200, categoryId: "food", subcategoryId: "dining", accountId: "cash", date: "2026-05-05", memo: "外食" },
    { id: "t4", type: "transfer", amount: 80000, categoryId: "saving-cat", accountId: "bank-main", transferToAccountId: "saving", date: "2026-05-02", memo: "先取り貯金" },
    { id: "t5", type: "expense", amount: 1320, categoryId: "fun", subcategoryId: "sub", accountId: "card-visa", date: "2026-05-06", reflectedDate: "2026-06-10", memo: "音楽サブスク", creditStatus: "confirmed" }
  ],
  fixedCosts: [
    { id: "f1", name: "家賃", kind: "expense", categoryId: "home", accountId: "bank-main", amount: 92000, variable: false, dueDay: 27, status: "planned" },
    { id: "f2", name: "電気代", kind: "expense", categoryId: "utility", accountId: "card-visa", amount: 9800, variable: true, dueDay: 18, status: "planned" },
    { id: "f3", name: "保険", kind: "expense", categoryId: "home", accountId: "bank-main", amount: 11800, variable: false, dueDay: 20, status: "confirmed" }
  ],
  fixedCostOverrides: [],
  goals: [
    { id: "g1", name: "生活防衛資金", targetAmount: 2000000, accountId: "saving", deadline: "2028-12-31", monthlyBoost: 0 },
    { id: "g2", name: "旅行資金", targetAmount: 450000, accountId: "saving", deadline: "2027-08-31", monthlyBoost: 12000 }
  ],
  assetSnapshots: [],
  investmentAccounts: [],
  investmentRecords: [],
  investmentContributionChanges: []
};
