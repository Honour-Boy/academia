'use client'

import { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Props {
  term: string
  year: string
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL

export default function DownloadGradesCSVButton({ term, year }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    if (!BACKEND_URL) {
      toast.error('Export service is not configured (NEXT_PUBLIC_BACKEND_URL).')
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
        `${BACKEND_URL}/admin/grades-export` +
        `?term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(year)}`

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        toast.error('Could not generate grades export. Please try again.')
        return
      }

      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `grades_${term.replace(/\s+/g, '_')}_${year.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
      toast.success('Grades CSV downloaded')
    } catch {
      toast.error('Could not download grades export. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="btn-oauth inline-flex items-center gap-2 disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
      {loading ? 'Exporting…' : 'Export grades CSV'}
    </button>
  )
}
