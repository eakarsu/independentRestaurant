import assert from "node:assert/strict";
import test from "node:test";
import { allowedOrderTransitions, assertOrderTransition, InvalidOrderTransitionError } from "../../src/lib/commerce/state-machine";

test("state machine exposes fulfillment, cancellation, refund, and recovery paths", () => {
  assert.deepEqual(allowedOrderTransitions("PENDING"), ["CONFIRMED", "CANCELLED", "EXCEPTION"]);
  assert.ok(allowedOrderTransitions("COMPLETED").includes("REFUND_PENDING"));
  assert.ok(allowedOrderTransitions("FULFILLMENT_FAILED").includes("PREPARING"));
  assert.doesNotThrow(() => assertOrderTransition("PREPARING", "READY"));
});

test("state machine rejects skipped, repeated, and terminal transitions", () => {
  assert.throws(() => assertOrderTransition("PENDING", "COMPLETED"), InvalidOrderTransitionError);
  assert.throws(() => assertOrderTransition("READY", "READY"), InvalidOrderTransitionError);
  assert.throws(() => assertOrderTransition("REFUNDED", "CONFIRMED"), InvalidOrderTransitionError);
});
