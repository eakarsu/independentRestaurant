import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function auditHash(input: {
  orderId: string;
  sequence: number;
  type: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  actorRole: string;
  idempotencyKey: string;
  payload: unknown;
  previousHash?: string | null;
}): string {
  return sha256(canonicalize(input));
}

export function verifyHmacSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  const supplied = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  if (!/^[a-f\d]{64}$/i.test(supplied) || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const actual = Buffer.from(supplied, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
