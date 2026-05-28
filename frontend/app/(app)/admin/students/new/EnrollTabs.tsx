'use client'

import { useState } from 'react'
import { User, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Class, Subject } from '@/types'
import EnrollStudentForm from './EnrollStudentForm'
import RosterImport from './RosterImport'

interface Props {
  classes: (Class & { classTeacherName: string | null })[]
  subjects: Subject[]
  defaultTerm: string
  defaultYear: string
}

export default function EnrollTabs({ classes, subjects, defaultTerm, defaultYear }: Props) {
  const [tab, setTab] = useState<'single' | 'bulk'>('single')

  return (
    <div>
      <div role="tablist" aria-label="Enrolment mode" className="inline-flex items-center bg-surface-muted rounded-lg p-0.5 ring-1 ring-surface-border mb-5">
        <TabButton active={tab === 'single'} onClick={() => setTab('single')} icon={User}>
          Single student
        </TabButton>
        <TabButton active={tab === 'bulk'} onClick={() => setTab('bulk')} icon={Users}>
          Bulk import
        </TabButton>
      </div>

      {tab === 'single' ? (
        <EnrollStudentForm
          classes={classes}
          subjects={subjects}
          defaultTerm={defaultTerm}
          defaultYear={defaultYear}
        />
      ) : (
        <RosterImport classes={classes} subjects={subjects} />
      )}
    </div>
  )
}

function TabButton({
  active, onClick, icon: Icon, children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-semibold cursor-pointer transition-colors',
        active ? 'bg-brand-primary text-white shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  )
}
