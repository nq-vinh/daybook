import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { installCanvasStub } from './canvas'
import { installDialogPolyfill } from './dialog'
import { installPopoverPolyfill, resetPopovers } from './popover'

installPopoverPolyfill()
installDialogPolyfill()
installCanvasStub()

afterEach(() => {
  cleanup()
  if (typeof document !== 'undefined') {
    resetPopovers()
  }
})
