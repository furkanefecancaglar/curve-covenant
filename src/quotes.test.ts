import { expect, it, vi } from 'vitest'
import type { Connection } from '@solana/web3.js'
import { QUOTES, isSolQuote, quoteSymbol, verifyQuoteAsset } from './quotes'
import { decodeDesign, encodeDesign } from './design'
import { PRESETS } from './studio'

it('keeps legacy SOL links on devnet and mainnet SOL links on mainnet', () => {
  for (const id of ['SOL', 'SOL-mainnet'] as const) {
    const restored = decodeDesign(encodeDesign(id, PRESETS.steady.values))
    expect(restored.quoteId).toBe(id)
    expect(QUOTES[restored.quoteId].network).toBe(id === 'SOL' ? 'devnet' : 'mainnet-beta')
    expect(quoteSymbol(QUOTES[id])).toBe('SOL')
    expect(QUOTES[id].decimals).toBe(9)
  }
  expect(QUOTES.SOL.mint).toBe(QUOTES['SOL-mainnet'].mint)
})

it('uses native SOL on both networks without stock token badge lookups', async () => {
  const connection = { getParsedAccountInfo: vi.fn(), getAccountInfo: vi.fn() }
  for (const quote of [QUOTES.SOL, QUOTES['SOL-mainnet']]) {
    expect(isSolQuote(quote)).toBe(true)
    await expect(verifyQuoteAsset(connection as unknown as Connection, quote)).resolves.toBeUndefined()
  }
  expect(isSolQuote(QUOTES.XRXx)).toBe(false)
  expect(connection.getParsedAccountInfo).not.toHaveBeenCalled()
  expect(connection.getAccountInfo).not.toHaveBeenCalled()
})
