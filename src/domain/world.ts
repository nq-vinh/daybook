export const TODAY_ISO = '2026-09-16T12:00:00.000Z'

export const TODAY = Date.parse(TODAY_ISO)

export const DAY_MS = 86_400_000

export const WINDOW_MONTHS = 36

export const WINDOW_START = Date.UTC(2023, 9, 1)

export function monthStart(monthIndex: number): number {
  return Date.UTC(2023, 9 + monthIndex, 1)
}

export function monthIndexOf(epochMs: number): number {
  const date = new Date(epochMs)
  return (date.getUTCFullYear() - 2023) * 12 + date.getUTCMonth() - 9
}

export const CURRENCIES = ['EUR', 'USD', 'GBP'] as const

export type Currency = (typeof CURRENCIES)[number]

export interface Account {
  id: string
  name: string
  iban: string
  currency: Currency
  openingBalance: number
}

export interface Card {
  id: string
  holder: string
  last4: string
  accountId: string
  monthlyLimit: number
  status: 'active' | 'frozen'
}

export type CounterpartyKind = 'supplier' | 'customer' | 'employee' | 'tax' | 'platform'

export interface Counterparty {
  id: string
  name: string
  kind: CounterpartyKind
}

export type CategoryKind = 'income' | 'expense'

export const CATEGORIES = [
  { id: 'revenue', label: 'Revenue', kind: 'income' },
  { id: 'interest', label: 'Interest', kind: 'income' },
  { id: 'refunds', label: 'Refunds', kind: 'income' },
  { id: 'salaries', label: 'Salaries', kind: 'expense' },
  { id: 'tax', label: 'Tax', kind: 'expense' },
  { id: 'rent', label: 'Rent', kind: 'expense' },
  { id: 'software', label: 'Software', kind: 'expense' },
  { id: 'travel', label: 'Travel', kind: 'expense' },
  { id: 'meals', label: 'Meals', kind: 'expense' },
  { id: 'office', label: 'Office', kind: 'expense' },
  { id: 'marketing', label: 'Marketing', kind: 'expense' },
  { id: 'hardware', label: 'Hardware', kind: 'expense' },
  { id: 'professional', label: 'Professional services', kind: 'expense' },
  { id: 'utilities', label: 'Utilities', kind: 'expense' },
] as const satisfies readonly { id: string; label: string; kind: CategoryKind }[]

export type Category = (typeof CATEGORIES)[number]

export type CategoryId = Category['id']

export type ExpenseCategoryId = Extract<Category, { kind: 'expense' }>['id']

export interface Budget {
  categoryId: ExpenseCategoryId
  monthlyAmount: number
}

export const ACCOUNTS = [
  { id: 'acc-main', name: 'Main account', iban: 'DE26 9990 0000 0048 2133 07', currency: 'EUR', openingBalance: 4_000_000 },
  { id: 'acc-ops', name: 'Operations', iban: 'DE04 9990 0000 0048 2133 15', currency: 'USD', openingBalance: 2_000_000 },
  { id: 'acc-uk', name: 'UK sales', iban: 'GB36 DAYB 9990 0177 6152 90', currency: 'GBP', openingBalance: 1_500_000 },
] as const satisfies readonly Account[]

export type AccountId = (typeof ACCOUNTS)[number]['id']

export function accountCurrency(accountId: AccountId): Currency {
  const account = ACCOUNTS.find((candidate) => candidate.id === accountId)
  if (account === undefined) {
    throw new RangeError(`Unknown account: ${accountId}`)
  }
  return account.currency
}

