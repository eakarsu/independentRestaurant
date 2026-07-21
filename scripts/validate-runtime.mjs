#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd(), false);

const failures = [];
const secretIsWeak = (value) => !value || value.length < 32 || /(change-me|replace-with|demo|password|secret-ci)/i.test(value);
const httpsProvider = (name, tokenName) => {
  const value = process.env[name];
  if (!value) return;
  try {
    if (new URL(value).protocol !== "https:") failures.push(`${name} must use HTTPS`);
  } catch {
    failures.push(`${name} must be a valid HTTPS URL`);
  }
  if (!process.env[tokenName] || process.env[tokenName].length < 16) failures.push(`${tokenName} is required when ${name} is configured`);
};

if (!process.env.DATABASE_URL?.startsWith("postgresql://") || /(?:change-me|localhost|127\.0\.0\.1)/i.test(process.env.DATABASE_URL)) failures.push("DATABASE_URL must identify an external PostgreSQL service");
if (secretIsWeak(process.env.NEXTAUTH_SECRET)) failures.push("NEXTAUTH_SECRET must contain at least 32 non-placeholder characters");
if (!process.env.NEXTAUTH_URL?.startsWith("https://")) failures.push("NEXTAUTH_URL must use HTTPS");
if (secretIsWeak(process.env.INTERNAL_WORKER_SECRET)) failures.push("INTERNAL_WORKER_SECRET must contain at least 32 non-placeholder characters");
if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.length < 16) failures.push("STRIPE_SECRET_KEY is required");
if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET.length < 16) failures.push("STRIPE_WEBHOOK_SECRET is required");
if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.length < 16) failures.push("RESEND_API_KEY is required");
if (!process.env.RESEND_FROM_EMAIL?.includes("@")) failures.push("RESEND_FROM_EMAIL must be configured");

const taxRate = Number(process.env.TAX_RATE_BPS);
if (!process.env.TAX_PROVIDER_URL && (!Number.isInteger(taxRate) || taxRate < 0 || taxRate > 2500)) failures.push("TAX_RATE_BPS must be an integer between 0 and 2500 unless TAX_PROVIDER_URL is configured");
httpsProvider("TAX_PROVIDER_URL", "TAX_PROVIDER_TOKEN");
httpsProvider("INVENTORY_PROVIDER_URL", "INVENTORY_PROVIDER_TOKEN");
httpsProvider("FULFILLMENT_PROVIDER_URL", "FULFILLMENT_PROVIDER_TOKEN");

if (failures.length) {
  console.error(`Refusing production startup; invalid configuration: ${failures.join("; ")}`);
  process.exit(1);
}
