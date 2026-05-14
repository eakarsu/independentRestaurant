// Voice ordering (phone + drive-thru kiosk) routed to kitchen.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Sess = { id: string; transcript: { role: 'user' | 'assistant'; text: string }[]; cart: any[] }
const sessions = new Map<string, Sess>()

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022'

async function ai(messages: any[], max = 300) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_tokens: max, temperature: 0.4 })
  })
  const d = await r.json()
  return d.choices?.[0]?.message?.content || ''
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { action } = body
  if (action === 'start') {
    const id = `vo_${Date.now()}`
    sessions.set(id, { id, transcript: [], cart: [] })
    return NextResponse.json({ sessionId: id })
  }
  if (action === 'utterance') {
    if (!OPENROUTER_API_KEY) return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 503 })
    const s = sessions.get(body.sessionId)
    if (!s) return NextResponse.json({ error: 'session not found' }, { status: 404 })
    const menu: any[] = await (prisma as any).menuItem.findMany({ take: 50 }).catch(() => [])
    s.transcript.push({ role: 'user', text: body.text })
    const reply = await ai([
      { role: 'system', content: `You are a friendly restaurant voice agent. Menu: ${menu.map((m: any) => `${m.name} ($${m.price})`).slice(0, 30).join(', ')}. Reply in <=2 sentences.` },
      ...s.transcript.slice(-6).map(t => ({ role: t.role, content: t.text }))
    ])
    s.transcript.push({ role: 'assistant', text: reply })
    return NextResponse.json({ reply })
  }
  if (action === 'finalize') {
    const s = sessions.get(body.sessionId)
    if (!s) return NextResponse.json({ error: 'session not found' }, { status: 404 })
    let orderId: string | null = null
    try {
      const o: any = await (prisma as any).order.create({
        data: { source: 'voice', status: 'PENDING', total: body.totalUSD || 0 }
      })
      orderId = o.id
    } catch {}
    return NextResponse.json({ orderId, cart: s.cart })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
