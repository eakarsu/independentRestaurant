import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function handleGET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dataSource = searchParams.get("dataSource") || "orders";
    const columns = searchParams.get("columns")?.split(",") || [];
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const filtersParam = searchParams.get("filters");
    const groupBy = searchParams.get("groupBy");

    let data: any[] = [];

    const dateFilter = startDate && endDate ? {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate + "T23:59:59"),
      }
    } : {};

    switch (dataSource) {
      case "orders":
        const orders = await prisma.order.findMany({
          where: dateFilter,
          include: {
            staff: { select: { firstName: true, lastName: true } },
            table: { select: { number: true } },
          },
          orderBy: { [sortBy]: sortOrder },
          take: 1000,
        });
        data = orders.map(o => ({
          orderNumber: o.orderNumber,
          status: o.status,
          type: o.type,
          total: o.total,
          tip: o.tip,
          createdAt: o.createdAt,
          staff: o.staff ? `${o.staff.firstName} ${o.staff.lastName}` : "-",
          table: o.table?.number || "-",
        }));
        break;

      case "customers":
        const customers = await prisma.customer.findMany({
          include: {
            orders: { select: { total: true } },
            loyaltyPoints: true,
          },
          orderBy: { [sortBy === "totalOrders" || sortBy === "totalSpent" ? "createdAt" : sortBy]: sortOrder },
          take: 1000,
        });
        data = customers.map(c => ({
          name: `${c.firstName} ${c.lastName}`,
          email: c.email || "-",
          phone: c.phone || "-",
          totalOrders: c.orders.length,
          totalSpent: c.orders.reduce((sum, o) => sum + o.total, 0),
          loyalty: c.loyaltyPoints?.tier || "None",
          createdAt: c.createdAt,
        }));
        break;

      case "staff":
        const staffData = await prisma.staff.findMany({
          include: {
            orders: { select: { total: true } },
            tips: { select: { amount: true } },
            timeClock: { select: { totalHours: true } },
          },
          take: 1000,
        });
        data = staffData.map(s => ({
          name: `${s.firstName} ${s.lastName}`,
          position: s.position,
          hourlyRate: s.hourlyRate,
          totalHours: s.timeClock.reduce((sum, t) => sum + (t.totalHours || 0), 0),
          totalSales: s.orders.reduce((sum, o) => sum + o.total, 0),
          totalTips: s.tips.reduce((sum, t) => sum + t.amount, 0),
        }));
        break;

      case "menuItems":
        const menuItems = await prisma.menuItem.findMany({
          include: {
            category: { select: { name: true } },
            orderItems: { select: { quantity: true } },
          },
          take: 1000,
        });
        data = menuItems.map(m => ({
          name: m.name,
          category: m.category.name,
          price: m.price,
          cost: m.cost || 0,
          margin: m.cost ? ((m.price - m.cost) / m.price * 100) : 100,
          orderCount: m.orderItems.reduce((sum, oi) => sum + oi.quantity, 0),
        }));
        break;

      case "inventory":
        const inventory = await prisma.ingredient.findMany({
          include: {
            vendor: { select: { name: true } },
          },
          take: 1000,
        });
        data = inventory.map(i => ({
          name: i.name,
          currentStock: i.currentStock,
          parLevel: i.parLevel,
          reorderPoint: i.reorderPoint,
          cost: i.cost,
          vendor: i.vendor?.name || "-",
        }));
        break;

      case "reservations":
        const reservations = await prisma.reservation.findMany({
          where: startDate && endDate ? {
            date: {
              gte: new Date(startDate),
              lte: new Date(endDate + "T23:59:59"),
            }
          } : {},
          include: {
            table: { select: { number: true } },
          },
          orderBy: { [sortBy === "date" ? "date" : "createdAt"]: sortOrder },
          take: 1000,
        });
        data = reservations.map(r => ({
          customerName: r.customerName,
          partySize: r.partySize,
          date: r.date,
          time: r.time,
          status: r.status,
          table: r.table?.number || "Not assigned",
        }));
        break;
    }

    // Apply filters (basic implementation)
    if (filtersParam) {
      try {
        const filters = JSON.parse(filtersParam) as { field: string; operator: string; value: string }[];
        filters.forEach(filter => {
          data = data.filter(row => {
            const fieldValue = String(row[filter.field] || "").toLowerCase();
            const filterValue = filter.value.toLowerCase();

            switch (filter.operator) {
              case "equals":
                return fieldValue === filterValue;
              case "not_equals":
                return fieldValue !== filterValue;
              case "contains":
                return fieldValue.includes(filterValue);
              case "starts_with":
                return fieldValue.startsWith(filterValue);
              case "greater_than":
                return parseFloat(fieldValue) > parseFloat(filterValue);
              case "less_than":
                return parseFloat(fieldValue) < parseFloat(filterValue);
              default:
                return true;
            }
          });
        });
      } catch (e) {
        console.error("Error parsing filters:", e);
      }
    }

    // Filter columns if specified
    if (columns.length > 0) {
      data = data.map(row => {
        const filtered: Record<string, unknown> = {};
        columns.forEach(col => {
          if (col in row) {
            filtered[col] = row[col];
          }
        });
        return filtered;
      });
    }

    // Group if specified
    if (groupBy && groupBy !== "none") {
      const grouped: Record<string, unknown[]> = {};
      data.forEach(row => {
        const key = String(row[groupBy] || "Unknown");
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      });

      return NextResponse.json({
        data: data,
        grouped: Object.entries(grouped).map(([key, items]) => ({
          groupKey: key,
          count: items.length,
          items,
        })),
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error generating custom report:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);
