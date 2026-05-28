// One-shot: set a Supabase Auth user's password directly via the Admin REST API.
// Bypasses email entirely — useful when SMTP rate limits or recovery UI is broken.
//
// Uses raw fetch (no @supabase/supabase-js) to avoid pulling in realtime-js,
// which fails on Node 20 without native WebSocket.
//
// Run from the frontend/ directory:
//   node --env-file=.env.local scripts/set-admin-password.mjs <email> <password>

const [, , email, password] = process.argv

if (!email || !password) {
  console.error('Usage: node --env-file=.env.local scripts/set-admin-password.mjs <email> <password>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Did you pass --env-file=.env.local ?')
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

// 1. Look up the user by email.
const listRes = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers })
if (!listRes.ok) {
  console.error('listUsers failed:', listRes.status, await listRes.text())
  process.exit(1)
}
const listBody = await listRes.json()
const users = Array.isArray(listBody) ? listBody : listBody.users ?? []
const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`No auth user found for: ${email}`)
  process.exit(1)
}

// 2. Update the password via the Admin API.
const updateRes = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ password }),
})
if (!updateRes.ok) {
  console.error('updateUserById failed:', updateRes.status, await updateRes.text())
  process.exit(1)
}

console.log(`Password updated for ${email} (auth user ${user.id}).`)
