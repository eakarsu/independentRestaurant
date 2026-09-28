import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { restaurantSettings } from "@/lib/operations/settings";
import { dateInZone, zonedMidnight } from "@/lib/operations/time";

async function handleGET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");

    const location = await prisma.location.findFirst({
      where: { isPrimary: true, isActive: true },
      select: { timezone: true },
    });
    const profile = await restaurantSettings();
    const timezone =
      profile.value?.timezone ||
      location?.timezone ||
      process.env.RESTAURANT_TIMEZONE ||
      "America/New_York";

    const startDay = dateInZone(startParam ? new Date(startParam) : new Date(), timezone);
    const endDay = dateInZone(endParam ? new Date(endParam) : new Date(), timezone);
    const afterEnd = new Date(`${endDay}T12:00:00Z`);
    afterEnd.setUTCDate(afterEnd.getUTCDate() + 1);
    const start = zonedMidnight(startDay, timezone);
    const end = zonedMidnight(afterEnd.toISOString().slice(0, 10), timezone);

    // Only orders with captured money count as sales. Refunds are subtracted
    // from captured payments so this is a net figure, not a gross billing total.
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] },
      },
      include: {
        items: {
          include: { menuItem: true },
        },
      },
    });

    const [payments, refunds] = await Promise.all([
      prisma.payment.findMany({
        where: { createdAt: { gte: start, lt: end }, status: "completed" },
        select: { amount: true },
      }),
      prisma.refund.findMany({
        where: { status: "SUCCEEDED", completedAt: { gte: start, lt: end } },
        select: { amountCents: true },
      }),
    ]);
    const grossRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const refundTotal = refunds.reduce((sum, r) => sum + r.amountCents, 0) / 100;

    // Calculate metrics
    const totalOrders = orders.length;
    const totalRevenue = grossRevenue - refundTotal;
    const totalTax = orders.reduce((sum, o) => sum + o.tax, 0);
    const totalTips = orders.reduce((sum, o) => sum + o.tip, 0);
    const totalDiscount = orders.reduce((sum, o) => sum + o.discount, 0);
    const avgOrderValue = totalOrders > 0 ? grossRevenue / totalOrders : 0;

    // Top selling items
    const itemSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const key = item.menuItemId;
        if (!itemSales[key]) {
          itemSales[key] = { name: item.menuItem.name, quantity: 0, revenue: 0 };
        }
        itemSales[key].quantity += item.quantity;
        itemSales[key].revenue += item.totalPrice;
      });
    });

    const topItems = Object.values(itemSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Hourly breakdown, bucketed in the restaurant's timezone.
    const hourFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    });
    const hourlyBreakdown: Record<number, { orders: number; revenue: number }> = {};
    for (let i = 0; i < 24; i++) {
      hourlyBreakdown[i] = { orders: 0, revenue: 0 };
    }
    orders.forEach((order) => {
      const hour = Number(hourFormatter.format(new Date(order.createdAt))) % 24;
      hourlyBreakdown[hour].orders += 1;
      hourlyBreakdown[hour].revenue += order.total;
    });

    // Order types breakdown
    const orderTypes: Record<string, number> = {};
    orders.forEach((order) => {
      orderTypes[order.type] = (orderTypes[order.type] || 0) + 1;
    });

    // Payment methods breakdown
    const paymentMethods: Record<string, number> = {};
    orders
      .filter((o) => o.paymentMethod)
      .forEach((order) => {
        const method = order.paymentMethod || "unknown";
        paymentMethods[method] = (paymentMethods[method] || 0) + 1;
      });

    return NextResponse.json({
      period: { start, end, timezone },
      summary: {
        totalOrders,
        totalRevenue,
        totalTax,
        totalTips,
        totalDiscount,
        avgOrderValue,
        grossRevenue,
        refunds: refundTotal,
      },
      topItems,
      hourlyBreakdown,
      orderTypes,
      paymentMethods,
    });
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);
