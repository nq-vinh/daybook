import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { installDialogPolyfill } from './dialog'
import { installPopoverPolyfill, resetPopovers } from './popover'

installPopoverPolyfill()
installDialogPolyfill()

afterEach(() => {
  cleanup()
  if (typeof document !== 'undefined') {
    resetPopovers()
  }
})
