import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  managerEndpoint,
  body,
  mutate,
  audit,
  OperationError,
} from "@/lib/operations/core";
const schema = z
  .object({
    customerId: z.string().min(1),
    password: z.string().min(14).max(72),
    identityReviewed: z.literal(true),
  })
  .strict();
export const GET = managerEndpoint(async () =>
  Response.json({
    customers: await prisma.customer.findMany({
      orderBy: { lastName: "asc" },
      take: 500,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userId: true,
      },
    }),
  }),
);
export const POST = managerEndpoint(async (actor, request: Request) => {
  const input = schema.parse(await body(request));
  if (!process.env.NEXTAUTH_SECRET)
    throw new OperationError("Authentication configuration unavailable", 503);
  const passwordHash = await bcrypt.hash(input.password, 12),
    fingerprint = createHmac("sha256", process.env.NEXTAUTH_SECRET)
      .update(input.password)
      .digest("hex");
  return Response.json(
    await mutate(
      actor,
      request,
      "customer.access",
      { customerId: input.customerId, fingerprint },
      async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
        });
        if (!customer?.email)
          throw new OperationError("Customer needs an email address");
        if (customer.userId)
          throw new OperationError(
            "Customer already has an account. Use the account recovery workflow",
            409,
          );
        const email = customer.email.trim().toLowerCase();
        if (await tx.user.count({ where: { email } }))
          throw new OperationError(
            "An account already uses this email. Review ownership before linking it",
            409,
          );
        const user = await tx.user.create({
          data: {
            email,
            name: `${customer.firstName} ${customer.lastName}`,
            password: passwordHash,
            role: "CUSTOMER",
            customerProfile: { connect: { id: customer.id } },
          },
          select: { id: true, email: true, role: true },
        });
        await audit(
          tx,
          actor,
          "CUSTOMER_ACCESS_CREATED",
          "Customer",
          customer.id,
          { userId: user.id, identityReviewed: true },
        );
        return user;
      },
    ),
  );
});
