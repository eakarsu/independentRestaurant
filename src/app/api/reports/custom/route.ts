import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Sort keys that map 1:1 to Prisma columns per data source. Derived UI-only
 * columns (margin, orderCount, staff, table, totalSpent, ...) are deliberately
 * absent so an invalid sortBy returns 400 instead of crashing Prisma with a 500.
 */
const SORTABLE_FIELDS: Record<string, readonly string[]> = {
  orders: [
    "orderNumber",
    "status",
    "type",
    "total",
    "subtotal",
    "tax",
    "discount",
    "tip",
    "paymentStatus",
    "createdAt",
    "updatedAt",
  ],
  customers: ["firstName", "lastName", "email", "phone", "address", "vipStatus", "createdAt", "updatedAt"],
  staff: ["firstName", "lastName", "position", "hourlyRate", "status", "hireDate", "createdAt", "updatedAt"],
  menuItems: [
    "name",
    "price",
    "cost",
    "isAvailable",
    "is86d",
    "isSpecial",
    "calories",
    "prepTime",
    "createdAt",
    "updatedAt",
  ],
  inventory: ["name", "currentStock", "parLevel", "reorderPoint", "cost", "vendorId", "createdAt", "updatedAt"],
  reservations: ["customerName", "partySize", "date", "time", "status", "tableId", "createdAt", "updatedAt"],
};

async function handleGET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dataSource = searchParams.get("dataSource") || "orders";
    const columns = searchParams.get("columns")?.split(",") || [];
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrderParam = searchParams.get("sortOrder") || "desc";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const filtersParam = searchParams.get("filters");
    const groupBy = searchParams.get("groupBy");

    if (sortOrderParam !== "asc" && sortOrderParam !== "desc") {
      return NextResponse.json({ error: "sortOrder must be 'asc' or 'desc'" }, { status: 400 });
    }
    const sortOrder = sortOrderParam;

    const sortableFields = Object.prototype.hasOwnProperty.call(SORTABLE_FIELDS, dataSource)
      ? SORTABLE_FIELDS[dataSource]
      : undefined;
    if (!sortableFields) {
      return NextResponse.json({ error: `Unknown data source: ${dataSource}` }, { status: 400 });
    }
    if (!sortableFields.includes(sortBy)) {
      return NextResponse.json(
        { error: `Invalid sortBy '${sortBy}' for ${dataSource}. Allowed: ${sortableFields.join(", ")}` },
        { status: 400 },
      );
    }

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59`) : null;
    if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
      return NextResponse.json({ error: "startDate and endDate must be valid dates" }, { status: 400 });
    }
    const dateRange = start && end ? { gte: start, lte: end } : null;

    let data: any[] = [];

    switch (dataSource) {
      case "orders": {
        // Orders carry createdAt, so the reporting period filters them directly.
        const orders = await prisma.order.findMany({
          where: dateRange ? { createdAt: dateRange } : {},
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
      }

      case "customers": {
        // Customers are filtered by their own createdAt. The nested orders and
        // loyalty aggregates are lifetime values, not a dated data source.
        const customers = await prisma.customer.findMany({
          where: dateRange ? { createdAt: dateRange } : {},
          include: {
            orders: { select: { total: true } },
            loyaltyPoints: true,
          },
          orderBy: { [sortBy]: sortOrder },
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
      }

      case "staff": {
        // Staff rows persist across periods, so they are not filtered by their
        // own timestamps; the hours/tips/sales they carry are filtered by the
        // date columns on those related records.
        const staffData = await prisma.staff.findMany({
          include: {
            orders: {
              where: dateRange ? { createdAt: dateRange } : {},
              select: { total: true },
            },
            tips: {
              where: dateRange ? { date: dateRange } : {},
              select: { amount: true },
            },
            timeClock: {
              where: dateRange ? { clockIn: dateRange } : {},
              select: { totalHours: true },
            },
          },
          orderBy: { [sortBy]: sortOrder },
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
      }

      case "menuItems": {
        // Menu items carry createdAt; orderItems have dates too but are only
        // aggregated here, so orderCount remains a lifetime count.
        const menuItems = await prisma.menuItem.findMany({
          where: dateRange ? { createdAt: dateRange } : {},
          include: {
            category: { select: { name: true } },
            orderItems: { select: { quantity: true } },
          },
          orderBy: { [sortBy]: sortOrder },
          take: 1000,
        });
        data = menuItems.map(m => ({
          name: m.name,
          category: m.category.name,
          price: m.price,
          cost: m.cost || 0,
          // Unknown cost is not a 100% margin; report it as null.
          margin: m.cost != null && m.price > 0 ? ((m.price - m.cost) / m.price) * 100 : null,
          orderCount: m.orderItems.reduce((sum, oi) => sum + oi.quantity, 0),
        }));
        break;
      }

      case "inventory": {
        // Ingredient has both createdAt and updatedAt; filter by createdAt.
        const inventory = await prisma.ingredient.findMany({
          where: dateRange ? { createdAt: dateRange } : {},
          include: {
            vendor: { select: { name: true } },
          },
          orderBy: { [sortBy]: sortOrder },
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
      }

      case "reservations": {
        // Reservations expose a "date" column; filter by the reservation date.
        const reservations = await prisma.reservation.findMany({
          where: dateRange ? { date: dateRange } : {},
          include: {
            table: { select: { number: true } },
          },
          orderBy: { [sortBy]: sortOrder },
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
