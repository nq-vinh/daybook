import { convert, roundHalfAwayFromZero } from './fx'
import { type RandomSource, worldRandom } from './prng'
import {
  accountCurrency,
  type AccountId,
  type Card,
  type CardId,
  CARDS,
  CATEGORIES,
  type CategoryId,
  type CounterpartyId,
  type Currency,
  CURRENCIES,
  DAY_MS,
  monthIndexOf,
  monthStart,
  TODAY,
  TRANSACTION_COUNT,
  WINDOW_MONTHS,
} from './world'

export type TransactionStatus = 'booked' | 'pending' | 'declined'

export type VatRate = 0 | 7 | 19

export interface Transaction {
  id: number
  accountId: AccountId
  cardId?: CardId
  counterpartyId: CounterpartyId
  amount: number
  currency: Currency
  bookedAt: number
  category: CategoryId
  status: TransactionStatus
  reference: string
  vatRate: VatRate
}

export { TRANSACTION_COUNT }

export const PENDING_WINDOW_MS = 14 * DAY_MS

const VAT_RATES = {
  revenue: 0,
  interest: 0,
  refunds: 19,
  salaries: 0,
  tax: 0,
  rent: 19,
  software: 19,
  travel: 19,
  meals: 7,
  office: 19,
  marketing: 19,
  hardware: 19,
  professional: 19,
  utilities: 19,
} as const satisfies Record<CategoryId, VatRate>

const FINAL_MONTH = WINDOW_MONTHS - 1
const RECURRING_HOUR = 6
const SALARY_DAY = 25

const RENT = { accountId: 'acc-main', counterpartyId: 'sup-01', day: 1, amount: 485_000 } as const

const SALARIES = [
  { counterpartyId: 'emp-01', amount: 720_000 },
  { counterpartyId: 'emp-02', amount: 610_000 },
  { counterpartyId: 'emp-03', amount: 585_000 },
  { counterpartyId: 'emp-04', amount: 540_000 },
  { counterpartyId: 'emp-05', amount: 515_000 },
  { counterpartyId: 'emp-06', amount: 498_000 },
  { counterpartyId: 'emp-07', amount: 472_000 },
  { counterpartyId: 'emp-08', amount: 455_000 },
  { counterpartyId: 'emp-09', amount: 430_000 },
  { counterpartyId: 'emp-10', amount: 412_000 },
  { counterpartyId: 'emp-11', amount: 396_000 },
  { counterpartyId: 'emp-12', amount: 368_000 },
] as const satisfies readonly { counterpartyId: CounterpartyId; amount: number }[]

const SUBSCRIPTIONS = [
  { counterpartyId: 'plt-01', cardId: 'card-07', day: 2, amount: 48_900 },
  { counterpartyId: 'plt-02', cardId: 'card-07', day: 4, amount: 7_200 },
  { counterpartyId: 'plt-03', cardId: 'card-08', day: 7, amount: 19_900 },
  { counterpartyId: 'plt-04', cardId: 'card-08', day: 9, amount: 12_000 },
  { counterpartyId: 'plt-05', cardId: 'card-07', day: 12, amount: 9_600 },
  { counterpartyId: 'plt-06', cardId: 'card-10', day: 15, amount: 14_400 },
  { counterpartyId: 'plt-07', cardId: 'card-07', day: 19, amount: 86_500 },
  { counterpartyId: 'plt-08', cardId: 'card-10', day: 23, amount: 29_900 },
] as const satisfies readonly { counterpartyId: CounterpartyId; cardId: CardId; day: number; amount: number }[]

const TAX_PAYMENTS = [
  { accountId: 'acc-main', counterpartyId: 'tax-01', label: 'Corporate tax', min: 1_800_000, max: 3_200_000 },
  { accountId: 'acc-uk', counterpartyId: 'tax-02', label: 'VAT return', min: 650_000, max: 1_200_000 },
] as const satisfies readonly { accountId: AccountId; counterpartyId: CounterpartyId; label: string; min: number; max: number }[]

const TAX_DAY = 10
const SLOTS_PER_MONTH = 1 + SALARIES.length + SUBSCRIPTIONS.length

