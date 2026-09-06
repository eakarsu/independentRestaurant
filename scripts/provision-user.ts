import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../src/lib/prisma";

const disposableProvision = process.env.ALLOW_DISPOSABLE_SEED === "YES";
if (process.env.ALLOW_USER_PROVISION !== "1" && !disposableProvision) throw new Error("Set ALLOW_USER_PROVISION=1 for this explicit operation");
const input = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  name: z.string().min(1),
  password: z.string().min(14),
  role: z.enum(["ADMIN", "MERCHANT", "MANAGER", "OPERATOR", "STAFF", "HOST", "CHEF", "CUSTOMER"]),
}).parse({
  email: process.env.PROVISION_USER_EMAIL || process.env.PROVISION_ADMIN_EMAIL || process.env.ADMIN_EMAIL,
  name: process.env.PROVISION_USER_NAME || process.env.PROVISION_ADMIN_NAME || process.env.BOOTSTRAP_ADMIN_NAME,
  password: process.env.PROVISION_USER_PASSWORD || process.env.PROVISION_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD,
  role: process.env.PROVISION_USER_ROLE || (disposableProvision ? "ADMIN" : undefined),
});

async function main() {
  try {
    if (process.env.PROVISION_SKIP_EXISTING === "1") {
      const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (existing) { process.stdout.write("Existing administrator preserved\n"); return; }
    }
    const password = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.upsert({
      where: { email: input.email },
      create: { ...input, password },
      update: { name: input.name, role: input.role, password, isActive: true, authVersion: { increment: 1 } },
      select: { id: true, email: true, role: true },
    });
    process.stdout.write(`${JSON.stringify(user)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
