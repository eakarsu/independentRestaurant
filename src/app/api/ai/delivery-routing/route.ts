// Delivery driver routing + customer matching (nearest-neighbour TSP).
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

type Stop = { id: string; lat: number; lng: number; orderId?: string }

function distKm(a: Stop, b: Stop) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

function nearestNeighbour(origin: Stop, stops: Stop[]): { order: Stop[]; totalKm: number } {
  const remaining = [...stops]
  const route: Stop[] = []
  let current = origin
  let totalKm = 0
  while (remaining.length) {
    let bestI = 0, bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = distKm(current, remaining[i])
      if (d < bestD) { bestD = d; bestI = i }
    }
    totalKm += bestD
    current = remaining[bestI]
    route.push(current)
    remaining.splice(bestI, 1)
  }
  return { order: route, totalKm: Number(totalKm.toFixed(2)) }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { origin, stops, drivers = [] } = await req.json()
  if (!origin || !Array.isArray(stops) || !stops.length) {
    return NextResponse.json({ error: 'origin and stops[] required' }, { status: 400 })
  }

  if (!drivers.length) {
    const route = nearestNeighbour(origin, stops)
    return NextResponse.json({ singleDriverRoute: route })
  }

  const stopsPerDriver = Math.ceil(stops.length / drivers.length)
  const assignments: any[] = []
  let idx = 0
  for (const d of drivers) {
    const chunk = stops.slice(idx, idx + stopsPerDriver)
    idx += stopsPerDriver
    const route = nearestNeighbour(origin, chunk)
    assignments.push({ driverId: d.id, route: route.order, totalKm: route.totalKm })
  }
  return NextResponse.json({ assignments })
}
