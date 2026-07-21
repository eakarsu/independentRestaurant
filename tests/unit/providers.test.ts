import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { auditHash, verifyHmacSignature } from "../../src/lib/commerce/crypto";
import { ConfiguredTaxProvider, withRetry } from "../../src/lib/commerce/providers";

test("partner signatures use constant-time-compatible HMAC validation", () => {
  const body = Buffer.from('{"id":"evt-1"}');
  const signature = createHmac("sha256", "test-secret").update(body).digest("hex");
  assert.equal(verifyHmacSignature(body, `sha256=${signature}`, "test-secret"), true);
  assert.equal(verifyHmacSignature(Buffer.from("tampered"), signature, "test-secret"), false);
});

test("audit hashes are canonical for object-key order", () => {
  const base = { orderId: "o1", sequence: 1, type: "CREATED", actorRole: "OPERATOR", idempotencyKey: "idem", payload: { b: 2, a: 1 } };
  assert.equal(auditHash(base), auditHash({ ...base, payload: { a: 1, b: 2 } }));
});

test("retry adapter retries transient operations without changing the idempotency input", async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("transient");
    return "ok";
  }, { attempts: 3, baseDelayMs: 1 });
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("configured tax provider calculates integer cents", async () => {
  const previous = process.env.TAX_RATE_BPS;
  process.env.TAX_RATE_BPS = "875";
  try {
    const quote = await new ConfiguredTaxProvider().quote({ idempotencyKey: "tax-1", currency: "USD", subtotalCents: 10_00, discountCents: 100, lines: [] });
    assert.deepEqual(quote, { taxCents: 79, providerRef: "configured-rate:875" });
  } finally {
    if (previous === undefined) delete process.env.TAX_RATE_BPS;
    else process.env.TAX_RATE_BPS = previous;
  }
});
