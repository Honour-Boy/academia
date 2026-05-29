'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { removeAssignmentAction } from './actions'

export default function RemoveAssignmentButton({ assignmentId }: { assignmentId: string }) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const r = await removeAssignmentAction(assignmentId)
      if (r && 'error' in r) toast.error(r.error)
      else toast.success('Assignment removed')
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title="Remove assignment"
      className="btn-ghost p-1.5 text-red-400 hover:text-red-600 disabled:opacity-50"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
