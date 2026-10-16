import { useState, type ReactNode } from 'react'

import { cx } from '../classes'
import styles from './ScrollRegion.module.css'

export type ScrollAxis = 'inline' | 'block'

export type ScrollRegionProps = {
  readonly axis?: ScrollAxis | undefined
  readonly className?: string | undefined
  readonly children: ReactNode
} & (
  | { readonly label: string; readonly labelledBy?: undefined }
  | { readonly labelledBy: string; readonly label?: undefined }
)

function overflows(element: HTMLElement, axis: ScrollAxis): boolean {
  return axis === 'inline' ? element.scrollWidth > element.clientWidth : element.scrollHeight > element.clientHeight
}

export function ScrollRegion({ label, labelledBy, axis = 'inline', className, children }: ScrollRegionProps) {
  const [overflowing, setOverflowing] = useState(false)
  const [focused, setFocused] = useState(false)

  function wrapperRef(wrapper: HTMLDivElement | null) {
    if (wrapper === null) {
      return
    }
    const focus = () => {
      setFocused(true)
    }
    const blur = () => {
      setFocused(false)
    }
    wrapper.addEventListener('focus', focus)
    wrapper.addEventListener('blur', blur)
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          setOverflowing(overflows(wrapper, axis))
        })
    observer?.observe(wrapper)
    if (wrapper.firstElementChild !== null) {
      observer?.observe(wrapper.firstElementChild)
    }
    return () => {
      wrapper.removeEventListener('focus', focus)
      wrapper.removeEventListener('blur', blur)
      observer?.disconnect()
    }
  }

  const classes = cx(styles.region, styles[axis], className)

  if (!overflowing && !focused) {
    return <div ref={wrapperRef} className={classes} data-scroll-region="">{children}</div>
  }

  return (
    <div
      ref={wrapperRef}
      className={classes}
      role="region"
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={0}
      data-scroll-region=""
    >
      {children}
    </div>
  )
}
