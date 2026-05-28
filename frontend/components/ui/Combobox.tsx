'use client'

import * as React from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ComboboxOption {
  value: string
  label: string
  /** Optional secondary text (e.g. "— ClassName") shown next to the label, dimmed. */
  secondary?: string
  disabled?: boolean
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  buttonClassName?: string
  disabled?: boolean
  id?: string
  name?: string
  /** Allow clearing the value via a small × inside the button (when value is set). */
  clearable?: boolean
  /** Aria label (use when there is no associated <label htmlFor>) */
  'aria-label'?: string
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches',
  className,
  buttonClassName,
  disabled,
  id,
  name,
  clearable,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [highlight, setHighlight] = React.useState(0)
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  const selected = options.find((o) => o.value === value) ?? null

  const filtered = React.useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return options
    return options.filter((o) => normalize(o.label).includes(q) || (o.secondary && normalize(o.secondary).includes(q)))
  }, [options, query])

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Reset query + focus search when opening
  React.useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Keep highlight in range
  React.useEffect(() => {
    if (highlight >= filtered.length) setHighlight(Math.max(0, filtered.length - 1))
  }, [filtered.length, highlight])

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLLIElement>(`[data-idx="${highlight}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  function commit(idx: number) {
    const opt = filtered[idx]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    setOpen(false)
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(filtered.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(highlight)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id ?? 'combobox'}-list` : undefined}
        aria-label={aria['aria-label']}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          'input-brand inline-flex items-center justify-between gap-2 text-left cursor-pointer',
          !selected && 'text-ink-subtle',
          buttonClassName,
        )}
      >
        <span className="truncate flex-1">
          {selected ? (
            <>
              <span className="text-ink">{selected.label}</span>
              {selected.secondary && <span className="text-ink-subtle ml-1">{selected.secondary}</span>}
            </>
          ) : (
            placeholder
          )}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {clearable && selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
              }}
              className="inline-flex items-center justify-center w-5 h-5 rounded text-ink-subtle hover:text-ink hover:bg-surface-muted cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={cn('w-4 h-4 text-ink-muted transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 card overflow-hidden shadow-lg ring-1 ring-black/5">
          <div className="flex items-center gap-2 px-3 border-b border-surface-border">
            <Search className="w-4 h-4 text-ink-subtle flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0) }}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              className="flex-1 py-2.5 bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus() }}
                className="inline-flex items-center justify-center w-5 h-5 rounded text-ink-subtle hover:text-ink cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <ul
            ref={listRef}
            id={`${id ?? 'combobox'}-list`}
            role="listbox"
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-subtle">{emptyMessage}</li>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = opt.value === value
                const isHighlighted = idx === highlight
                return (
                  <li
                    key={opt.value}
                    data-idx={idx}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => { e.preventDefault(); commit(idx) }}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer',
                      isHighlighted && !opt.disabled && 'bg-brand-primary-light',
                      isSelected && 'font-semibold text-brand-primary-dark',
                      !isSelected && !opt.disabled && 'text-ink',
                      opt.disabled && 'text-ink-subtle cursor-not-allowed opacity-60',
                    )}
                  >
                    <Check className={cn('w-3.5 h-3.5 flex-shrink-0', isSelected ? 'text-brand-primary' : 'opacity-0')} />
                    <span className="truncate flex-1">{opt.label}</span>
                    {opt.secondary && (
                      <span className="text-xs text-ink-subtle truncate flex-shrink-0">{opt.secondary}</span>
                    )}
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export default Combobox
