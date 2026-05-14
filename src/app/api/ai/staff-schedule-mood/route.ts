// Staff scheduling with mood / fatigue tracking.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const moods: { staffId: string; mood: number; fatigue: number; note?: string; at: Date }[] = []

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { action } = body

  if (action === 'check-in') {
    const { staffId, mood, fatigue, note } = body
    if (!staffId || mood == null) return NextResponse.json({ error: 'staffId and mood required' }, { status: 400 })
    moods.push({ staffId, mood: Math.max(1, Math.min(5, Number(mood))), fatigue: Math.max(1, Math.min(5, Number(fatigue || 1))), note, at: new Date() })
    return NextResponse.json({ ok: true, count: moods.length })
  }

  if (action === 'optimize') {
    const { shifts = [] } = body
    const staff: any[] = await (prisma as any).staff.findMany({ take: 200 }).catch(() => [])
    const load: Record<string, number> = {}
    const assignments: any[] = []
    for (const sh of shifts) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const candidates = staff.filter(s => !sh.role || (s.role === sh.role)).map(s => {
        const recent = moods.filter(m => m.staffId === s.id && +m.at > Date.now() - 7 * 86400000)
        const avgFatigue = recent.length ? recent.reduce((sum, x) => sum + x.fatigue, 0) / recent.length : 1
        const score = 5 - avgFatigue - (load[s.id] || 0) * 0.5
        return { id: s.id, name: s.name, score, avgFatigue }
      }).sort((a, b) => b.score - a.score)
      const best = candidates[0]
      if (best) {
        load[best.id] = (load[best.id] || 0) + 1
        assignments.push({ shiftId: sh.id, staffId: best.id, score: best.score, avgFatigue: best.avgFatigue })
      }
    }
    return NextResponse.json({ assignments, load })
  }

  if (action === 'team-pulse') {
    const last7 = moods.filter(m => +m.at > Date.now() - 7 * 86400000)
    if (!last7.length) return NextResponse.json({ avgMood: null, avgFatigue: null, samples: 0 })
    return NextResponse.json({
      samples: last7.length,
      avgMood: Math.round((last7.reduce((s, x) => s + x.mood, 0) / last7.length) * 10) / 10,
      avgFatigue: Math.round((last7.reduce((s, x) => s + x.fatigue, 0) / last7.length) * 10) / 10
    })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
