/** @type {import('next').NextConfig} */

// Backend URL — set NEXT_PUBLIC_BACKEND_URL in Vercel env vars once deployed.
const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_URL
  ? new URL(process.env.NEXT_PUBLIC_BACKEND_URL).host
  : 'localhost:3001'

const nextConfig = {
  experimental: {
    serverActions: {
      // Allowed origins for Server Actions (CSRF protection).
      allowedOrigins: ['localhost:3000', backendOrigin],
    },
  },
}

export default nextConfig
