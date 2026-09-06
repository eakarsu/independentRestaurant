import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  managerEndpoint,
  body,
  mutate,
  audit,
  json,
  OperationError,
} from "@/lib/operations/core";
import { onlinePolicySchema } from "@/lib/commerce/online-policy";
export const GET = managerEndpoint(async () => {
  const row = await prisma.settings.findUnique({
    where: { key: "online-ordering" },
  });
  return Response.json({
    value: row?.value || {
      enabled: false,
      noticeMinutes: 30,
      horizonDays: 7,
      maxPendingPerCustomer: 3,
      reviewed: true,
    },
    updatedAt: row?.updatedAt || null,
  });
});
export const PUT = managerEndpoint(async (actor, request: Request) => {
  const input = z
    .object({
      value: onlinePolicySchema,
      updatedAt: z.string().datetime().nullable(),
    })
    .strict()
    .parse(await body(request));
  return Response.json(
    await mutate(actor, request, "online.settings", input, async (tx) => {
      const old = await tx.settings.findUnique({
        where: { key: "online-ordering" },
      });
      if ((old?.updatedAt.toISOString() || null) !== input.updatedAt)
        throw new OperationError(
          "Settings changed. Refresh before saving",
          409,
        );
      if (input.value.enabled) {
        if (
          !(await tx.settings.count({ where: { key: "restaurant-profile" } }))
        )
          throw new OperationError("Save restaurant hours and profile first");
        if (!process.env.TAX_RATE_BPS && !process.env.TAX_PROVIDER_URL)
          throw new OperationError(
            "Explicit tax configuration is required before enabling ordering",
          );
      }
      const saved = await tx.settings.upsert({
        where: { key: "online-ordering" },
        create: { key: "online-ordering", value: json(input.value) },
        update: { value: json(input.value) },
      });
      await audit(
        tx,
        actor,
        "ONLINE_ORDERING_CONFIGURED",
        "Settings",
        saved.id,
        input.value,
      );
      return { value: saved.value, updatedAt: saved.updatedAt };
    }),
  );
});
