// // === Batch 10 Gaps & Frontend Mounts ===
// Batch 10 Gap: "No vendor / supplier procurement AI" (ai-gap) for independentRestaurant
// Mount path: /api/gap-no-vendor-supplier-procurement-ai
import { NextResponse } from 'next/server';

const SLUG = "no-vendor-supplier-procurement-ai";
const LABEL = "No vendor / supplier procurement AI";
const SECTION = "ai-gap";

let _prisma: any = null;
function prismaClient() {
  if (_prisma) return _prisma;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require('@prisma/client');
    _prisma = new PrismaClient();
  } catch {
    _prisma = null;
  }
  return _prisma;
}

let _tableReady = false;
async function ensureTable() {
  if (_tableReady) return true;
  const prisma = prismaClient();
  if (!prisma) return false;
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "gap_features" (
      "id" SERIAL PRIMARY KEY,
      "slug" TEXT NOT NULL,
      "section" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "payload" JSONB,
      "result" JSONB,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    _tableReady = true;
    return true;
  } catch {
    return false;
  }
}

async function callOpenRouter(prompt: string, system?: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku';
  if (!apiKey) return { mocked: true, output: `[mock] ${LABEL}: ${prompt.slice(0, 240)}` };
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        messages: [
          { role: 'system', content: system || `You assist with "${LABEL}" (${SECTION}).` },
          { role: 'user', content: prompt.slice(0, 4000) }
        ]
      })
    });
    if (!resp.ok) return { error: `openrouter ${resp.status}` };
    const json = await resp.json();
    return { output: json.choices?.[0]?.message?.content || '', model };
  } catch (err) {
    return { error: 'openrouter_fetch_failed', detail: String(err).slice(0, 200) };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('history') === '1') {
    const ok = await ensureTable();
    if (!ok) return NextResponse.json({ items: [] });
    try {
      const prisma = prismaClient();
      const rows = await prisma.$queryRawUnsafe(
        'SELECT id, slug, section, label, payload, result, "createdAt" FROM "gap_features" WHERE slug=$1 ORDER BY id DESC LIMIT 25',
        SLUG
      );
      return NextResponse.json({ items: rows });
    } catch {
      return NextResponse.json({ items: [] });
    }
  }
  return NextResponse.json({ slug: SLUG, label: LABEL, section: SECTION });
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const prompt: string = payload.prompt || payload.text || payload.input || `Outline an actionable plan for: ${LABEL}`;
  const ai = await callOpenRouter(prompt, payload.system);
  const ok = await ensureTable();
  if (ok) {
    try {
      const prisma = prismaClient();
      await prisma.$executeRawUnsafe(
        'INSERT INTO "gap_features" ("slug","section","label","payload","result") VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)',
        SLUG, SECTION, LABEL, JSON.stringify(payload), JSON.stringify(ai)
      );
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ slug: SLUG, section: SECTION, label: LABEL, payload, result: ai });
}
