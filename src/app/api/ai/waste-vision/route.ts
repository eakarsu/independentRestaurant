// Vision-based food-waste tracker (camera at bus tubs).
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import OpenAI from 'openai'

const hasKey = !!process.env.OPENROUTER_API_KEY
const openai = hasKey ? new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
}) : null
const MODEL = process.env.OPENROUTER_VISION_MODEL || 'anthropic/claude-3-5-sonnet-20241022'

const events: any[] = []

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!openai) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  const { imageUrl, location } = await req.json()
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 })

  const r = await openai.chat.completions.create({
    model: MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Estimate food waste in this bus tub photo. Return JSON {"itemsLeft":[{"item":string,"approxGrams":number}],"totalGramsWasted":number,"likely_cause":string}.' },
        { type: 'image_url', image_url: { url: imageUrl } }
      ] as any
    }],
    max_tokens: 600,
    temperature: 0.2
  })
  let parsed: any
  try { parsed = JSON.parse(r.choices[0].message.content!.match(/\{[\s\S]*\}/)![0]) }
  catch { parsed = { raw: r.choices[0].message.content } }
  events.push({ at: new Date(), location, ...parsed })
  return NextResponse.json(parsed)
}

export async function GET() {
  return NextResponse.json({ count: events.length, recent: events.slice(-50) })
}
