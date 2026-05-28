'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Top-of-screen progress bar that fires the instant a same-origin <Link>
 * (or any <a>) is clicked, and disappears as soon as the new route paints.
 *
 * Why this exists: Next 14 App Router has no router-events API, so server-side
 * page compilation in dev (and chunky route bundles in prod) leave the user
 * staring at an unchanged screen for seconds. This bar covers that gap.
 */
export default function NavProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [active, setActive] = useState(false)

  // The new route has rendered → hide the bar. usePathname + useSearchParams
  // both change atomically on navigation; depend on both so query-string moves
  // also clear the bar.
  useEffect(() => {
    setActive(false)
  }, [pathname, searchParams])

  useEffect(() => {
    function isInternalLink(a: HTMLAnchorElement) {
      const href = a.getAttribute('href')
      if (!href) return false
      if (a.target && a.target !== '_self') return false
      if (a.hasAttribute('download')) return false
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false
      try {
        const url = new URL(href, window.location.origin)
        if (url.origin !== window.location.origin) return false
        // Same path + same query → no navigation happens.
        if (url.pathname === window.location.pathname && url.search === window.location.search) return false
      } catch {
        return false
      }
      return true
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest('a')
      if (!a || !isInternalLink(a as HTMLAnchorElement)) return
      setActive(true)
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return (
    <div
      aria-hidden="true"
      className={
        'fixed top-0 inset-x-0 z-[100] h-0.5 pointer-events-none transition-opacity duration-150 ' +
        (active ? 'opacity-100' : 'opacity-0')
      }
    >
      <div className="h-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary animate-nav-progress origin-left" />
    </div>
  )
}
