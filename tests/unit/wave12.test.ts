import test from "node:test";
import assert from "node:assert/strict";
import { toCsv, providerConfigured, menuMargin, wasteReview } from "../../src/lib/wave12";

test("csv quoting preserves commas and zero/false", () => { const csv = toCsv([{ name: "A, B", n: 0, ok: false }]); assert.ok(csv.includes('"A, B"')); assert.ok(csv.split("\n")[1].endsWith(",0,false")); });
test("menu margin fallback preserves zero margin", () => { const r = menuMargin([{ name: "X", price: 10, cost: 10 }, { name: "Y", price: 0, cost: 0 }]); assert.equal(r.aiGenerated, false); assert.equal(r.sections.find((s) => s.label === "Items reviewed")?.value, 2); const detail = r.sections.find((s) => s.label === "Detail")?.value as { marginPct: number }[]; assert.equal(detail[0].marginPct, 0); });
test("waste fallback empty", () => { const r = wasteReview([]); assert.equal(r.sections.find((s) => s.label === "Total cost")?.value, 0); assert.equal(r.sections.find((s) => s.label === "Has waste")?.value, false); });
test("provider gate", () => { assert.equal(providerConfigured({}), false); assert.equal(providerConfigured({ OPENAI_API_KEY: "k" }), true); });
