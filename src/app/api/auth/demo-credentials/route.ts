import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store, private' }
  // A deployed instance may enable autofill for its own demo host. When it
  // does, the credentials served are the DEMO_* ones only.
  //
  // In non-production, loopback requests receive the configured local
  // administrator credentials so the workspace autofill can sign in. That is
  // intentional for local development; production only serves DEMO_* variables
  // and only for hosts explicitly listed in DEMO_AUTOFILL_HOSTS.
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
  // Behind nginx the request arrives over http even though the browser used
  // https, so the forwarded protocol has to be honoured or the same-origin
  // comparison rejects every real request.
  const forwardedProto = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim()
  const proto = forwardedProto || request.nextUrl.protocol.replace(':', '')
  const requestOrigin = host ? `${proto}://${host}` : request.nextUrl.origin
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