function slotDay(slot: number): number {
  if (slot === 0) {
    return RENT.day
  }
  if (slot <= SALARIES.length) {
    return SALARY_DAY
  }
  const subscription = SUBSCRIPTIONS[slot - 1 - SALARIES.length]
  if (subscription === undefined) {
    throw new RangeError(`No recurring slot ${String(slot)}`)
  }
  return subscription.day
}

function slotInstant(month: number, slot: number): number {
  return Date.UTC(2023, 9 + month, slotDay(slot), RECURRING_HOUR)
}

const FINAL_MONTH_SLOTS = Array.from({ length: SLOTS_PER_MONTH }, (_, slot) => slot)
  .filter((slot) => slotInstant(FINAL_MONTH, slot) <= TODAY)

const TAX_QUARTER_COUNT = Array.from({ length: WINDOW_MONTHS }, (_, month) => month)
  .filter((month) => month % 3 === 0 && Date.UTC(2023, 9 + month, TAX_DAY, RECURRING_HOUR) <= TODAY)
  .length

const FULL_MONTHS_COUNT = FINAL_MONTH * SLOTS_PER_MONTH
const FINAL_MONTH_END = FULL_MONTHS_COUNT + FINAL_MONTH_SLOTS.length

export const RECURRING_COUNT = FINAL_MONTH_END + TAX_QUARTER_COUNT * TAX_PAYMENTS.length

interface CategoryProfile {
  min: number
  max: number
  cardShare: number
  counterparties: readonly CounterpartyId[]
}

const PROFILES = {
  revenue: { min: 300, max: 9_000, cardShare: 0, counterparties: ['cus-01', 'cus-02', 'cus-03', 'cus-04', 'cus-05', 'cus-06', 'cus-07', 'cus-08', 'cus-09', 'cus-10', 'cus-11', 'cus-12', 'cus-13', 'cus-14', 'cus-15', 'cus-16'] },
  interest: { min: 5, max: 120, cardShare: 0, counterparties: ['plt-09'] },
  refunds: { min: 20, max: 800, cardShare: 0, counterparties: ['sup-03', 'sup-06', 'sup-07', 'sup-09', 'sup-14', 'plt-11'] },
  salaries: { min: 50, max: 900, cardShare: 0, counterparties: ['emp-01', 'emp-02', 'emp-03', 'emp-04', 'emp-05', 'emp-06', 'emp-07', 'emp-08', 'emp-09', 'emp-10', 'emp-11', 'emp-12'] },
  tax: { min: 20, max: 600, cardShare: 0, counterparties: ['tax-01', 'tax-02'] },
  rent: { min: 80, max: 600, cardShare: 0.2, counterparties: ['sup-01'] },
  software: { min: 9, max: 400, cardShare: 0.85, counterparties: ['plt-01', 'plt-02', 'plt-03', 'plt-04', 'plt-05', 'plt-06', 'plt-07', 'plt-08'] },
  travel: { min: 40, max: 1_800, cardShare: 0.8, counterparties: ['sup-05', 'sup-06', 'sup-07', 'sup-18'] },
  meals: { min: 8, max: 160, cardShare: 0.9, counterparties: ['sup-04', 'sup-12', 'sup-16'] },
  office: { min: 5, max: 450, cardShare: 0.6, counterparties: ['sup-03', 'sup-13', 'sup-14', 'sup-17'] },
  marketing: { min: 100, max: 6_000, cardShare: 0.4, counterparties: ['plt-10', 'sup-10'] },
  hardware: { min: 60, max: 3_200, cardShare: 0.5, counterparties: ['sup-09'] },
  professional: { min: 250, max: 4_500, cardShare: 0, counterparties: ['sup-02', 'sup-11', 'sup-19'] },
  utilities: { min: 40, max: 900, cardShare: 0.1, counterparties: ['sup-08', 'sup-15'] },
} as const satisfies Record<CategoryId, CategoryProfile>

const INCOME_CATEGORIES: readonly CategoryId[] = CATEGORIES.filter((category) => category.kind === 'income').map((category) => category.id)

const EXPENSE_CATEGORIES: readonly CategoryId[] = CATEGORIES.filter((category) => category.kind === 'expense').map((category) => category.id)

const ALL_CATEGORIES: readonly CategoryId[] = CATEGORIES.map((category) => category.id)

