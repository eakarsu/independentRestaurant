import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEMO_CREDENTIAL_AUTOFILL === "false") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const email = process.env.PROVISION_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "";
  const password = process.env.PROVISION_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "";
  if (!email || !password) {
    return NextResponse.json({ error: "Demo credentials unavailable" }, { status: 503 });
  }
  return NextResponse.json({ email, password }, { headers: { "Cache-Control": "no-store" } });
}
