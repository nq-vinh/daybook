import { Component, createRef, type ReactNode } from 'react'

import { Button } from '../ui/Button/Button'

interface ErrorBoundaryProps {
  readonly pathname: string
  readonly children: ReactNode
}

interface ErrorBoundaryState {
  readonly error: Error | null
  readonly pathname: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, pathname: this.props.pathname }

  private readonly heading = createRef<HTMLHeadingElement>()

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return props.pathname === state.pathname ? null : { error: null, pathname: props.pathname }
  }

  override componentDidMount(): void {
    if (this.state.error !== null) {
      this.heading.current?.focus()
    }
  }

  override componentDidUpdate(_props: ErrorBoundaryProps, previous: ErrorBoundaryState): void {
    if (previous.error === null && this.state.error !== null) {
      this.heading.current?.focus()
    }
  }

  override render(): ReactNode {
    const { error } = this.state

    if (error === null) {
      return this.props.children
    }

    return (
      <>
        <h1 ref={this.heading} tabIndex={-1}>Something went wrong</h1>
        <p>The page could not load. Reload to try again.</p>
        <Button
          onClick={() => {
            window.location.reload()
          }}
        >
          Reload
        </Button>
        <details>
          <summary>Error details</summary>
          <pre>{error.message}</pre>
        </details>
      </>
    )
  }
}
