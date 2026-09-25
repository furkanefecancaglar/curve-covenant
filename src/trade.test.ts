import { expect, it } from 'vitest'
import { validateTradePreview } from './trade'
import type { TradePreview } from './trade'

const preview: TradePreview = { pool: 'unused', network: 'devnet', quoteDecimals: 8,
  quote: { input: '1.5', quoteSymbol: 'XRXx', estimatedTokens: '100', minimumTokens: '99',
    baseDecimals: 6, tradingFee: '0.01', protocolFee: '0.002', feeAsset: 'XRXx',
    unfilledInput: '0', slippageBps: 100, fetchedAt: '2026-09-25T00:00:00.000Z' } }

it('preserves the user-reviewed minimum output and quote precision in the transaction', () => {
  const values = validateTradePreview(preview, Date.parse(preview.quote.fetchedAt) + 10_000)
  expect(values.amountIn.toString()).toBe('150000000')
  expect(values.minimumAmountOut.toString()).toBe('99000000')
})

it('requires a fresh quote and a positive minimum output', () => {
  const now = Date.parse(preview.quote.fetchedAt)
  expect(() => validateTradePreview(preview, now + 60_001)).toThrow('expired')
  expect(() => validateTradePreview({ ...preview, quote: { ...preview.quote, minimumTokens: '0' } }, now)).toThrow('greater than zero')
})