const ACCOUNT_WEIGHTS = [
  { accountId: 'acc-main', weight: 55 },
  { accountId: 'acc-ops', weight: 25 },
  { accountId: 'acc-uk', weight: 20 },
] as const satisfies readonly { accountId: AccountId; weight: number }[]

const CATEGORY_WEIGHTS = {
  'acc-main': {
    revenue: 9.3, interest: 1, refunds: 2, salaries: 2, tax: 1, rent: 1, software: 4,
    travel: 6, meals: 20, office: 14, marketing: 3, hardware: 3, professional: 3, utilities: 3,
  },
  'acc-ops': {
    revenue: 7.6, interest: 0.5, refunds: 1, salaries: 0, tax: 0, rent: 0.5, software: 10,
    travel: 8, meals: 10, office: 6, marketing: 6, hardware: 4, professional: 1, utilities: 2,
  },
  'acc-uk': {
    revenue: 7.8, interest: 0.5, refunds: 1.5, salaries: 1, tax: 1, rent: 1, software: 3,
    travel: 8, meals: 16, office: 8, marketing: 5, hardware: 2, professional: 3, utilities: 2,
  },
} as const satisfies Record<AccountId, Record<CategoryId, number>>

const REVENUE_SEASON = [0.9, 0.92, 1, 1, 1.02, 1, 0.92, 0.85, 1.02, 1.05, 1.12, 1.3] as const

const RECENCY_SLOPE = 1.5
const PENDING_SHARE_IN_WINDOW = 0.6
const STATUS_DECLINED = 0.01
const OWN_CURRENCY_SHARE = 0.85

function monthSpan(month: number): number {
  return Math.min(monthStart(month + 1), TODAY) - monthStart(month)
}

function cumulative(weights: readonly number[]): readonly number[] {
  let total = 0
  const sums = weights.map((weight) => (total += weight))
  return sums.map((sum) => sum / total)
}

function pick<T>(items: readonly T[], sums: readonly number[], roll: number): T {
  const item = items[sums.findIndex((sum) => roll < sum)]
  if (item === undefined) {
    throw new RangeError('Cannot pick from an empty list')
  }
  return item
}

const MONTHS = Array.from({ length: WINDOW_MONTHS }, (_, month) => month)
const MONTH_SUMS = cumulative(MONTHS.map((month) => (1 + (RECENCY_SLOPE * month) / FINAL_MONTH) * monthSpan(month)))
const ACCOUNT_SUMS = cumulative(ACCOUNT_WEIGHTS.map((entry) => entry.weight))

function categorySums(accountId: AccountId) {
  const weights: Record<CategoryId, number> = CATEGORY_WEIGHTS[accountId]
  return {
    all: cumulative(ALL_CATEGORIES.map((category) => weights[category])),
    expense: cumulative(EXPENSE_CATEGORIES.map((category) => weights[category])),
  }
}

const CATEGORY_SUMS = {
  'acc-main': categorySums('acc-main'),
  'acc-ops': categorySums('acc-ops'),
  'acc-uk': categorySums('acc-uk'),
} as const satisfies Record<AccountId, { all: readonly number[]; expense: readonly number[] }>

const LONGEST_COUNTERPARTY_LIST = Math.max(...ALL_CATEGORIES.map((category) => PROFILES[category].counterparties.length))

const RANK_SUMS = Array.from({ length: LONGEST_COUNTERPARTY_LIST + 1 }, (_, length) =>
  cumulative(Array.from({ length }, (_, rank) => 1 / (rank + 2))))

function activeCards(accountId: AccountId): readonly CardId[] {
  return CARDS.filter((card: Card) => card.accountId === accountId && card.status === 'active').map((card) => card.id)
}

const ACTIVE_CARDS = {
  'acc-main': activeCards('acc-main'),
  'acc-ops': activeCards('acc-ops'),
  'acc-uk': activeCards('acc-uk'),
} as const satisfies Record<AccountId, readonly CardId[]>

function monthLabel(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 7)
}

function yearsSince2023(month: number): number {
  return Math.floor((9 + month) / 12)
}

function serial(random: RandomSource): string {
  return String(10_000 + Math.floor(random() * 90_000))
}

function logUniform(min: number, max: number, roll: number): number {
  return min * (max / min) ** roll
}

