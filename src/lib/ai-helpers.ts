/**
 * Shared AI helpers for the independent-restaurant app.
 *
 * - Standard model: anthropic/claude-3-5-sonnet-20241022 (overridable via env).
 * - Per-user AI rate limiter: 20 calls / hour / user (configurable).
 * - 3-strategy JSON parser for tolerant LLM JSON extraction.
 * - Centralized OpenRouter caller used by every AI feature.
 *
 * This replaces the ad-hoc fetches sprinkled across the codebase and removes the
 * silent rule-based fallbacks that masked AI failures.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-3-5-sonnet-20241022";

// ---------- per-user AI rate limit (20/hr) ----------

interface RateBucket {
  count: number;
  resetAt: number;
}
const aiBuckets = new Map<string, RateBucket>();
const AI_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const AI_MAX_CALLS = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR || "20", 10);

export interface AiRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** Check + increment the per-user AI rate budget. */
export function aiRateLimiter(userKey: string): AiRateLimitResult {
  const now = Date.now();
  const b = aiBuckets.get(userKey);
  if (!b || now > b.resetAt) {
    aiBuckets.set(userKey, { count: 1, resetAt: now + AI_WINDOW_MS });
    return { allowed: true, remaining: AI_MAX_CALLS - 1, resetAt: now + AI_WINDOW_MS };
  }
  if (b.count >= AI_MAX_CALLS) {
    return { allowed: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count++;
  return { allowed: true, remaining: AI_MAX_CALLS - b.count, resetAt: b.resetAt };
}

// ---------- 3-strategy JSON parser ----------

function stripFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    const nl = t.indexOf("\n");
    if (nl !== -1) t = t.slice(nl + 1);
    if (t.endsWith("```")) t = t.slice(0, -3);
  }
  return t.trim();
}

function sanitizeNewlinesInsideStrings(raw: string): string {
  return raw.replace(/"(?:[^"\\]|\\.)*"/g, (m) =>
    m.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t"),
  );
}

function balancedJson(content: string): string | null {
  const first = content.indexOf("{");
  if (first === -1) return null;
  let depth = 0,
    inStr = false,
    esc = false,
    last = -1;
  for (let i = first; i < content.length; i++) {
    const ch = content[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        last = i;
        break;
      }
    }
  }
  if (last === -1) return null;
  return content.substring(first, last + 1);
}

/**
 * Recover a usable object from a JSON response that was truncated mid-output
 * (e.g. the model hit max_tokens). Trims to the last complete array element /
 * field and re-balances any open brackets and braces.
 */
function salvageTruncatedJson(content: string): string | null {
  const first = content.indexOf("{");
  if (first === -1) return null;
  let s = content.slice(first);

  // Drop a trailing incomplete token after the last element/object boundary.
  const cut = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (cut > 0) s = s.slice(0, cut + 1);

  // Walk the (possibly still-unbalanced) text and record the open stack.
  const stack: string[] = [];
  let inStr = false,
    esc = false;
  for (const ch of s) {
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inStr) s += '"';
  while (stack.length) s += stack.pop();
  return s;
}

/**
 * Parse JSON returned by the LLM using three strategies in order:
 *   1. direct JSON.parse on the trimmed/fence-stripped content
 *   2. JSON.parse after sanitizing literal newlines inside string values
 *   3. extract balanced { ... } block, then retry both above
 *
 * Throws if all three strategies fail.
 */
export function parseAIJson<T = any>(raw: string): T {
  const stripped = stripFences(raw);

  try {
    return JSON.parse(stripped) as T;
  } catch {
    /* fallthrough */
  }

  try {
    return JSON.parse(sanitizeNewlinesInsideStrings(stripped)) as T;
  } catch {
    /* fallthrough */
  }

  const block = balancedJson(stripped);
  if (block) {
    try {
      return JSON.parse(block) as T;
    } catch {
      try {
        return JSON.parse(sanitizeNewlinesInsideStrings(block)) as T;
      } catch {
        /* fall to next strategy */
      }
    }
  }

  // 4th strategy: salvage a response truncated by max_tokens.
  const salvaged = salvageTruncatedJson(stripped);
  if (salvaged) {
    try {
      return JSON.parse(salvaged) as T;
    } catch {
      try {
        return JSON.parse(sanitizeNewlinesInsideStrings(salvaged)) as T;
      } catch {
        /* fall to error */
      }
    }
  }

  throw new Error(
    `parseAIJson: failed to parse AI response after 4 strategies. raw=${raw.slice(0, 240)}…`,
  );
}

// ---------- OpenRouter call ----------

export interface CallOptions {
  /** Override the default model. */
  model?: string;
  /** Sampling temperature; defaults to 0.5 for grounded analytics. */
  temperature?: number;
  /** Hard cap on completion tokens. */
  maxTokens?: number;
  /** Ask OpenRouter to enforce JSON output. */
  jsonMode?: boolean;
  /** Request timeout in ms. */
  timeoutMs?: number;
}

export class AiUnavailableError extends Error {}

/**
 * Call OpenRouter chat-completions with the standard headers.
 * Throws AiUnavailableError if the key is missing — never returns canned text.
 */
export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  opts: CallOptions = {},
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new AiUnavailableError(
      "OPENROUTER_API_KEY is not set — AI features are disabled in this environment.",
    );
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "Independent Restaurant AI",
      },
      body: JSON.stringify({
        model: opts.model || OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: opts.temperature ?? 0.5,
        max_tokens: opts.maxTokens ?? 1500,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 240)}`);
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned empty content");
    return content;
  } finally {
    clearTimeout(t);
  }
}

/** Convenience: call the LLM and parse the response as JSON in one step. */
export async function callOpenRouterJson<T = any>(
  systemPrompt: string,
  userPrompt: string,
  opts: CallOptions = {},
): Promise<T> {
  const raw = await callOpenRouter(systemPrompt, userPrompt, {
    ...opts,
    jsonMode: opts.jsonMode ?? true,
  });
  return parseAIJson<T>(raw);
}
