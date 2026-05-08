const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

export async function analyzeFinance(prompt: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
    })
  });
  if (!res.ok) throw new Error("Gemini API エラー");
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "分析できませんでした。";
}

export function buildFinancePrompt(stats: {
  income: number;
  expense: number;
  assets: number;
  forecast: number;
  topCategory: string;
  topCategoryAmount: number;
  savingRate: number;
}): string {
  return `あなたは家計アドバイザーです。以下のデータを元に、日本語で3つの具体的なアドバイスを簡潔に提供してください。各アドバイスは1〜2文で、箇条書きなしで改行区切りで返してください。

今月の収入: ${stats.income.toLocaleString()}円
今月の支出: ${stats.expense.toLocaleString()}円
貯金率: ${stats.savingRate}%
総資産: ${stats.assets.toLocaleString()}円
月末予測残高: ${stats.forecast.toLocaleString()}円
最大支出カテゴリ: ${stats.topCategory}（${stats.topCategoryAmount.toLocaleString()}円）`;
}
