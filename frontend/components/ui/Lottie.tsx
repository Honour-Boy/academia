'use client'

import { useEffect, useState } from 'react'
import LottiePlayer from 'lottie-react'
import { cn } from '@/lib/cn'

interface LottieProps {
  src: string
  className?: string
  loop?: boolean
  autoplay?: boolean
}

export default function Lottie({ src, className, loop = true, autoplay = true }: LottieProps) {
  const [data, setData] = useState<object | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    let cancelled = false
    fetch(src)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setData(json) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [src])

  if (!data) return <div aria-hidden="true" className={cn('bg-brand-secondary/10 rounded-2xl', className)} />

  return (
    <LottiePlayer
      animationData={data}
      loop={!reducedMotion && loop}
      autoplay={!reducedMotion && autoplay}
      className={className}
    />
  )
}
