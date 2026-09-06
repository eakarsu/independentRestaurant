import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "./authz";
import { AuthorizationError } from "./authz";
import { OperationError } from "@/lib/operations/core";
import { settingsSchema } from "@/lib/operations/settings";
export const onlinePolicySchema = z
  .object({
    enabled: z.boolean(),
    noticeMinutes: z.number().int().min(10).max(1440),
    horizonDays: z.number().int().min(1).max(30),
    maxPendingPerCustomer: z.number().int().min(1).max(10),
    reviewed: z.literal(true),
  })
  .strict();
export async function assertOnlineOrder(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: {
    type: string;
    source: string;
    pickupAt?: string;
    expectedTotalCents?: number;
    discountCents: number;
    tableId?: string;
    deliveryAddress?: unknown;
  },
  now = new Date(),
) {
  if (actor.role !== "CUSTOMER")
    throw new AuthorizationError("Customer account required");
  if (
    input.type !== "TAKEOUT" ||
    input.source !== "online" ||
    input.discountCents ||
    input.tableId ||
    input.deliveryAddress ||
    !input.pickupAt ||
    !input.expectedTotalCents
  )
    throw new OperationError(
      "Review a pickup quote before placing an online order",
    );
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`online-order:${actor.userId}`}))`;
  if (
    !(await tx.user.count({
      where: { id: actor.userId, role: "CUSTOMER", isActive: true },
    }))
  )
    throw new AuthorizationError("Account is no longer active");
  if (!(await tx.customer.count({ where: { userId: actor.userId } })))
    throw new OperationError("Customer profile is not connected", 409);
  const row = await tx.settings.findUnique({
      where: { key: "online-ordering" },
    }),
    profileRow = await tx.settings.findUnique({
      where: { key: "restaurant-profile" },
    });
  if (!row || !profileRow)
    throw new OperationError("Online ordering is not configured", 503);
  const policy = onlinePolicySchema.parse(row.value),
    profile = settingsSchema.parse(profileRow.value);
  if (!policy.enabled)
    throw new OperationError("Online ordering is currently closed", 409);
  const pickup = new Date(input.pickupAt);
  if (
    +pickup < +now + policy.noticeMinutes * 60000 ||
    +pickup > +now + policy.horizonDays * 86400000
  )
    throw new OperationError(
      `Choose pickup at least ${policy.noticeMinutes} minutes ahead and within ${policy.horizonDays} days`,
    );
  const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: profile.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(pickup),
    part = (type: string) => parts.find((p) => p.type === type)!.value,
    day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      part("weekday"),
    ),
    local = `${part("hour")}:${part("minute")}`,
    hours = profile.hours.find((h) => h.day === day)!;
  if (hours.closed || local < hours.open || local >= hours.close)
    throw new OperationError("Pickup must be during restaurant opening hours");
  const pending = await tx.order.count({
    where: {
      customer: { userId: actor.userId },
      status: "PENDING",
      source: "online",
    },
  });
  if (pending >= policy.maxPendingPerCustomer)
    throw new OperationError(
      "Wait for the restaurant to review your existing requests before ordering again",
      429,
    );
}
