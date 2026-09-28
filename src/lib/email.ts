/**
 * Email delivery via Resend.
 *
 * Only transactional account email lives here. Order/status messaging goes
 * through the durable notification queue (`src/lib/operations/notifications.ts`),
 * which stores provider receipts and delivery evidence.
 */

import { Resend } from "resend";

// Lazily construct the Resend client. The Resend constructor throws when no API
// key is provided, so instantiating it at module load would crash any route
// that merely imports this file when RESEND_API_KEY is unset.
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@restaurant.example.com";
const RESTAURANT_NAME = process.env.RESTAURANT_NAME ?? "Independent Restaurant";

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resend = getResend();
  if (!resend || !process.env.NEXTAUTH_URL) throw new Error("Password email provider is not configured");
  const url = new URL("/reset-password", process.env.NEXTAUTH_URL);
  url.searchParams.set("token", token);
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `${RESTAURANT_NAME} password reset`,
    text: `Use this one-time link within 30 minutes: ${url.toString()}`,
  });
}
