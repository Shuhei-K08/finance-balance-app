import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

export async function GET() {
  return NextResponse.json({
    ok: Boolean(GEMINI_API_KEY || OPENAI_API_KEY),
    provider: GEMINI_API_KEY ? "gemini" : OPENAI_API_KEY ? "openai" : "none",
    model: GEMINI_API_KEY ? GEMINI_MODEL : OPENAI_API_KEY ? process.env.OPENAI_MODEL || "gpt-4o-mini" : null,
    message: GEMINI_API_KEY || OPENAI_API_KEY
      ? "AI APIキーはVercel環境変数から読み込めています。"
      : "AI APIキーが読み込めていません。VercelのProduction環境変数とRedeployを確認してください。"
  });
}

export async function POST(request: Request) {
  try {
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      return NextResponse.json({ error: "AI APIキーが未設定です。.env.local に GEMINI_API_KEY または OPENAI_API_KEY を設定してください。" }, { status: 500 });
    }

    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    if (!prompt.trim()) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    if (GEMINI_API_KEY) {
      return runGemini(prompt);
    }

    return runOpenAi(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI分析に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runGemini(prompt: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 520, temperature: 0.55 }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json({ error: `Gemini APIの呼び出しに失敗しました。${compactApiError(detail)}` }, { status: response.status });
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return NextResponse.json({ error: "Gemini APIの応答が空でした。" }, { status: 502 });
  }

  return NextResponse.json({ text });
}

async function runOpenAi(prompt: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 520,
        temperature: 0.55
      })
    });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json({ error: `OpenAI APIの呼び出しに失敗しました。${compactApiError(detail)}` }, { status: response.status });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    return NextResponse.json({ error: "OpenAI APIの応答が空でした。" }, { status: 502 });
  }

  return NextResponse.json({ text });
}

function compactApiError(detail: string) {
  try {
    const parsed = JSON.parse(detail);
    const message = parsed?.error?.message || parsed?.message;
    if (message) return String(message).slice(0, 260);
  } catch {
    // Ignore non-JSON API errors.
  }
  return detail.replace(/\s+/g, " ").slice(0, 260);
}
