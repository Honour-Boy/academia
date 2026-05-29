'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog'
import { createClassAction } from './actions'

const LEVELS = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'] as const

export default function CreateClassDialog() {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState<string>('')
  const [arm, setArm] = useState<string>('')
  const [pending, startTransition] = useTransition()

  const trimmedArm = arm.trim()
  const preview = level && trimmedArm
    ? (trimmedArm.length === 1 ? `${level}${trimmedArm}` : `${level} ${trimmedArm}`)
    : null

  function reset() {
    setError(null)
    setLevel('')
    setArm('')
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createClassAction(fd)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(`${preview} created`)
      setOpen(false)
      reset()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="btn-brand">
          <Plus className="w-4 h-4" /> Create class
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New class</DialogTitle>
          <DialogDescription>
            Pick a level and arm. The class name is generated automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="level" className="block text-sm font-medium text-ink mb-1.5">
                Level
              </label>
              <select
                id="level"
                name="level"
                required
                disabled={pending}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="input-brand"
              >
                <option value="">— Select —</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="arm" className="block text-sm font-medium text-ink mb-1.5">
                Arm
              </label>
              <input
                id="arm"
                name="arm"
                type="text"
                required
                disabled={pending}
                value={arm}
                onChange={(e) => setArm(e.target.value)}
                placeholder="A, Topaz, Emerald…"
                maxLength={20}
                className="input-brand"
                autoComplete="off"
              />
              <p className="text-[11px] text-ink-subtle mt-1">
                Single letter (&ldquo;A&rdquo;) or a name (&ldquo;Topaz&rdquo;). 1–20 chars.
              </p>
            </div>
          </div>

          {preview && (
            <div className="rounded-lg bg-brand-secondary-light border border-brand-secondary/30 px-3 py-2.5 text-sm">
              <span className="text-ink-muted">Will be created as </span>
              <span className="font-semibold text-ink font-mono">{preview}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 p-3 rounded-lg bg-brand-primary-light border border-brand-primary/25 text-brand-primary-dark text-sm animate-shake"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="btn-secondary" disabled={pending}>Cancel</button>
            </DialogClose>
            <button type="submit" className="btn-brand" disabled={pending || !level || !trimmedArm}>
              {pending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
              ) : (
                'Create class'
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
