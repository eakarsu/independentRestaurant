import { NextRequest, NextResponse } from "next/server";

type Reservation = {
  time?: string;
  partySize?: number;
  channel?: string;
};

function num(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const seats = Math.max(1, num(body.seats, 72));
  const averageTurnMinutes = Math.max(25, num(body.averageTurnMinutes, 78));
  const walkInDemand = Math.max(0, num(body.walkInDemand, 38));
  const reservations: Reservation[] = Array.isArray(body.reservations)
    ? body.reservations
    : [
        { time: "18:00", partySize: 4, channel: "phone" },
        { time: "18:30", partySize: 2, channel: "web" },
        { time: "19:00", partySize: 6, channel: "web" },
      ];

  const reservedCovers = reservations.reduce((sum, r) => sum + num(r.partySize, 2), 0);
  const turnsAvailable = Math.max(1, Math.floor((4 * 60) / averageTurnMinutes));
  const dinnerCapacity = seats * turnsAvailable;
  const demand = Math.round(reservedCovers + walkInDemand);
  const utilization = Math.min(1.35, demand / dinnerCapacity);
  const waitMinutes = utilization > 1 ? Math.round((utilization - 1) * averageTurnMinutes) : Math.round(utilization * 12);
  const holdbackSeats = Math.max(4, Math.round(seats * (utilization > 0.9 ? 0.08 : 0.14)));

  return NextResponse.json({
    dinnerCapacity,
    reservedCovers,
    demand,
    utilization: Number((utilization * 100).toFixed(1)),
    waitMinutes,
    holdbackSeats,
    recommendations: [
      utilization > 1 ? "Move large parties to a fixed seating window and cap walk-ins early." : "Keep host stand flexible for walk-ins.",
      waitMinutes > 20 ? "Send pre-arrival texts with bar seating and pickup alternatives." : "Offer same-night waitlist conversion for nearby guests.",
      `Hold ${holdbackSeats} seats for recovery from late turns and VIP arrivals.`,
    ],
  });
}
