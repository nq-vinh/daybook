import { applyCategoryEdits, buildLedgerIndex, counterpartyHistory, ledgerSeries, queryLedger } from './index'
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
    default:
      assertNever(request)
  }
}

self.onmessage = (event: MessageEvent<LedgerRequest>) => {
  handle(event.data)
}

respond({ type: 'ready' })
