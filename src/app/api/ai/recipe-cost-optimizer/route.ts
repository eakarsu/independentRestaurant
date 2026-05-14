// Recipe cost optimizer recalculating margins as ingredient prices move.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { action } = body

  if (action === 'analyze') {
    const recipes: any[] = await (prisma as any).recipe.findMany({ take: 100 }).catch(() => [])
    const ingredients: any[] = await (prisma as any).ingredient.findMany({ take: 500 }).catch(() => [])
    const ingByName: Record<string, any> = {}
    for (const i of ingredients) ingByName[(i.name || '').toLowerCase()] = i

    const analyzed = recipes.map((r: any) => {
      let totalCost = 0
      for (const item of r.ingredients || []) {
        const ing = ingByName[String(item.name || '').toLowerCase()]
        if (ing) totalCost += (ing.unitCostUSD || 0) * (item.qty || 1)
      }
      const sellPrice = Number(r.price || 0)
      const margin = sellPrice ? (sellPrice - totalCost) / sellPrice : null
      return {
        id: r.id,
        name: r.name,
        cost: Math.round(totalCost * 100) / 100,
        price: sellPrice,
        marginPct: margin != null ? Math.round(margin * 100) : null,
        flagged: margin != null && margin < 0.6
      }
    })
    return NextResponse.json({ count: analyzed.length, recipes: analyzed.sort((a, b) => (a.marginPct ?? 100) - (b.marginPct ?? 100)) })
  }

  if (action === 'simulate-price-change') {
    const { ingredientName, deltaPct = 10 } = body
    if (!ingredientName) return NextResponse.json({ error: 'ingredientName required' }, { status: 400 })
    const recipes: any[] = await (prisma as any).recipe.findMany({ take: 100 }).catch(() => [])
    const ing: any = await (prisma as any).ingredient.findFirst({ where: { name: ingredientName } }).catch(() => null)
    if (!ing) return NextResponse.json({ error: 'ingredient not found' }, { status: 404 })
    const newUnit = ing.unitCostUSD * (1 + deltaPct / 100)
    const impacted: any[] = []
    for (const r of recipes) {
      const item = (r.ingredients || []).find((x: any) => String(x.name || '').toLowerCase() === ingredientName.toLowerCase())
      if (item) {
        const oldCost = (ing.unitCostUSD || 0) * (item.qty || 1)
        const newCost = newUnit * (item.qty || 1)
        impacted.push({ recipeId: r.id, name: r.name, oldCost, newCost, deltaUSD: Math.round((newCost - oldCost) * 100) / 100 })
      }
    }
    return NextResponse.json({ ingredient: ingredientName, deltaPct, impacted })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
