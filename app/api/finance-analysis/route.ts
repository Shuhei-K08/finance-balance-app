import { NextResponse } from "next/server";

const API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const API_URL = API_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`
  : "";

export async function POST(request: Request) {
  try {
    if (!API_URL) {
      return NextResponse.json({ error: "Gemini API key is not configured." }, { status: 500 });
    }

    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    if (!prompt.trim()) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 420, temperature: 0.65 }
      })
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Gemini API request failed." }, { status: response.status });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json({ error: "Gemini API response was empty." }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "AI analysis failed." }, { status: 500 });
  }
}
