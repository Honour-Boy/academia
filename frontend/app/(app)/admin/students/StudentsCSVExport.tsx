'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export interface CSVStudent {
  id: string
  full_name: string
  student_number: string | null
  is_active: boolean
  className: string | null
  classTeacher: string | null
  subjects: string[]
}

interface Props {
  rows: CSVStudent[]
  term: string
  year: string
}

const HEADERS = [
  'Name',
  'Student ID',
  'Class',
  'Class teacher',
  'Subjects',
  'Status',
]

function csvCell(v: string): string {
  // RFC 4180-ish — quote anything with comma, quote, or newline; double up quotes.
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function csvLine(cells: string[]): string {
  return cells.map(csvCell).join(',')
}

function buildFlatCSV(rows: CSVStudent[]): string {
  const lines: string[] = [csvLine(HEADERS)]
  for (const s of rows) {
    lines.push(csvLine([
      s.full_name,
      s.student_number ?? '',
      s.className ?? '',
      s.classTeacher ?? '',
      s.subjects.join('; '),
      s.is_active ? 'Active' : 'Deactivated',
    ]))
  }
  // UTF-8 BOM so Excel opens it without mangling characters.
  return '﻿' + lines.join('\r\n') + '\r\n'
}

function buildGroupedCSV(rows: CSVStudent[]): string {
  // Same columns, but ordered by class with a section header per class so the
  // admin can scan a class roster in one place. Section header is one row with
  // "Class: <name>" in the first cell so Excel treats it as a normal row.
  const lines: string[] = [csvLine(HEADERS)]
  const byClass = new Map<string, CSVStudent[]>()
  for (const s of rows) {
    const key = s.className ?? 'No class assigned'
    const list = byClass.get(key) ?? []
    list.push(s)
    byClass.set(key, list)
  }
  const sortedClasses = Array.from(byClass.keys()).sort()
  for (const cls of sortedClasses) {
    const bucket = byClass.get(cls)!
    const teacher = bucket.find((s) => s.classTeacher)?.classTeacher ?? ''
    lines.push('')
    lines.push(csvLine([
      `Class: ${cls}`,
      `${bucket.length} student${bucket.length === 1 ? '' : 's'}`,
      teacher ? `Class teacher: ${teacher}` : '',
      '', '', '',
    ]))
    for (const s of bucket) {
      lines.push(csvLine([
        s.full_name,
        s.student_number ?? '',
        s.className ?? '',
        s.classTeacher ?? '',
        s.subjects.join('; '),
        s.is_active ? 'Active' : 'Deactivated',
      ]))
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function StudentsCSVExport({ rows, term, year }: Props) {
  const [working, setWorking] = useState<'flat' | 'grouped' | null>(null)

  function safe(s: string) {
    return s.replace(/[^a-z0-9]+/gi, '_')
  }
  const stamp = `${safe(term)}_${safe(year)}`

  async function handle(kind: 'flat' | 'grouped') {
    if (rows.length === 0) {
      toast.error('No students to export')
      return
    }
    setWorking(kind)
    try {
      const csv = kind === 'flat' ? buildFlatCSV(rows) : buildGroupedCSV(rows)
      const name = kind === 'flat'
        ? `students_all_${stamp}.csv`
        : `students_by_class_${stamp}.csv`
      download(name, csv)
      toast.success(`Downloaded ${rows.length} student${rows.length === 1 ? '' : 's'}`)
    } catch {
      toast.error('Could not generate CSV')
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => handle('flat')}
        disabled={working !== null || rows.length === 0}
        className="btn-secondary inline-flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {working === 'flat' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        <span>All students (CSV)</span>
      </button>
      <button
        type="button"
        onClick={() => handle('grouped')}
        disabled={working !== null || rows.length === 0}
        className="btn-secondary inline-flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {working === 'grouped' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        <span>By class (CSV)</span>
      </button>
    </div>
  )
}
