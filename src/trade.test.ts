import { afterEach, expect, it, vi } from 'vitest'
import { DynamicBondingCurveClient, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { Keypair, Transaction } from '@solana/web3.js'
import { executeTrade, validateTradePreview } from './trade'
import type { TradePreview } from './trade'
import { connectWallet, sendWalletTransaction } from './wallet'

vi.mock('./wallet', () => ({ connectWallet: vi.fn(), sendWalletTransaction: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

const preview: TradePreview = { pool: Keypair.generate().publicKey.toBase58(), network: 'devnet',
  quote: { side: 'buy', input: '1.5', inputDecimals: 8, outputDecimals: 6, inputSymbol: 'XRXx', outputSymbol: 'base tokens',
    estimatedOutput: '100', minimumOutput: '99', tradingFee: '0.01', protocolFee: '0.002', feeAsset: 'XRXx',
    unfilledInput: '0', slippageBps: 100, fetchedAt: '2026-09-25T00:00:00.000Z' } }

it('preserves the user-reviewed buy minimum and quote precision', () => {
  const values = validateTradePreview(preview, Date.parse(preview.quote.fetchedAt) + 10_000)
  expect(values.amountIn.toString()).toBe('150000000')
  expect(values.minimumAmountOut.toString()).toBe('99000000')
})

it('uses base input precision and quote output precision when selling', () => {
  const sell: TradePreview = { ...preview, quote: { ...preview.quote, side: 'sell', input: '123.123456',
    inputDecimals: 6, outputDecimals: 8, minimumOutput: '0.00000123' } }
  const values = validateTradePreview(sell, Date.parse(preview.quote.fetchedAt))
  expect(values.amountIn.toString()).toBe('123123456')
  expect(values.minimumAmountOut.toString()).toBe('123')
  expect(() => validateTradePreview({ ...sell, quote: { ...sell.quote, input: '1.1234567' } }, Date.parse(preview.quote.fetchedAt))).toThrow('6 decimal places')
})

it('requires a fresh quote and a positive minimum output', () => {
  const now = Date.parse(preview.quote.fetchedAt)
  for (const fetchedAt of [new Date(now - 60_001).toISOString(), new Date(now + 1).toISOString(), 'invalid']) {
    expect(() => validateTradePreview({ ...preview, quote: { ...preview.quote, fetchedAt } }, now)).toThrow('expired')
  }
  expect(() => validateTradePreview({ ...preview, quote: { ...preview.quote, minimumOutput: '0' } }, now)).toThrow('greater than zero')
})

it.each(['buy', 'sell'] as const)('builds the %s transaction in the reviewed direction with exact minimum output', async side => {
  const swap2 = vi.fn().mockResolvedValue(new Transaction())
  vi.spyOn(DynamicBondingCurveClient, 'create').mockReturnValue({ pool: { swap2 } } as unknown as DynamicBondingCurveClient)
  const payer = Keypair.generate().publicKey
  vi.mocked(connectWallet).mockResolvedValue({ publicKey: payer, wallet: { connect: vi.fn(), signTransaction: vi.fn() } })
  vi.mocked(sendWalletTransaction).mockResolvedValue('confirmed')
  const trade: TradePreview = { ...preview, quote: { ...preview.quote, side, fetchedAt: new Date().toISOString() } }
  expect(await executeTrade(trade)).toBe('confirmed')
  expect(swap2.mock.calls[0][0]).toMatchObject({ swapBaseForQuote: side === 'sell', swapMode: SwapMode.PartialFill, owner: payer, payer })
  expect(swap2.mock.calls[0][0].minimumAmountOut.toString()).toBe('99000000')
})

it('checks quote expiry again after connecting the wallet', async () => {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.mocked(connectWallet).mockImplementation(async () => {
    vi.mocked(Date.now).mockReturnValue(now + 60_001)
    return { publicKey: Keypair.generate().publicKey, wallet: { connect: vi.fn(), signTransaction: vi.fn() } }
  })
  const swap2 = vi.fn()
  vi.spyOn(DynamicBondingCurveClient, 'create').mockReturnValue({ pool: { swap2 } } as unknown as DynamicBondingCurveClient)
  await expect(executeTrade({ ...preview, quote: { ...preview.quote, fetchedAt: new Date(now).toISOString() } })).rejects.toThrow('expired')
  expect(swap2).not.toHaveBeenCalled()
})
