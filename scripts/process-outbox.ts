import { processNextNotification } from "../src/lib/operations/notifications";
import { processNextOutboxEvent } from "../src/lib/commerce/outbox";
import { releaseExpiredReservations } from "../src/lib/commerce/inventory";
import prisma from "../src/lib/prisma";

async function main() {
  try {
    const result = await processNextOutboxEvent();
    const notification = await processNextNotification();
    const reservations = await releaseExpiredReservations();
    process.stdout.write(`${JSON.stringify({ result, notification, reservations })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
