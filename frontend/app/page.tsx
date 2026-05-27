import { redirect } from 'next/navigation'

// Root → dashboard (middleware handles auth gate)
export default function Home() {
  redirect('/dashboard')
}
