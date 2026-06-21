import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiRateLimiter } from "@/lib/ai-helpers";
import {
  ASSISTANT_TOOLS,
  TOOL_KIND,
  toOpenRouterTools,
  runReadTool,
  previewWrite,
  commitWrite,
  endpointCatalog,
} from "@/lib/assistant-tools";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-3-5-sonnet-20241022";
const MAX_STEPS = 6;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

const SYSTEM_PROMPT = `You are the friendly AI concierge for an independent restaurant's website.
You help guests and staff get things done quickly: answer questions about the menu,
check table availability, look up reservations, book new reservations, and place orders.

Guidelines:
- Be concise and warm. Ask only for the details you actually need.
- Use the provided tools to look up real data instead of guessing. Never invent menu
  items, prices, or availability.
- For a reservation you need: guest name, phone number, party size, date and time.
- For an order you need the menu item names and quantities.
- Today's date is ${new Date().toISOString().split("T")[0]}. Resolve relative dates
  ("tonight", "tomorrow", "Friday") into concrete YYYY-MM-DD before calling a tool.
- IMPORTANT — never ask the user to confirm in your text reply, and never say
  "please confirm" or "shall I save it". The moment you have the required fields,
  immediately CALL the write tool (create_reservation, create_order, or
  perform_action). The system then shows the guest a Confirm button automatically.
  Asking for confirmation in prose instead of calling the tool leaves the guest with
  no button and a stuck order — do not do it.
- Only ask the guest a question when a REQUIRED field is genuinely missing. If you
  have everything, call the tool right away.
- For anything not covered by the specific tools, automatically use query_data (to
  look things up) or perform_action (to create/update/delete), choosing the right
  endpoint id from the catalog below. Never ask the user which API or endpoint to
  use — infer it yourself. To act on a specific record (e.g. cancel a reservation),
  first query_data to find its id, then perform_action with that id.

Available endpoints (id → what it does):
${endpointCatalog()}`;

async function callModel(messages: ChatMessage[]) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "Independent Restaurant Assistant",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      tools: toOpenRouterTools(ASSISTANT_TOOLS),
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message as ChatMessage;
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "AI assistant is unavailable — OPENROUTER_API_KEY is not set." },
      { status: 503 },
    );
  }

  let userId: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    // Assistant is usable without a session; rate-limit by IP below.
  }

  const rateKey = userId || request.headers.get("x-forwarded-for") || "anon";
  const limit = aiRateLimiter(rateKey);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "You've reached the assistant request limit. Try again later." },
      { status: 429 },
    );
  }

  try {
    const body = await request.json();
    const history: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const confirm = body.confirm as { name: string; arguments: any } | undefined;

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.filter((m) => m.role === "user" || m.role === "assistant"),
    ];

    // --- Path A: the user confirmed a pending write action -----------------
    if (confirm?.name) {
      let result: unknown;
      let ok = true;
      try {
        result = await commitWrite(confirm.name, confirm.arguments);
      } catch (e) {
        ok = false;
        result = { error: e instanceof Error ? e.message : "Action failed." };
      }
      const followup: ChatMessage[] = [
        ...messages,
        {
          role: "user",
          content: ok
            ? `The guest confirmed. The action "${confirm.name}" completed: ${JSON.stringify(result)}. Give a short, friendly confirmation.`
            : `The action "${confirm.name}" failed: ${JSON.stringify(result)}. Apologize briefly and suggest a fix.`,
        },
      ];
      const reply = await callModel(followup);
      await logResult(userId, body, reply?.content, Date.now() - t0);
      return NextResponse.json({ message: reply?.content ?? "Done.", pendingAction: null });
    }

    // --- Path B: normal agent loop -----------------------------------------
    for (let step = 0; step < MAX_STEPS; step++) {
      const assistantMsg = await callModel(messages);
      messages.push(assistantMsg);

      const toolCalls = assistantMsg?.tool_calls ?? [];
      if (toolCalls.length === 0) {
        await logResult(userId, body, assistantMsg?.content, Date.now() - t0);
        return NextResponse.json({ message: assistantMsg?.content ?? "", pendingAction: null });
      }

      // Process tool calls. A write tool short-circuits into a confirmation.
      for (const call of toolCalls) {
        const name = call.function?.name as string;
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(call.function?.arguments || "{}");
        } catch {
          parsedArgs = {};
        }

        if (TOOL_KIND[name] === "write") {
          try {
            const preview = await previewWrite(name, parsedArgs);
            await logResult(userId, body, `pending:${name}`, Date.now() - t0);
            return NextResponse.json({
              message:
                assistantMsg?.content ||
                `Please review and confirm: ${preview.summary}`,
              pendingAction: {
                name,
                arguments: parsedArgs,
                summary: preview.summary,
              },
            });
          } catch (e) {
            // Not fulfillable yet — feed the error back so the model can ask.
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name,
              content: JSON.stringify({ error: e instanceof Error ? e.message : "Invalid request." }),
            });
            continue;
          }
        }

        // Read tool — execute and feed results back.
        try {
          const result = await runReadTool(name, parsedArgs);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name,
            content: JSON.stringify(result),
          });
        } catch (e) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name,
            content: JSON.stringify({ error: e instanceof Error ? e.message : "Tool failed." }),
          });
        }
      }
    }

    return NextResponse.json({
      message: "Sorry, I couldn't complete that. Could you rephrase?",
      pendingAction: null,
    });
  } catch (error) {
    console.error("Assistant error:", error);
    await logResult(userId, null, undefined, Date.now() - t0, error);
    return NextResponse.json(
      { error: "The assistant ran into a problem. Please try again." },
      { status: 500 },
    );
  }
}

async function logResult(
  userId: string | null,
  input: unknown,
  output: unknown,
  durationMs: number,
  error?: unknown,
) {
  try {
    await prisma.aiResult.create({
      data: {
        feature: "assistant_chat",
        userId,
        model: OPENROUTER_MODEL,
        input: (input as any) ?? undefined,
        output: output != null ? ({ message: output } as any) : undefined,
        error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
        durationMs,
      },
    });
  } catch (err) {
    console.error("Failed to persist assistant AiResult", err);
  }
}