function recurring(id: number, random: RandomSource): Transaction {
  if (id >= FINAL_MONTH_END) {
    const index = id - FINAL_MONTH_END
    const payment = TAX_PAYMENTS[index % TAX_PAYMENTS.length]
    if (payment === undefined) {
      throw new RangeError(`No tax payment for index ${String(id)}`)
    }
    const quarter = Math.floor(index / TAX_PAYMENTS.length)
    const bookedAt = Date.UTC(2023, 9 + quarter * 3, TAX_DAY, RECURRING_HOUR)
    const paidFor = new Date(Date.UTC(2023, 9 + quarter * 3 - 3, 1))
    const amount = logUniform(payment.min, payment.max, random()) * (1 + quarter * 0.04)
    return {
      id,
      accountId: payment.accountId,
      counterpartyId: payment.counterpartyId,
      amount: -roundHalfAwayFromZero(amount / 100) * 100,
      currency: accountCurrency(payment.accountId),
      bookedAt,
      category: 'tax',
      status: 'booked',
      reference: `${payment.label} Q${String(Math.floor(paidFor.getUTCMonth() / 3) + 1)} ${String(paidFor.getUTCFullYear())}`,
      vatRate: VAT_RATES.tax,
    }
  }

  const finalSlot = FINAL_MONTH_SLOTS[id - FULL_MONTHS_COUNT]
  const month = id < FULL_MONTHS_COUNT ? Math.floor(id / SLOTS_PER_MONTH) : FINAL_MONTH
  const slot = id < FULL_MONTHS_COUNT ? id % SLOTS_PER_MONTH : finalSlot
  if (slot === undefined) {
    throw new RangeError(`No recurring slot for index ${String(id)}`)
  }
  const bookedAt = slotInstant(month, slot)
  const period = monthLabel(bookedAt)

  if (slot === 0) {
    return {
      id,
      accountId: RENT.accountId,
      counterpartyId: RENT.counterpartyId,
      amount: -roundHalfAwayFromZero(RENT.amount * 1.025 ** yearsSince2023(month)),
      currency: accountCurrency(RENT.accountId),
      bookedAt,
      category: 'rent',
      status: 'booked',
      reference: `Rent ${period}`,
      vatRate: VAT_RATES.rent,
    }
  }

  const salary = SALARIES[slot - 1]
  if (salary !== undefined) {
    return {
      id,
      accountId: 'acc-main',
      counterpartyId: salary.counterpartyId,
      amount: -roundHalfAwayFromZero((salary.amount * 1.03 ** yearsSince2023(month)) / 100) * 100,
      currency: accountCurrency('acc-main'),
      bookedAt,
      category: 'salaries',
      status: 'booked',
      reference: `Payroll ${period}`,
      vatRate: VAT_RATES.salaries,
    }
  }

  const subscription = SUBSCRIPTIONS[slot - 1 - SALARIES.length]
  if (subscription === undefined) {
    throw new RangeError(`No recurring slot for index ${String(id)}`)
  }
  return {
    id,
    accountId: 'acc-ops',
    cardId: subscription.cardId,
    counterpartyId: subscription.counterpartyId,
    amount: -roundHalfAwayFromZero(subscription.amount * (1 + month * 0.012)),
    currency: accountCurrency('acc-ops'),
    bookedAt,
    category: 'software',
    status: 'booked',
    reference: `Subscription ${period}`,
    vatRate: VAT_RATES.software,
  }
}

function organicReference(category: CategoryId, bookedAt: number, random: RandomSource): string {
  switch (category) {
    case 'revenue':
      return `INV-${new Date(bookedAt).toISOString().slice(0, 4)}-${serial(random)}`
    case 'interest':
      return `Interest ${monthLabel(bookedAt)}`
    case 'refunds':
      return `Credit note CN-${serial(random)}`
    case 'salaries':
      return `Expense claim ${monthLabel(bookedAt)}`
    case 'tax':
      return `Tax notice ${serial(random)}`
    default:
      return `Invoice ${serial(random)}`
  }
}

