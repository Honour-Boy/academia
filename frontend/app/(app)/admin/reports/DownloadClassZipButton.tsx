'use client'

import { useState } from 'react'
import { Archive, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Props {
  className: string
  studentIds: string[]
  term: string
  year: string
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL

export default function DownloadClassZipButton({ className, studentIds, term, year }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    if (!BACKEND_URL) {
      toast.error('Report service is not configured (NEXT_PUBLIC_BACKEND_URL).')
      return
    }
    if (studentIds.length === 0) {
      toast.error('No students in this class')
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

      const res = await fetch(`${BACKEND_URL}/reports/bulk`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentIds, term, academicYear: year }),
      })
      if (!res.ok) {
        toast.error('Could not generate class reports. Please try again.')
        return
      }

      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${className.replace(/\s+/g, '_')}_Reports_${term.replace(/\s+/g, '_')}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
      toast.success(`Downloaded ${studentIds.length} report${studentIds.length === 1 ? '' : 's'} as ZIP`)
    } catch {
      toast.error('Could not download class reports. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading || studentIds.length === 0}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-brand-primary disabled:opacity-50 cursor-pointer transition-colors"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
      {loading ? 'Generating ZIP…' : `Download all ${studentIds.length} as ZIP`}
    </button>
  )
}
