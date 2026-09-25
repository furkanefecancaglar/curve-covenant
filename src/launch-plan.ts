import { PublicKey } from '@solana/web3.js'
import type { Transaction } from '@solana/web3.js'
import type { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'

export function transactionBytes(transaction: Transaction, payer: PublicKey): number {
  transaction.feePayer = payer
  transaction.recentBlockhash = PublicKey.default.toBase58()
  const message = transaction.compileMessage()
  return 1 + message.header.numRequiredSignatures * 64 + message.serialize().length
}

export async function buildLaunchPlan(client: DynamicBondingCurveClient,
  params: Parameters<DynamicBondingCurveClient['partner']['createConfigAndPool']>[0]) {
  if (!params.payer) throw new Error('A launch payer is required.')
  const payer = new PublicKey(params.payer)
  const combined = await client.partner.createConfigAndPool(params)
  const combinedBytes = transactionBytes(combined, payer)
  if (combinedBytes <= 1232) return { mode: 'combined' as const, transaction: combined, bytes: combinedBytes }
  const configOnly = await client.partner.createConfig(params)
  const bytes = transactionBytes(configOnly, payer)
  if (bytes > 1232) throw new Error('This curve configuration exceeds the transaction limit. Choose a smaller curve.')
  return { mode: 'split' as const, transaction: configOnly, bytes }
}
