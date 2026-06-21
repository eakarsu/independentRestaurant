#!/usr/bin/env node
/**
 * Structural validator for the AI assistant's endpoint registry.
 *
 * For every endpoint declared in src/lib/assistant-tools.ts (ENDPOINTS), this
 * confirms a matching App Router route file exists AND exports the declared
 * HTTP method. Catches typos, wrong verbs, and renamed/removed routes.
 *
 * Runtime-free: no server or database required.
 *   node scripts/validate-assistant-endpoints.mjs
 * Exits non-zero if anything is broken (CI-friendly).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "src/lib/assistant-tools.ts"), "utf8");

const eps = [...src.matchAll(/\{ id: "([^"]+)", method: "([A-Z]+)", path: "([^"]+)"/g)];

let ok = 0;
const broken = [];
for (const [, id, method, route] of eps) {
  // /api/orders/:id -> src/app/api/orders/[id]/route.ts
  const rel = route.replace(/^\/api/, "").replace(/:(\w+)/g, "[$1]");
  const file = path.join(root, "src/app/api", rel, "route.ts");
  if (!fs.existsSync(file)) {
    broken.push(`MISSING FILE   ${id}  ${method} ${route}`);
    continue;
  }
  const txt = fs.readFileSync(file, "utf8");
  if (new RegExp(`export async function ${method}\\b`).test(txt)) ok++;
  else broken.push(`METHOD ABSENT  ${id}  ${method} ${route}`);
}

console.log(`Validated ${eps.length} assistant endpoints: ${ok} valid, ${broken.length} broken`);
if (broken.length) {
  console.error("\n" + broken.join("\n"));
  process.exit(1);
}
