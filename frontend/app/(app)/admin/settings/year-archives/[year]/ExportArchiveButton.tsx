'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Archive, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL

interface Props { year: string }

export default function ExportArchiveButton({ year }: Props) {
  const [loading, setLoading] = useState(false)

  async function download() {
    if (!BACKEND_URL) {
      toast.error('Report service is not configured (NEXT_PUBLIC_BACKEND_URL).')
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        toast.error('Your session has expired. Please sign in again.')
        return
      }
      const res = await fetch(
        `${BACKEND_URL}/admin/year-archive/${encodeURIComponent(year)}/export`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        toast.error(`Export failed (${res.status}). Try again in a moment.`)
        return
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `year_archive_${year.replace(/\//g, '-')}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
      toast.success(`Exported ${year} as ZIP`)
    } catch {
      toast.error('Export failed. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={loading}
      className="btn-brand inline-flex items-center gap-1.5 disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
      {loading ? 'Building ZIP…' : `Export ${year} as ZIP`}
    </button>
  )
}
