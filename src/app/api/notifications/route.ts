import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const channel = searchParams.get("channel");
    const limit = searchParams.get("limit") || "50";

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (channel) where.channel = channel;

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, channel, recipient, subject, message, metadata } = body;

    // Create the notification
    const notification = await prisma.notification.create({
      data: {
        type,
        channel,
        recipient,
        subject,
        message,
        metadata,
        status: "PENDING",
      },
    });

    // Simulate sending the notification (in production, integrate with Twilio/SendGrid)
    // For now, we'll just mark it as sent after a short delay
    setTimeout(async () => {
      try {
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
          },
        });
        // Simulate delivery confirmation
        setTimeout(async () => {
          try {
            await prisma.notification.update({
              where: { id: notification.id },
              data: {
                status: "DELIVERED",
                deliveredAt: new Date(),
              },
            });
          } catch (e) {
            console.error("Error updating delivery status:", e);
          }
        }, 2000);
      } catch (e) {
        console.error("Error updating sent status:", e);
      }
    }, 1000);

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error("Error creating notification:", error);
    return NextResponse.json(
      { error: "Failed to create notification" },
      { status: 500 }
    );
  }
}