export const COUNTERPARTIES = [
  { id: 'emp-01', name: 'Ilse Marwick', kind: 'employee' },
  { id: 'emp-02', name: 'Teodor Vasko', kind: 'employee' },
  { id: 'emp-03', name: 'Nuala Brenning', kind: 'employee' },
  { id: 'emp-04', name: 'Joaquim Ferlo', kind: 'employee' },
  { id: 'emp-05', name: 'Saskia Odeh', kind: 'employee' },
  { id: 'emp-06', name: 'Bram Ellery', kind: 'employee' },
  { id: 'emp-07', name: 'Mirela Kostand', kind: 'employee' },
  { id: 'emp-08', name: 'Emeka Sorvald', kind: 'employee' },
  { id: 'emp-09', name: 'Lotte Varhune', kind: 'employee' },
  { id: 'emp-10', name: 'Casimir Pell', kind: 'employee' },
  { id: 'emp-11', name: 'Yara Thessaly', kind: 'employee' },
  { id: 'emp-12', name: 'Oren Tallis', kind: 'employee' },
  { id: 'tax-01', name: 'Kellerstadt tax office', kind: 'tax' },
  { id: 'tax-02', name: 'Ashcombe revenue office', kind: 'tax' },
  { id: 'plt-01', name: 'Brindlecloud', kind: 'platform' },
  { id: 'plt-02', name: 'Tessellate Mail', kind: 'platform' },
  { id: 'plt-03', name: 'Owlgrid Analytics', kind: 'platform' },
  { id: 'plt-04', name: 'Kitefold Docs', kind: 'platform' },
  { id: 'plt-05', name: 'Murmurhall Chat', kind: 'platform' },
  { id: 'plt-06', name: 'Pebblewisp Design', kind: 'platform' },
  { id: 'plt-07', name: 'Cinderbox Hosting', kind: 'platform' },
  { id: 'plt-08', name: 'Ferngate Security', kind: 'platform' },
  { id: 'plt-09', name: 'Quillon Treasury', kind: 'platform' },
  { id: 'plt-10', name: 'Lanternfold Ads', kind: 'platform' },
  { id: 'plt-11', name: 'Tollwick Payments', kind: 'platform' },
  { id: 'sup-01', name: 'Halberd Street Properties', kind: 'supplier' },
  { id: 'sup-02', name: 'Juniper and Vale Legal', kind: 'supplier' },
  { id: 'sup-03', name: 'Okapi Office Supply', kind: 'supplier' },
  { id: 'sup-04', name: 'Marrow Lane Coffee', kind: 'supplier' },
  { id: 'sup-05', name: 'Tinsel Rail Travel', kind: 'supplier' },
  { id: 'sup-06', name: 'Wickhollow Inns', kind: 'supplier' },
  { id: 'sup-07', name: 'Saltmarsh Airways', kind: 'supplier' },
  { id: 'sup-08', name: 'Northwick Power and Water', kind: 'supplier' },
  { id: 'sup-09', name: 'Fennick Hardware', kind: 'supplier' },
  { id: 'sup-10', name: 'Vellumcraft Print Studio', kind: 'supplier' },
  { id: 'sup-11', name: 'Ottercombe Accounting', kind: 'supplier' },
  { id: 'sup-12', name: 'Saffrell Catering', kind: 'supplier' },
  { id: 'sup-13', name: 'Rookery Couriers', kind: 'supplier' },
  { id: 'sup-14', name: 'Brellow Furniture', kind: 'supplier' },
  { id: 'sup-15', name: 'Tellwyn Telecom', kind: 'supplier' },
  { id: 'sup-16', name: 'Yarrowby Canteen', kind: 'supplier' },
  { id: 'sup-17', name: 'Scrivell Stationers', kind: 'supplier' },
  { id: 'sup-18', name: 'Ferrowby Taxis', kind: 'supplier' },
  { id: 'sup-19', name: 'Vantley Recruiting', kind: 'supplier' },
  { id: 'cus-01', name: 'Harlowmere Logistics', kind: 'customer' },
  { id: 'cus-02', name: 'Quillmere Dental Rooms', kind: 'customer' },
  { id: 'cus-03', name: 'Atwell and Finch Studio', kind: 'customer' },
  { id: 'cus-04', name: 'Brindmoor Schools Trust', kind: 'customer' },
  { id: 'cus-05', name: 'Corvidae Robotics', kind: 'customer' },
  { id: 'cus-06', name: 'Ashtwine Clinics', kind: 'customer' },
  { id: 'cus-07', name: 'Quivermoor Haulage', kind: 'customer' },
  { id: 'cus-08', name: 'Oakhollow Brewing', kind: 'customer' },
  { id: 'cus-09', name: 'Kettlewick Field Services', kind: 'customer' },
  { id: 'cus-10', name: 'Wrenfield Architects', kind: 'customer' },
  { id: 'cus-11', name: 'Bluewick Candle Works', kind: 'customer' },
  { id: 'cus-12', name: 'Highmoor Outfitters', kind: 'customer' },
  { id: 'cus-13', name: 'Quarry Lane Bakers', kind: 'customer' },
  { id: 'cus-14', name: 'Sablewood Games', kind: 'customer' },
  { id: 'cus-15', name: 'Thrimble Tours', kind: 'customer' },
  { id: 'cus-16', name: 'Grebe Marine Supply', kind: 'customer' },
] as const satisfies readonly Counterparty[]

