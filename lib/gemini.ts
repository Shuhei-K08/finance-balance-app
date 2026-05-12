export async function analyzeFinance(prompt: string): Promise<string> {
  const res = await fetch("/api/finance-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Gemini API request failed.");
  const text = data?.text;
  if (!text) throw new Error("Gemini API response was empty.");
  return text;
}

export function buildFinancePrompt(stats: {
  monthLabel: string;
  income: number;
  expense: number;
  assets: number;
  forecast: number;
  topCategory: string;
  topCategoryAmount: number;
  savingRate: number;
  averageSaving: number;
  creditPending: number;
  fixedCost: number;
  monthlyBalance: number;
  categoryBreakdown: string;
  assetBreakdown: string;
  goalSummary: string;
  recentTrend: string;
}) {
  return `あなたは日本の個人向け家計改善アドバイザーです。以下の家計データをもとに、家計改善に直結する分析コメントを日本語で4行返してください。
条件:
- 箇条書き記号は使わない
- 1行は55文字以内を目安にする
- 数字を使って具体的に言う
- 誰でも言える一般論は禁止
- 「支出をどう抑えるか」を具体的な金額か頻度で言う
- 「今後資産がどうなりそうか」を収支傾向から言う
- 最大支出カテゴリ、固定費、クレカ引落のどれを優先管理すべきか判断する
- 目標がある場合は期限達成に必要な観点で助言する
- データにないことは推測しない
- 厳しすぎず、でも曖昧にしない
- 返答は分析コメントだけにする

対象月: ${stats.monthLabel}
対象月の収入: ${stats.income.toLocaleString()}円
対象月の支出: ${stats.expense.toLocaleString()}円
対象月の収支: ${stats.monthlyBalance.toLocaleString()}円
貯金率: ${stats.savingRate}%
過去平均の月間貯金額: ${stats.averageSaving.toLocaleString()}円
総資産: ${stats.assets.toLocaleString()}円
月末予測残高: ${stats.forecast.toLocaleString()}円
固定費予定: ${stats.fixedCost.toLocaleString()}円
クレジットカード引落予定: ${stats.creditPending.toLocaleString()}円
最大支出カテゴリ: ${stats.topCategory}（${stats.topCategoryAmount.toLocaleString()}円）
支出カテゴリ上位: ${stats.categoryBreakdown}
資産内訳: ${stats.assetBreakdown}
直近推移: ${stats.recentTrend}
目標状況: ${stats.goalSummary}`;
}

export function buildAnnualSavingsPrompt(input: {
  monthLabel: string;
  monthlyRows: string;
  averageSaving: number;
  currentAssets: number;
}) {
  return `あなたは日本の個人向け家計改善アドバイザーです。過去数ヶ月の収入・支出・貯金推移を分析し、年間貯金予測を日本語で3行返してください。
条件:
- 箇条書き記号は使わない
- 1行は45文字以内を目安にする
- 1行目に年間貯金予測額を入れる
- 2行目に予測根拠を入れる
- 3行目に改善ポイントを入れる
- データにないことは推測しない
- 返答は分析コメントだけにする

基準月: ${input.monthLabel}
現在の総資産: ${input.currentAssets.toLocaleString()}円
過去平均の月間貯金額: ${input.averageSaving.toLocaleString()}円
月別データ:
${input.monthlyRows}`;
}
