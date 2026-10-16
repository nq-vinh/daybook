import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles/tokens.css'
import './styles/base.css'
import { App } from './app'
import { notFound, routes } from './pages/routes'
import { RouterProvider } from './router/router'

const container = document.getElementById('root')

if (container === null) {
  throw new Error('index.html is missing the #root element.')
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider routes={routes} notFound={notFound}>
      <App />
    </RouterProvider>
  </StrictMode>,
)
