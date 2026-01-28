import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET split checks for an order
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const splitChecks = await prisma.splitCheck.findMany({
      where: { orderId: params.id },
      include: {
        items: {
          include: {
            orderItem: {
              include: {
                menuItem: true,
              },
            },
          },
        },
        payments: true,
      },
      orderBy: { guestNumber: "asc" },
    });

    return NextResponse.json(splitChecks);
  } catch (error) {
    console.error("Error fetching split checks:", error);
    return NextResponse.json(
      { error: "Failed to fetch split checks" },
      { status: 500 }
    );
  }
}

// POST create split checks for an order
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { splitType, numberOfGuests, assignments } = body;

    // Get the order with items
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: {
          include: { menuItem: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Delete any existing split checks
    await prisma.splitCheckItem.deleteMany({
      where: { splitCheck: { orderId: params.id } },
    });
    await prisma.splitCheck.deleteMany({
      where: { orderId: params.id },
    });

    const taxRate = order.tax / order.subtotal;
    const splitChecks = [];

    if (splitType === "even") {
      // Split evenly among guests
      const perGuestSubtotal = order.subtotal / numberOfGuests;
      const perGuestTax = order.tax / numberOfGuests;
      const perGuestTotal = order.total / numberOfGuests;

      for (let i = 1; i <= numberOfGuests; i++) {
        const splitCheck = await prisma.splitCheck.create({
          data: {
            orderId: params.id,
            guestNumber: i,
            guestName: `Guest ${i}`,
            subtotal: perGuestSubtotal,
            tax: perGuestTax,
            total: perGuestTotal,
          },
        });

        // Assign items evenly (distribute items round-robin style)
        for (let j = 0; j < order.items.length; j++) {
          const item = order.items[j];
          if ((j % numberOfGuests) + 1 === i) {
            await prisma.splitCheckItem.create({
              data: {
                splitCheckId: splitCheck.id,
                orderItemId: item.id,
                quantity: item.quantity,
                amount: item.totalPrice,
              },
            });
          }
        }

        splitChecks.push(splitCheck);
      }
    } else if (splitType === "byItem") {
      // Split by item assignments
      // assignments: { guestNumber: number, items: { orderItemId: string, quantity: number }[] }[]
      for (const assignment of assignments) {
        let subtotal = 0;
        const items = [];

        for (const itemAssignment of assignment.items) {
          const orderItem = order.items.find(
            (i) => i.id === itemAssignment.orderItemId
          );
          if (orderItem) {
            const amount =
              (orderItem.unitPrice * itemAssignment.quantity);
            subtotal += amount;
            items.push({
              orderItemId: itemAssignment.orderItemId,
              quantity: itemAssignment.quantity,
              amount,
            });
          }
        }

        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        const splitCheck = await prisma.splitCheck.create({
          data: {
            orderId: params.id,
            guestNumber: assignment.guestNumber,
            guestName: assignment.guestName || `Guest ${assignment.guestNumber}`,
            subtotal,
            tax,
            total,
            items: {
              create: items,
            },
          },
        });

        splitChecks.push(splitCheck);
      }
    }

    // Fetch the complete split checks with items
    const completeSplitChecks = await prisma.splitCheck.findMany({
      where: { orderId: params.id },
      include: {
        items: {
          include: {
            orderItem: {
              include: { menuItem: true },
            },
          },
        },
      },
      orderBy: { guestNumber: "asc" },
    });

    return NextResponse.json(completeSplitChecks);
  } catch (error) {
    console.error("Error creating split checks:", error);
    return NextResponse.json(
      { error: "Failed to create split checks" },
      { status: 500 }
    );
  }
}

// PUT pay a split check
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { splitCheckId, paymentMethod, tip } = body;

    const splitCheck = await prisma.splitCheck.findUnique({
      where: { id: splitCheckId },
    });

    if (!splitCheck) {
      return NextResponse.json(
        { error: "Split check not found" },
        { status: 404 }
      );
    }

    const totalWithTip = splitCheck.total + (tip || 0);

    // Update the split check
    const updatedSplitCheck = await prisma.splitCheck.update({
      where: { id: splitCheckId },
      data: {
        isPaid: true,
        paidAt: new Date(),
        paymentMethod,
        tip: tip || 0,
        total: totalWithTip,
      },
    });

    // Create a payment record
    await prisma.payment.create({
      data: {
        orderId: params.id,
        amount: totalWithTip,
        method: paymentMethod,
        splitCheckId: splitCheckId,
      },
    });

    // Check if all split checks are paid
    const allSplitChecks = await prisma.splitCheck.findMany({
      where: { orderId: params.id },
    });

    const allPaid = allSplitChecks.every((sc) => sc.isPaid);

    if (allPaid) {
      // Update order payment status
      await prisma.order.update({
        where: { id: params.id },
        data: { paymentStatus: "PAID" },
      });
    } else {
      // Partial payment
      await prisma.order.update({
        where: { id: params.id },
        data: { paymentStatus: "PARTIAL" },
      });
    }

    return NextResponse.json(updatedSplitCheck);
  } catch (error) {
    console.error("Error paying split check:", error);
    return NextResponse.json(
      { error: "Failed to pay split check" },
      { status: 500 }
    );
  }
}

// DELETE remove split checks
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.splitCheckItem.deleteMany({
      where: { splitCheck: { orderId: params.id } },
    });
    await prisma.splitCheck.deleteMany({
      where: { orderId: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting split checks:", error);
    return NextResponse.json(
      { error: "Failed to delete split checks" },
      { status: 500 }
    );
  }
}
