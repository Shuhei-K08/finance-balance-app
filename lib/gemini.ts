const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const API_URL = API_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`
  : "";

export async function analyzeFinance(prompt: string): Promise<string> {
  if (!API_URL) throw new Error("Gemini API key is not configured.");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 420, temperature: 0.65 }
    })
  });
  if (!res.ok) throw new Error("Gemini API request failed.");
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
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
