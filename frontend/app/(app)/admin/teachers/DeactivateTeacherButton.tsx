'use client'

import { useTransition } from 'react'
import { toggleTeacherStatusAction } from './actions'
import { Loader2 } from 'lucide-react'

export default function DeactivateTeacherButton({
  teacherId, isActive,
}: { teacherId: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => toggleTeacherStatusAction(teacherId, !isActive))}
      className={`btn text-xs px-3 py-1.5 min-h-0 ${isActive ? 'btn-secondary text-red-600 hover:border-red-300' : 'btn-secondary text-brand hover:border-brand/40'}`}
    >
      {isPending
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : isActive ? 'Deactivate' : 'Reactivate'}
    </button>
  )
}
