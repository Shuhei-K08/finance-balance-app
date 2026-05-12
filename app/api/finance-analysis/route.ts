import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

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
    return NextResponse.json({ error: `Gemini APIの呼び出しに失敗しました。${detail.slice(0, 180)}` }, { status: response.status });
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
    return NextResponse.json({ error: `OpenAI APIの呼び出しに失敗しました。${detail.slice(0, 180)}` }, { status: response.status });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    return NextResponse.json({ error: "OpenAI APIの応答が空でした。" }, { status: 502 });
  }

  return NextResponse.json({ text });
}
