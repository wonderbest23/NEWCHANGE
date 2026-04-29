import {
  type ButtonHTMLAttributes,
  cloneElement,
  type ReactElement,
  type ReactNode,
  forwardRef,
  isValidElement,
} from 'react'
import { cn } from '../../lib/cn'

const variantStyles = {
  primary:
    'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600',
  secondary:
    'border border-stone-300 bg-white text-care-ink shadow-sm hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400',
  ghost:
    'text-care-ink hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400',
} as const

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 sm:text-base'

type Variant = keyof typeof variantStyles

type ButtonAsChild = {
  asChild: true
  children: ReactElement<{ className?: string }>
}

type ButtonAsButton = {
  asChild?: false
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

type ButtonProps = (ButtonAsChild | ButtonAsButton) & {
  variant?: Variant
  className?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  props,
  ref,
) {
  const { variant = 'primary', className, ...rest } = props
  const styles = cn(base, variantStyles[variant], className)

  if ('asChild' in props && props.asChild) {
    const child = props.children
    if (!isValidElement(child)) {
      throw new Error('Button asChild expects a single valid React element.')
    }
    return cloneElement(child, {
      className: cn(styles, child.props.className),
    })
  }

  const { children, ...buttonProps } = rest as ButtonAsButton
  return (
    <button
      ref={ref}
      type={buttonProps.type ?? 'button'}
      className={styles}
      {...buttonProps}
    >
      {children}
    </button>
  )
})

Button.displayName = 'Button'
