'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Props {
  studentId: string
  studentName: string
  term: string
  year: string
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL

export default function DownloadReportButton({ studentId, studentName, term, year }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
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

      const url =
        `${BACKEND_URL}/reports/student/${studentId}` +
        `?term=${encodeURIComponent(term)}&year=${encodeURIComponent(year)}`

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        toast.error('Could not generate report. Please try again.')
        return
      }

      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${studentName.replace(/\s+/g, '_')}_Report_Sheet.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      toast.error('Could not download report. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      title="Download PDF report"
      className="btn-ghost p-1.5 text-brand hover:text-brand-dark disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
    </button>
  )
}
