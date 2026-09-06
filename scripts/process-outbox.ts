import { processNextNotification } from "../src/lib/operations/notifications";
import { processNextOutboxEvent } from "../src/lib/commerce/outbox";
import prisma from "../src/lib/prisma";

try {
  const result = await processNextOutboxEvent();
  process.stdout.write(`${JSON.stringify({ result, notification: await processNextNotification() })}\n`);
} finally {
  await prisma.$disconnect();
}
