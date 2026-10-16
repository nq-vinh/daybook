import {
  applyCategoryEdits,
  applyFeedSettlements,
  budgetSpend,
  buildLedgerIndex,
  cardSpend,
  counterpartyHistory,
  ledgerSeries,
  queryLedger,
} from './index'
import { assertNever, type LedgerRequest, type LedgerResponse } from './protocol'

const index = buildLedgerIndex()

function respond(response: LedgerResponse, transfer: Transferable[] = []): void {
  self.postMessage(response, { transfer })
}

function handle(request: LedgerRequest): void {
  switch (request.type) {
    case 'query': {
      const { ids, totals } = queryLedger(index, request.filter)
      respond({ type: 'result', requestId: request.requestId, ids, totals }, [ids.buffer])
      return
    }
    case 'history': {
      const ids = counterpartyHistory(index, request.counterpartyId, request.limit, request.exclude)
      respond({ type: 'history', requestId: request.requestId, ids }, [ids.buffer])
      return
    }
    case 'series':
      respond({ type: 'series', requestId: request.requestId, series: ledgerSeries(request.accountId) })
      return
    case 'edits':
      applyCategoryEdits(index, request.categories)
      return
    case 'feed':
      applyFeedSettlements(index, request.settled)
      return
    case 'cards':
      respond({ type: 'cards', requestId: request.requestId, cards: cardSpend(index) })
      return
    case 'budgets':
      respond({ type: 'budgets', requestId: request.requestId, budgets: budgetSpend(index) })
      return
    default:
      assertNever(request)
  }
}

self.onmessage = (event: MessageEvent<LedgerRequest>) => {
  handle(event.data)
}

respond({ type: 'ready' })
