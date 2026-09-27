import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store, private' }
  // A deployed instance may enable autofill for its own demo host. When it
  // does, the credentials served are the DEMO_* ones only — never the real
  // admin, which this endpoint would otherwise hand to any visitor.
  const demoHosts = (process.env.DEMO_AUTOFILL_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const provisioned = process.env.PROVISION_ADMIN_EMAIL && process.env.PROVISION_ADMIN_PASSWORD
  const demoEmail = process.env.DEMO_ADMIN_EMAIL || process.env.DEMO_EMAIL
  const demoPassword = process.env.DEMO_ADMIN_PASSWORD || process.env.DEMO_PASSWORD
  const onDemoHost = demoHosts.length > 0 && demoHosts.includes((request.headers.get('host') || '').split(':')[0].toLowerCase())
  const email = onDemoHost
    ? demoEmail
    : provisioned ? process.env.PROVISION_ADMIN_EMAIL : process.env.ADMIN_EMAIL
  const password = onDemoHost
    ? demoPassword
    : provisioned ? process.env.PROVISION_ADMIN_PASSWORD : process.env.ADMIN_PASSWORD
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  const requestOrigin = host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname)
  const enabled = process.env.ENABLE_DEMO_CREDENTIAL_AUTOFILL === 'true'
    // Production must additionally opt in per host, and only demo credentials
    // are served there.
    && (process.env.NODE_ENV !== 'production' ? local : onDemoHost)
    && (!origin || origin === requestOrigin)
    && Boolean(email && password)

  if (!enabled || request.nextUrl.searchParams.get('status') === '1') {
    return NextResponse.json({ enabled }, { headers })
  }

  return NextResponse.json(
    { enabled: true, email, password },
    { headers },
  )
}
