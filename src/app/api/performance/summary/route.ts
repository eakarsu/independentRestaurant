import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "30");
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
      const totalSales = s.orders.reduce((sum, o) => sum + o.total, 0);
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
        totalSales,
        averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
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
