import { useEffect, useState } from 'react'

import styles from './app.module.css'
import { type AccountId, ACCOUNTS } from './domain/world'
import { navigate } from './router/history'
import { isAccountId, LEDGER_PATH, writeAccount, writeFilter } from './pages/transactions/filters'
import { navigation } from './pages/routes'
import { RouteAnnouncer } from './router/announcer'
import { Link } from './router/link'
import { RouteOutlet, useRoute } from './router/router'
import { DEFAULT_FILTER, parseFilter, serializeFilter } from './state/url'
import { Select } from './ui/Select/Select'
import { TextField } from './ui/TextField/TextField'
import { ThemeSwitch } from './ui/ThemeSwitch/ThemeSwitch'
import { ToastRegion } from './ui/Toast/Toast'

function isCurrent(pathname: string, to: string): boolean {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
}

function AccountSwitcher({ account }: { readonly account: AccountId | null }) {
  return (
    <Select
      label="Account"
      className={styles.headerField}
      value={account ?? ''}
      onChange={(event) => {
        const { value } = event.target
        writeAccount(isAccountId(value) ? value : null)
      }}
    >
      <option value="">All accounts</option>
      {ACCOUNTS.map((option) => (
        <option key={option.id} value={option.id}>{`${option.name} (${option.currency})`}</option>
      ))}
    </Select>
  )
}

const SEARCH_DEBOUNCE_MS = 150

function HeaderSearch({ onLedger, q, account }: { readonly onLedger: boolean; readonly q: string; readonly account: AccountId | null }) {
  const urlQuery = onLedger ? q : ''
  const [draft, setDraft] = useState(urlQuery)
  const [synced, setSynced] = useState(urlQuery)

  if (synced !== urlQuery) {
    setSynced(urlQuery)
    setDraft(urlQuery)
  }

  useEffect(() => {
    if (!onLedger || draft === synced) {
      return
    }
    const timer = setTimeout(() => {
      setSynced(draft)
      writeFilter((current) => ({ ...current, q: draft }), { replace: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [draft, onLedger, synced])

  return (
    <form
      role="search"
      className={styles.search}
      onSubmit={(event) => {
        event.preventDefault()
        if (!onLedger) {
          navigate(`${LEDGER_PATH}${serializeFilter({ ...DEFAULT_FILTER, account, q: draft })}`)
        }
      }}
    >
      <TextField
        label="Search transactions"
        type="search"
        className={styles.headerField}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
        }}
      />
    </form>
  )
}

export function App() {
  const { location } = useRoute()
  const filter = parseFilter(location.search)

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link className={styles.wordmark} to="/">Daybook</Link>
          <AccountSwitcher account={filter.account} />
          <HeaderSearch onLedger={location.pathname === LEDGER_PATH} q={filter.q} account={filter.account} />
          <ThemeSwitch className={styles.theme} />
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
      <ToastRegion />
    </>
  )
}
