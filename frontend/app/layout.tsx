import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { template: '%s — Academia', default: 'Academia' },
  description: 'Secure grading platform for teachers and administrators.',
  robots: 'noindex, nofollow', // Internal tool — never indexed
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // Prevent iOS double-tap zoom on inputs
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
