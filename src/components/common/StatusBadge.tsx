import { cn } from '../../lib/cn'

const toneToClass: Record<'success' | 'warning' | 'danger' | 'neutral', string> =
  {
    success: 'bg-emerald-100 text-emerald-900',
    warning: 'bg-amber-100 text-amber-900',
    danger: 'bg-rose-100 text-rose-900',
    neutral: 'bg-stone-100 text-stone-800',
  }

type StatusBadgeProps = {
  tone: keyof typeof toneToClass
  children: string
  className?: string
}

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium sm:text-sm',
        toneToClass[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
