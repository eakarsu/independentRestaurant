import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

async function handleGET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "daily";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    // Get orders for the period
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        status: { not: "CANCELLED" },
      },
      include: {
        items: {
          include: { menuItem: true },
        },
      },
    });

    // Calculate metrics
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const totalTax = orders.reduce((sum, o) => sum + o.tax, 0);
    const totalTips = orders.reduce((sum, o) => sum + o.tip, 0);
    const totalDiscount = orders.reduce((sum, o) => sum + o.discount, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

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

    // Hourly breakdown
    const hourlyBreakdown: Record<number, { orders: number; revenue: number }> = {};
    for (let i = 0; i < 24; i++) {
      hourlyBreakdown[i] = { orders: 0, revenue: 0 };
    }
    orders.forEach((order) => {
      const hour = new Date(order.createdAt).getHours();
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
      period: { start, end },
      summary: {
        totalOrders,
        totalRevenue,
        totalTax,
        totalTips,
        totalDiscount,
        avgOrderValue,
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
