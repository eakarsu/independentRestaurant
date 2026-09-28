import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_DAYS = 30;

async function handleGET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawDays = Number.parseInt(searchParams.get("days") ?? "", 10);
    const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, rawDays)) : DEFAULT_DAYS;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all staff with their performance data
    const staff = await prisma.staff.findMany({
      where: { status: "ACTIVE" },
      include: {
        performance: {
          where: {
            date: { gte: startDate },
          },
        },
        orders: {
          where: {
            createdAt: { gte: startDate },
          },
          select: {
            total: true,
            tip: true,
            paymentStatus: true,
          },
        },
        tips: {
          where: {
            date: { gte: startDate },
          },
        },
        timeClock: {
          where: {
            clockIn: { gte: startDate },
          },
        },
      },
    });

    const summary = staff.map((s) => {
      const totalOrders = s.orders.length;
      // Money metrics only count orders that were actually paid; cancelled or
      // unpaid orders must not inflate sales.
      const paidOrders = s.orders.filter((o) => o.paymentStatus === "PAID");
      const totalSales = paidOrders.reduce((sum, o) => sum + o.total, 0);
      const totalTips = s.tips.reduce((sum, t) => sum + t.amount, 0);
      const totalHours = s.timeClock.reduce((sum, t) => sum + (t.totalHours || 0), 0);

      // Calculate performance metrics averages
      const metrics: Record<string, { total: number; count: number }> = {};
      s.performance.forEach((p) => {
        if (!metrics[p.metric]) {
          metrics[p.metric] = { total: 0, count: 0 };
        }
        metrics[p.metric].total += p.value;
        metrics[p.metric].count += 1;
      });

      const avgMetrics: Record<string, number> = {};
      Object.entries(metrics).forEach(([key, val]) => {
        avgMetrics[key] = val.count > 0 ? val.total / val.count : 0;
      });

      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        position: s.position,
        totalOrders,
        paidOrders: paidOrders.length,
        totalSales,
        averageOrderValue: paidOrders.length > 0 ? totalSales / paidOrders.length : 0,
        totalTips,
        totalHours,
        salesPerHour: totalHours > 0 ? totalSales / totalHours : 0,
        metrics: avgMetrics,
      };
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error fetching performance summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch performance summary" },
      { status: 500 }
    );
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);
