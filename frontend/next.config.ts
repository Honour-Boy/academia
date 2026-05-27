import type { NextConfig } from 'next'

// Backend URL — set NEXT_PUBLIC_BACKEND_URL in Vercel env vars once deployed.
// Falls back to localhost for local dev.
const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_URL
  ? new URL(process.env.NEXT_PUBLIC_BACKEND_URL).host
  : 'localhost:3001'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allowed origins for Server Actions (CSRF protection).
      // localhost:3000 is always included for local dev.
      allowedOrigins: ['localhost:3000', backendOrigin],
    },
  },
}

export default nextConfig
