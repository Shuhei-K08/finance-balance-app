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
  income: number;
  expense: number;
  assets: number;
  forecast: number;
  topCategory: string;
  topCategoryAmount: number;
  savingRate: number;
  averageSaving: number;
  creditPending: number;
}) {
  return `あなたは日本の個人向け家計改善アドバイザーです。以下の家計データをもとに、具体的で実行しやすい分析コメントを日本語で3行返してください。
条件:
- 箇条書き記号は使わない
- 1行は45文字以内を目安にする
- 数字を使って具体的に言う
- 厳しすぎず、前向きな助言にする
- 返答は分析コメントだけにする

今月の収入: ${stats.income.toLocaleString()}円
今月の支出: ${stats.expense.toLocaleString()}円
貯金率: ${stats.savingRate}%
過去平均の月間貯金額: ${stats.averageSaving.toLocaleString()}円
総資産: ${stats.assets.toLocaleString()}円
月末予測残高: ${stats.forecast.toLocaleString()}円
クレジットカード引落予定: ${stats.creditPending.toLocaleString()}円
最大支出カテゴリ: ${stats.topCategory}（${stats.topCategoryAmount.toLocaleString()}円）`;
}
