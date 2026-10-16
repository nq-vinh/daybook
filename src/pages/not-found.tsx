import { Link } from '../router/link'

export function NotFoundPage() {
  return (
    <>
      <h1 tabIndex={-1}>Page not found</h1>
      <p>
        Nothing lives at this address. Check the link or go to the <Link to="/">overview</Link>.
      </p>
    </>
  )
}
