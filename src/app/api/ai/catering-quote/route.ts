// Catering quote agent with menu recommendation + logistics.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'

const hasKey = !!process.env.OPENROUTER_API_KEY
const openai = hasKey ? new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
}) : null
const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!openai) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  const { eventType, guestCount, dietaryNotes, budgetUSD, deliveryAddress } = await req.json()
  if (!eventType || !guestCount) return NextResponse.json({ error: 'eventType and guestCount required' }, { status: 400 })

  const menu: any[] = await (prisma as any).menuItem.findMany({ take: 60 }).catch(() => [])

  const r = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a catering specialist. Return JSON {"package_name":string,"items":[{"name":string,"qty":number,"unitPrice":number}],"totalUSD":number,"logistics":{"staff_required":number,"delivery_window":string,"setup_minutes":number},"notes":string}.'
      },
      {
        role: 'user',
        content: `Event: ${eventType}\nGuests: ${guestCount}\nDietary: ${dietaryNotes || 'none'}\nBudget: ${budgetUSD || 'flexible'}\nDelivery: ${deliveryAddress || 'TBD'}\nMenu: ${menu.map((m: any) => `${m.name} ($${m.price})`).slice(0, 30).join(', ')}`
      }
    ],
    max_tokens: 1200
  })
  let parsed: any
  try { parsed = JSON.parse(r.choices[0].message.content!.match(/\{[\s\S]*\}/)![0]) }
  catch { parsed = { raw: r.choices[0].message.content } }
  return NextResponse.json(parsed)
}
