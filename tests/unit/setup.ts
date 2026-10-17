import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

import { installCanvasStub } from './canvas'
import { installDialogPolyfill } from './dialog'
import { installPopoverPolyfill, resetPopovers } from './popover'

installPopoverPolyfill()
installDialogPolyfill()
installCanvasStub()
configure({ asyncUtilTimeout: 5_000 })

afterEach(() => {
  cleanup()
  if (typeof document !== 'undefined') {
    resetPopovers()
  }
})
