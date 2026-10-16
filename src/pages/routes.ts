import type { Route } from '../router/match'
import { BudgetsPage } from './budgets'
import { CardsPage } from './cards'
import { DesignPage } from './design'
import { NotFoundPage } from './not-found'
import { OverviewPage } from './overview'
import { acceptsTransactionPath, TransactionPage } from './transaction'
import { TransactionsPage } from './transactions'

export const routes: readonly Route[] = [
  { path: '/', title: 'Overview', component: OverviewPage },
  { path: '/transactions', title: 'Transactions', component: TransactionsPage },
  { path: '/transactions/:id', title: 'Transaction', component: TransactionPage, accept: acceptsTransactionPath },
  { path: '/cards', title: 'Cards', component: CardsPage },
  { path: '/budgets', title: 'Budgets', component: BudgetsPage },
  { path: '/design', title: 'Design system', component: DesignPage },
]

export const notFound: Route = { path: '*', title: 'Page not found', component: NotFoundPage }

export const navigation = [
  { to: '/', label: 'Overview' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/cards', label: 'Cards' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/design', label: 'Design' },
] as const
