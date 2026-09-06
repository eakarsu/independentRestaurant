import prisma from "@/lib/prisma";
import { onlinePolicySchema } from "@/lib/commerce/online-policy";
import { settingsSchema } from "@/lib/operations/settings";
export async function GET() {
  const [policyRow, profileRow] = await Promise.all([
    prisma.settings.findUnique({ where: { key: "online-ordering" } }),
    prisma.settings.findUnique({ where: { key: "restaurant-profile" } }),
  ]);
  const policy = policyRow ? onlinePolicySchema.parse(policyRow.value) : null,
    profile = profileRow ? settingsSchema.parse(profileRow.value) : null;
  if (!policy?.enabled || !profile)
    return Response.json({
      available: false,
      message: "Online ordering is currently closed.",
    });
  const menu = await prisma.menuItem.findMany({
    where: { isAvailable: true, is86d: false },
    orderBy: { name: "asc" },
    take: 300,
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      allergens: true,
      category: { select: { name: true } },
      modifierGroups: {
        select: {
          modifierGroup: {
            select: {
              id: true,
              name: true,
              required: true,
              minSelect: true,
              maxSelect: true,
              modifiers: {
                where: { isAvailable: true },
                select: { id: true, name: true, priceAdjustment: true },
              },
            },
          },
        },
      },
    },
  });
  return Response.json(
    {
      available: true,
      policy,
      restaurant: {
        name: profile.name,
        address: profile.address,
        phone: profile.phone,
        timezone: profile.timezone,
        hours: profile.hours,
      },
      menu,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