export type CounterpartyId = (typeof COUNTERPARTIES)[number]['id']

export const CARDS = [
  { id: 'card-01', holder: 'Ilse Marwick', last4: '4417', accountId: 'acc-main', monthlyLimit: 1_000_000, status: 'active' },
  { id: 'card-02', holder: 'Teodor Vasko', last4: '0932', accountId: 'acc-main', monthlyLimit: 500_000, status: 'active' },
  { id: 'card-03', holder: 'Nuala Brenning', last4: '7261', accountId: 'acc-main', monthlyLimit: 300_000, status: 'active' },
  { id: 'card-04', holder: 'Joaquim Ferlo', last4: '5580', accountId: 'acc-main', monthlyLimit: 300_000, status: 'frozen' },
  { id: 'card-05', holder: 'Saskia Odeh', last4: '1846', accountId: 'acc-main', monthlyLimit: 250_000, status: 'active' },
  { id: 'card-06', holder: 'Bram Ellery', last4: '3029', accountId: 'acc-main', monthlyLimit: 200_000, status: 'active' },
  { id: 'card-07', holder: 'Mirela Kostand', last4: '6673', accountId: 'acc-ops', monthlyLimit: 800_000, status: 'active' },
  { id: 'card-08', holder: 'Emeka Sorvald', last4: '2195', accountId: 'acc-ops', monthlyLimit: 400_000, status: 'active' },
  { id: 'card-09', holder: 'Lotte Varhune', last4: '8804', accountId: 'acc-ops', monthlyLimit: 400_000, status: 'frozen' },
  { id: 'card-10', holder: 'Casimir Pell', last4: '4752', accountId: 'acc-ops', monthlyLimit: 250_000, status: 'active' },
  { id: 'card-11', holder: 'Yara Thessaly', last4: '9318', accountId: 'acc-uk', monthlyLimit: 400_000, status: 'active' },
  { id: 'card-12', holder: 'Oren Tallis', last4: '0467', accountId: 'acc-uk', monthlyLimit: 250_000, status: 'active' },
] as const satisfies readonly Card[]

export type CardId = (typeof CARDS)[number]['id']

export const BUDGETS = [
  { categoryId: 'salaries', monthlyAmount: 9_000_000 },
  { categoryId: 'tax', monthlyAmount: 2_500_000 },
  { categoryId: 'rent', monthlyAmount: 1_800_000 },
  { categoryId: 'software', monthlyAmount: 3_000_000 },
  { categoryId: 'travel', monthlyAmount: 17_000_000 },
  { categoryId: 'meals', monthlyAmount: 5_000_000 },
  { categoryId: 'office', monthlyAmount: 6_500_000 },
  { categoryId: 'marketing', monthlyAmount: 35_000_000 },
  { categoryId: 'hardware', monthlyAmount: 12_000_000 },
  { categoryId: 'professional', monthlyAmount: 20_000_000 },
  { categoryId: 'utilities', monthlyAmount: 4_000_000 },
] as const satisfies readonly Budget[]
