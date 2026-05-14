/**
 * Email notifications via Resend.
 *
 * Sends:
 *   - Order confirmation when an order is placed
 *   - Ready-for-pickup notification when order moves to READY status
 *
 * Add RESEND_API_KEY and RESEND_FROM_EMAIL to your .env file.
 * Sign up at https://resend.com (free tier: 100 emails/day, 3000/month).
 */

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@restaurant.example.com";
const RESTAURANT_NAME = process.env.RESTAURANT_NAME ?? "Independent Restaurant";

export interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  type: string; // DINE_IN | TAKEOUT | DELIVERY
  notes?: string;
}

/**
 * Send an order confirmation email immediately after order creation.
 */
export async function sendOrderConfirmationEmail(data: OrderEmailData): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not set — skipping order confirmation email");
    return;
  }

  const itemsHtml = data.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:4px 8px;">${item.quantity}x ${item.name}</td>
          <td style="padding:4px 8px; text-align:right;">$${(item.unitPrice * item.quantity).toFixed(2)}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">${RESTAURANT_NAME} — Order Confirmed</h2>
      <p>Hi ${data.customerName},</p>
      <p>Thank you for your order! Here's your confirmation:</p>

      <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Order #${data.orderNumber}</strong></p>
        <p>Type: ${data.type.replace("_", " ")}</p>
        ${data.notes ? `<p>Notes: ${data.notes}</p>` : ""}
      </div>

      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="padding:8px; text-align:left;">Item</th>
            <th style="padding:8px; text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot>
          <tr>
            <td style="padding:8px; font-weight:bold;">Total</td>
            <td style="padding:8px; text-align:right; font-weight:bold;">$${data.total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>

      <p style="margin-top: 24px; color: #666;">
        We'll notify you when your order is ready. Thank you for dining with us!
      </p>
      <p style="color: #666;">— The ${RESTAURANT_NAME} Team</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: `Order Confirmed — #${data.orderNumber} | ${RESTAURANT_NAME}`,
      html,
    });
    console.log(`[Email] Confirmation sent for order #${data.orderNumber}`);
  } catch (err) {
    // Log but don't throw — email failure should not break order creation
    console.error("[Email] Failed to send order confirmation:", err);
  }
}

/**
 * Send a ready-for-pickup notification when order status changes to READY.
 */
export async function sendOrderReadyEmail(data: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  type: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not set — skipping order-ready email");
    return;
  }

  const message =
    data.type === "DELIVERY"
      ? "Your order is on its way! Our driver will arrive shortly."
      : data.type === "TAKEOUT"
      ? "Your order is ready for pickup! Please come to the counter."
      : "Your order is ready at the table!";

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #22c55e;">${RESTAURANT_NAME} — Your Order is Ready!</h2>
      <p>Hi ${data.customerName},</p>
      <p>${message}</p>
      <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin:0;"><strong>Order #${data.orderNumber}</strong></p>
      </div>
      <p style="color: #666;">Thank you for choosing ${RESTAURANT_NAME}. Enjoy your meal!</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: data.customerEmail,
      subject: `Your Order is Ready — #${data.orderNumber} | ${RESTAURANT_NAME}`,
      html,
    });
    console.log(`[Email] Ready notification sent for order #${data.orderNumber}`);
  } catch (err) {
    console.error("[Email] Failed to send order-ready email:", err);
  }
}
