import { useEffect, useState } from 'react'

import styles from './app.module.css'
import { type AccountId, ACCOUNTS } from './domain/world'
import { getLocation, navigate } from './router/history'
import { isAccountId, LEDGER_PATH, writeAccount, writeSearch } from './pages/transactions/filters'
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

interface HeaderSearchProps {
  readonly onLedger: boolean
  readonly q: string
  readonly account: AccountId | null
  readonly locationKey: string
}

function HeaderSearch({ onLedger, q, account, locationKey }: HeaderSearchProps) {
  const urlQuery = onLedger ? q : ''
  const [draft, setDraft] = useState(urlQuery)
  const [synced, setSynced] = useState({ q: urlQuery, key: locationKey })

  if (synced.q !== urlQuery || synced.key !== locationKey) {
    setSynced({ q: urlQuery, key: locationKey })
    setDraft(urlQuery)
  }

  useEffect(() => {
    if (!onLedger || draft === synced.q) {
      return
    }
    const timer = setTimeout(() => {
      writeSearch(draft)
      setSynced({ q: draft, key: getLocation().key })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [draft, onLedger, synced.q])

  return (
    <form
      role="search"
      className={styles.search}
      onSubmit={(event) => {
        event.preventDefault()
        if (!onLedger) {
          navigate(`${LEDGER_PATH}${serializeFilter({ ...DEFAULT_FILTER, account, q: draft })}`)
        } else if (draft !== synced.q) {
          writeSearch(draft)
          setSynced({ q: draft, key: getLocation().key })
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
          <HeaderSearch
            onLedger={location.pathname === LEDGER_PATH}
            q={filter.q}
            account={filter.account}
            locationKey={location.key}
          />
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
