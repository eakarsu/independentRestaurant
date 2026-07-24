import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const user = await prisma.user.findFirst({ where: { id: session.user.id, isActive: true }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Session is no longer active" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { prompt?: string };
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !baseUrl || !model) return NextResponse.json({ error: "OpenRouter is not configured" }, { status: 503 });
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Provide concise restaurant operations advice with risks, measurable actions, and food-safety awareness." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) return NextResponse.json({ error: `OpenRouter returned ${response.status}` }, { status: 502 });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return NextResponse.json({ error: "OpenRouter returned empty content" }, { status: 502 });
  const stored = await prisma.aiResult.create({
    data: { feature: "runtime_restaurant_advice", userId: user.id, model, input: { prompt }, rawText: content, output: { content, provider: "openrouter" } },
    select: { id: true },
  });
  return NextResponse.json({ content, provider: "openrouter", model, persistedId: stored.id });
}
