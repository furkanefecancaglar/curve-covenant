import { Connection, PublicKey } from '@solana/web3.js'
import { deriveTokenBadgeAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { DBC_PROGRAM } from './dbc'

export type QuoteId = 'SOL' | 'XRXx' | 'FLNCx' | 'QUBTx' | 'AIx'
export type QuoteAsset = { id: QuoteId; name: string; mint: string; decimals: number; network: 'devnet' | 'mainnet-beta'; category: string }

// Stock mints from the issuer's public assets API, checked against Solana mainnet on 2026-09-25.
// The badge check is repeated before any stock-quoted transaction is built.
export const QUOTES: Record<QuoteId, QuoteAsset> = {
  SOL: { id: 'SOL', name: 'Solana devnet SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9, network: 'devnet', category: 'Test launch' },
  XRXx: { id: 'XRXx', name: 'Xerox xStock', mint: 'XsensupeZBdHxZtdnLptf1UfWpVyancWcit7qWFYZrJ', decimals: 8, network: 'mainnet-beta', category: 'Tokenized equity quote' },
  FLNCx: { id: 'FLNCx', name: 'Fluence Energy xStock', mint: 'Xsc5BxL1ucvrQNXZqW3CT8M9gWTko1LPSLLkSVzGe9h', decimals: 8, network: 'mainnet-beta', category: 'Tokenized equity quote' },
  QUBTx: { id: 'QUBTx', name: 'Quantum Computing xStock', mint: 'XsRJiWgqGJrDaidERfWfdZkaxdA4VPjVEqN6XFctpp3', decimals: 8, network: 'mainnet-beta', category: 'Tokenized equity quote' },
  AIx: { id: 'AIx', name: 'C3.ai xStock', mint: 'Xs7QhN79WzM4hjfHbu2W46ZRkdyumim3ooJHhPxenoU', decimals: 8, network: 'mainnet-beta', category: 'Tokenized equity quote' },
}

export async function verifyQuoteAsset(connection: Connection, quote: QuoteAsset): Promise<PublicKey | undefined> {
  if (quote.id === 'SOL') return undefined
  const mint = new PublicKey(quote.mint)
  const badge = deriveTokenBadgeAddress(mint)
  const [mintInfo, badgeInfo] = await Promise.all([
    connection.getParsedAccountInfo(mint, 'confirmed'),
    connection.getAccountInfo(badge, 'confirmed'),
  ])
  const data = mintInfo.value?.data
  const info = data && typeof data === 'object' && 'parsed' in data
    ? (data.parsed as { info?: { decimals?: number; extensions?: { extension: string; state?: { paused?: boolean; programId?: string | null } }[] } }).info : undefined
  if (mintInfo.value?.owner.toBase58() !== 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
    throw new Error(`The ${quote.id} mint is not owned by the expected Token-2022 program.`)
  }
  if (info?.decimals !== quote.decimals) throw new Error(`Quote mint decimals changed for ${quote.id}. Launch stopped.`)
  if (info.extensions?.some(extension => extension.extension === 'pausableConfig' && extension.state?.paused)) {
    throw new Error(`${quote.id} transfers are paused by the issuer.`)
  }
  if (info.extensions?.some(extension => extension.extension === 'transferHook' && extension.state?.programId)) {
    throw new Error(`${quote.id} has an active transfer hook that this launch flow does not support.`)
  }
  if (!badgeInfo || badgeInfo.owner.toBase58() !== DBC_PROGRAM) {
    throw new Error(`Meteora DBC token badge is missing for ${quote.id}. Launch stopped.`)
  }
  return badge
}
