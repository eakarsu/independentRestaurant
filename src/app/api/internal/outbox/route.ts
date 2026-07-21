import { NextRequest, NextResponse } from "next/server";
import { processNextOutboxEvent } from "@/lib/commerce/outbox";

export async function POST(request: NextRequest) {
  const secret = process.env.INTERNAL_WORKER_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ event: await processNextOutboxEvent() });
}
