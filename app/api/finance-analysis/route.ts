import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
const GEMINI_MODELS = (process.env.GEMINI_MODEL || "gemini-2.0-flash,gemini-2.5-flash,gemini-1.5-flash")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  try {
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      return NextResponse.json({ error: "AI分析を取得できませんでした。" }, { status: 500 });
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
    return NextResponse.json({ error: "AI分析を取得できませんでした。" }, { status: 500 });
  }
}

async function runGemini(prompt: string) {
  for (const model of GEMINI_MODELS) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 520, temperature: 0.55 }
      })
    });

    if (!response.ok) {
      continue;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return NextResponse.json({ text });
  }

  return NextResponse.json({ error: "AI分析を取得できませんでした。" }, { status: 502 });
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
    return NextResponse.json({ error: "AI分析を取得できませんでした。" }, { status: response.status });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    return NextResponse.json({ error: "AI分析を取得できませんでした。" }, { status: 502 });
  }

  return NextResponse.json({ text });
}
