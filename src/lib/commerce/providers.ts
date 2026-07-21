import { randomUUID } from "node:crypto";
import { getStripe } from "@/lib/stripe";

export type Money = { amountCents: number; currency: string };
export type ProviderResult = { providerRef: string; raw?: unknown };

export interface TaxProvider {
  quote(input: {
    idempotencyKey: string;
    currency: string;
    subtotalCents: number;
    discountCents: number;
    deliveryAddress?: Record<string, string | undefined>;
    lines: Array<{ sku: string; quantity: number; unitPriceCents: number }>;
  }): Promise<{ taxCents: number; providerRef: string }>;
}

export interface InventoryProvider {
  reserve(input: {
    idempotencyKey: string;
    orderId: string;
    lines: Array<{ sku: string; quantity: number }>;
  }): Promise<ProviderResult>;
  commit(input: { idempotencyKey: string; providerRef: string }): Promise<ProviderResult>;
  release(input: { idempotencyKey: string; providerRef: string }): Promise<ProviderResult>;
}

export interface PaymentProvider {
  createIntent(input: {
    idempotencyKey: string;
    orderId: string;
    orderNumber: string;
    money: Money;
    receiptEmail?: string;
  }): Promise<{ providerRef: string; clientSecret: string | null; redirectUrl?: string; status: "requires_action" | "succeeded" }>;
  refund(input: {
    idempotencyKey: string;
    paymentReference: string;
    money: Money;
    reason: string;
  }): Promise<{ providerRef: string; status: "pending" | "succeeded" | "failed" }>;
}

export interface FulfillmentProvider {
  schedule(input: {
    idempotencyKey: string;
    orderId: string;
    orderNumber: string;
    address: Record<string, string | undefined>;
  }): Promise<ProviderResult>;
  cancel(input: { idempotencyKey: string; providerRef: string }): Promise<ProviderResult>;
}

export class ProviderConfigurationError extends Error {
  constructor(name: string) {
    super(`${name} provider is not configured`);
    this.name = "ProviderConfigurationError";
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; retryable?: (error: unknown) => boolean } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 100;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || options.retryable?.(error) === false) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function providerRequest<T>(
  baseUrl: string | undefined,
  token: string | undefined,
  path: string,
  idempotencyKey: string,
  body: unknown,
): Promise<T> {
  if (!baseUrl || !token) throw new ProviderConfigurationError(path.split("/")[1] || "external");
  return withRetry(async () => {
    const response = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "x-request-id": randomUUID(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const error = new Error(`Provider returned ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return response.json() as Promise<T>;
  }, { retryable: (error) => (error as { status?: number }).status !== 400 });
}

export class HttpTaxProvider implements TaxProvider {
  quote(input: Parameters<TaxProvider["quote"]>[0]) {
    return providerRequest<{ taxCents: number; providerRef: string }>(
      process.env.TAX_PROVIDER_URL,
      process.env.TAX_PROVIDER_TOKEN,
      "/v1/tax/quotes",
      input.idempotencyKey,
      input,
    );
  }
}

export class ConfiguredTaxProvider implements TaxProvider {
  async quote(input: Parameters<TaxProvider["quote"]>[0]) {
    const basisPoints = Number(process.env.TAX_RATE_BPS);
    if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
      throw new ProviderConfigurationError("Tax (set TAX_RATE_BPS or TAX_PROVIDER_URL)");
    }
    const taxableCents = Math.max(0, input.subtotalCents - input.discountCents);
    return { taxCents: Math.round(taxableCents * basisPoints / 10_000), providerRef: `configured-rate:${basisPoints}` };
  }
}

export function configuredTaxProvider(): TaxProvider {
  return process.env.TAX_PROVIDER_URL ? new HttpTaxProvider() : new ConfiguredTaxProvider();
}

export class HttpInventoryProvider implements InventoryProvider {
  reserve(input: Parameters<InventoryProvider["reserve"]>[0]) {
    return providerRequest<ProviderResult>(process.env.INVENTORY_PROVIDER_URL, process.env.INVENTORY_PROVIDER_TOKEN, "/v1/inventory/reservations", input.idempotencyKey, input);
  }
  commit(input: Parameters<InventoryProvider["commit"]>[0]) {
    return providerRequest<ProviderResult>(process.env.INVENTORY_PROVIDER_URL, process.env.INVENTORY_PROVIDER_TOKEN, "/v1/inventory/commit", input.idempotencyKey, input);
  }
  release(input: Parameters<InventoryProvider["release"]>[0]) {
    return providerRequest<ProviderResult>(process.env.INVENTORY_PROVIDER_URL, process.env.INVENTORY_PROVIDER_TOKEN, "/v1/inventory/release", input.idempotencyKey, input);
  }
}

export class HttpFulfillmentProvider implements FulfillmentProvider {
  schedule(input: Parameters<FulfillmentProvider["schedule"]>[0]) {
    return providerRequest<ProviderResult>(process.env.FULFILLMENT_PROVIDER_URL, process.env.FULFILLMENT_PROVIDER_TOKEN, "/v1/deliveries", input.idempotencyKey, input);
  }
  cancel(input: Parameters<FulfillmentProvider["cancel"]>[0]) {
    return providerRequest<ProviderResult>(process.env.FULFILLMENT_PROVIDER_URL, process.env.FULFILLMENT_PROVIDER_TOKEN, "/v1/deliveries/cancel", input.idempotencyKey, input);
  }
}

export class StripePaymentProvider implements PaymentProvider {
  async createIntent(input: Parameters<PaymentProvider["createIntent"]>[0]) {
    const stripe = getStripe();
    if (!stripe) throw new ProviderConfigurationError("Stripe payment");
    if (!process.env.NEXTAUTH_URL) throw new ProviderConfigurationError("Stripe return URL");
    const session = await withRetry(() => stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: input.receiptEmail,
      line_items: [{ price_data: { currency: input.money.currency.toLowerCase(), unit_amount: input.money.amountCents, product_data: { name: `Restaurant order ${input.orderNumber}` } }, quantity: 1 }],
      payment_intent_data: { metadata: { orderId: input.orderId, orderNumber: input.orderNumber } },
      metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
      success_url: new URL("/orders?payment=success", process.env.NEXTAUTH_URL).toString(),
      cancel_url: new URL("/orders?payment=cancelled", process.env.NEXTAUTH_URL).toString(),
    }, { idempotencyKey: input.idempotencyKey }));
    return {
      providerRef: session.id,
      clientSecret: null,
      redirectUrl: session.url ?? undefined,
      status: session.payment_status === "paid" ? "succeeded" as const : "requires_action" as const,
    };
  }

  async refund(input: Parameters<PaymentProvider["refund"]>[0]) {
    const stripe = getStripe();
    if (!stripe) throw new ProviderConfigurationError("Stripe payment");
    const refund = await withRetry(() => stripe.refunds.create({
      payment_intent: input.paymentReference,
      amount: input.money.amountCents,
      metadata: { reason: input.reason },
    }, { idempotencyKey: input.idempotencyKey }));
    const status = refund.status === "succeeded" ? "succeeded" as const : refund.status === "failed" || refund.status === "canceled" ? "failed" as const : "pending" as const;
    return { providerRef: refund.id, status };
  }
}
