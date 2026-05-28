'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Check, X, Loader2 } from 'lucide-react'
import { approveSubjectChangeAction, denySubjectChangeAction } from './actions'

interface Props {
  requestId: string
  teacherName: string
}

export default function SubjectChangeApprovalActions({ requestId, teacherName }: Props) {
  const [pending, startTransition] = useTransition()

  function run(kind: 'approve' | 'deny') {
    startTransition(async () => {
      const result =
        kind === 'approve'
          ? await approveSubjectChangeAction(requestId)
          : await denySubjectChangeAction(requestId)
      if ('error' in result) toast.error(result.error)
      else if (kind === 'approve')
        toast.success(`Applied ${teacherName}'s subject list. Their assignments are unchanged — admin still picks classes.`)
      else toast.success(`Denied ${teacherName}'s subject change.`)
    })
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => run('deny')}
        disabled={pending}
        className="btn-secondary flex-1 sm:flex-none"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
        Deny
      </button>
      <button
        type="button"
        onClick={() => run('approve')}
        disabled={pending}
        className="btn-brand flex-1 sm:flex-none"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Approve
      </button>
    </div>
  )
}