function organic(id: number, random: RandomSource): Transaction {
  const month = pick(MONTHS, MONTH_SUMS, random())
  const bookedAt = monthStart(month) + Math.floor(random() * monthSpan(month))
  const statusRoll = random()
  const status: TransactionStatus = statusRoll >= 1 - STATUS_DECLINED
    ? 'declined'
    : bookedAt > TODAY - PENDING_WINDOW_MS && statusRoll < PENDING_SHARE_IN_WINDOW ? 'pending' : 'booked'
  const accountId = pick(ACCOUNT_WEIGHTS, ACCOUNT_SUMS, random()).accountId
  const sums = CATEGORY_SUMS[accountId]
  const category = status === 'declined'
    ? pick(EXPENSE_CATEGORIES, sums.expense, random())
    : pick(ALL_CATEGORIES, sums.all, random())
  const profile: CategoryProfile = PROFILES[category]
  const rankSums = RANK_SUMS[profile.counterparties.length]
  if (rankSums === undefined) {
    throw new RangeError('RANK_SUMS covers every counterparty list length')
  }
  const counterpartyId = pick(profile.counterparties, rankSums, random())
  const season = category === 'revenue' ? (REVENUE_SEASON[(monthIndexOf(bookedAt) + 9) % 12] ?? 1) : 1
  const ownMinor = roundHalfAwayFromZero(logUniform(profile.min, profile.max, random()) * season * 100)
  const ownCurrency = accountCurrency(accountId)

  const currencyRoll = random()
  const foreign = CURRENCIES.filter((currency) => currency !== ownCurrency)
  const currency = currencyRoll < OWN_CURRENCY_SHARE
    ? ownCurrency
    : (foreign[currencyRoll < (1 + OWN_CURRENCY_SHARE) / 2 ? 0 : 1] ?? ownCurrency)
  const magnitude = Math.max(1, convert(ownMinor, ownCurrency, currency))
  const isIncome = INCOME_CATEGORIES.includes(category)

  const cards: readonly CardId[] = ACTIVE_CARDS[accountId]
  const cardId = !isIncome && random() < profile.cardShare ? cards[Math.floor(random() * cards.length)] : undefined

  return {
    id,
    accountId,
    ...(cardId === undefined ? {} : { cardId }),
    counterpartyId,
    amount: isIncome ? magnitude : -magnitude,
    currency,
    bookedAt,
    category,
    status,
    reference: cardId === undefined ? organicReference(category, bookedAt, random) : 'Card payment',
    vatRate: VAT_RATES[category],
  }
}

export function transaction(id: number): Transaction {
  if (!Number.isInteger(id) || id < 0 || id >= TRANSACTION_COUNT) {
    throw new RangeError(`Transaction index out of range: ${String(id)}`)
  }
  const random = worldRandom(id)
  return id < RECURRING_COUNT ? recurring(id, random) : organic(id, random)
}

export function accountAmount(entry: Transaction): number {
  return entry.status === 'declined' ? 0 : convert(entry.amount, entry.currency, accountCurrency(entry.accountId))
}

export interface MonthTotals {
  income: number
  expense: number
  net: number
}

export interface AccountSeries {
  income: number[]
  expense: number[]
  net: number[]
  monthToDate: MonthTotals
}

export const COMPLETE_MONTHS = WINDOW_MONTHS - 1

function emptySeries(): AccountSeries {
  return {
    income: new Array<number>(COMPLETE_MONTHS).fill(0),
    expense: new Array<number>(COMPLETE_MONTHS).fill(0),
    net: new Array<number>(COMPLETE_MONTHS).fill(0),
    monthToDate: { income: 0, expense: 0, net: 0 },
  }
}

export function monthlySeriesByAccount(): Record<AccountId, AccountSeries> {
  const series: Record<AccountId, AccountSeries> = {
    'acc-main': emptySeries(),
    'acc-ops': emptySeries(),
    'acc-uk': emptySeries(),
  }
  for (let id = 0; id < TRANSACTION_COUNT; id += 1) {
    const entry = transaction(id)
    const amount = accountAmount(entry)
    const month = monthIndexOf(entry.bookedAt)
    const account = series[entry.accountId]
    if (month === COMPLETE_MONTHS) {
      account.monthToDate.income += Math.max(amount, 0)
      account.monthToDate.expense += Math.max(-amount, 0)
      account.monthToDate.net += amount
    } else {
      account.income[month] = (account.income[month] ?? 0) + Math.max(amount, 0)
      account.expense[month] = (account.expense[month] ?? 0) + Math.max(-amount, 0)
      account.net[month] = (account.net[month] ?? 0) + amount
    }
  }
  return series
}
