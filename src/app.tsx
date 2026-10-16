import styles from './app.module.css'
import { navigation } from './pages/routes'
import { RouteAnnouncer } from './router/announcer'
import { Link } from './router/link'
import { RouteOutlet, useRoute } from './router/router'

function isCurrent(pathname: string, to: string): boolean {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
}

export function App() {
  const { location } = useRoute()

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link className={styles.wordmark} to="/">Daybook</Link>
        </div>
        <nav className={styles.nav} aria-label="Main">
          <ul className={styles.navList}>
            {navigation.map(({ to, label }) => (
              <li key={to}>
                <Link
                  className={styles.navLink}
                  to={to}
                  aria-current={isCurrent(location.pathname, to) ? 'page' : undefined}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        <RouteOutlet />
      </main>
      <RouteAnnouncer />
      <section className={styles.toasts} aria-label="Notifications" aria-live="polite" />
    </>
  )
}
