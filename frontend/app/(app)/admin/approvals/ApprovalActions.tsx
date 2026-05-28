'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Check, X, Loader2 } from 'lucide-react'
import { approveStaffAction, denyStaffAction } from './actions'

export default function ApprovalActions({ profileId, name }: { profileId: string; name: string }) {
  const [pending, startTransition] = useTransition()

  function run(kind: 'approve' | 'deny') {
    startTransition(async () => {
      const result =
        kind === 'approve' ? await approveStaffAction(profileId) : await denyStaffAction(profileId)
      if (result?.error) toast.error(result.error)
      else if (kind === 'approve') toast.success(`${name} approved — they now have access.`)
      else toast.success(`${name}'s registration was denied.`)
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
