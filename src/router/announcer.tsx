import styles from './announcer.module.css'
import { useRoute } from './router'

export function RouteAnnouncer() {
  const { route, location } = useRoute()

  return (
    <p className={styles.announcer} role="status" aria-atomic="true">
      {location.navigations > 0 && <span key={location.navigations}>{route.title}</span>}
    </p>
  )
}
