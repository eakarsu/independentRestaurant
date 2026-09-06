import assert from "node:assert/strict";

// Read-only regression check against an already running application.
const base = new URL(process.env.AUTH_CHECK_URL || "http://127.0.0.1:30875");
async function request(path) {
  return fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
}

for (const path of ["/api/auth/session", "/api/auth/providers", "/api/auth/csrf"]) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} must resolve to the auth handler`);
  assert.match(response.headers.get("content-type") || "", /application\/json/, `${path} must not return an HTML error page`);
  const data = await response.json();
  if (path.endsWith("/providers")) assert.ok(data.credentials, "Credentials provider must be available");
  if (path.endsWith("/csrf")) assert.equal(typeof data.csrfToken, "string");
  console.log(`${path}: JSON response OK`);
}

const login = await request("/login");
assert.equal(login.status, 200, "The custom login page must be reachable");
assert.match(login.headers.get("content-type") || "", /text\/html/);
const dashboard = await request("/dashboard");
assert.ok([302, 303, 307, 308].includes(dashboard.status), "Anonymous dashboard visits must redirect");
const location = dashboard.headers.get("location");
assert.ok(location, "Authentication redirect must include a location");
const redirect = new URL(location, base);
assert.equal(redirect.pathname, "/login", "Proxy must use the configured login page");
assert.equal(redirect.searchParams.get("callbackUrl"), "/dashboard");
console.log("Login page and protected-route redirect OK");
