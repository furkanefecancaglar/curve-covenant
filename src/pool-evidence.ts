import { Connection, PublicKey } from '@solana/web3.js'
import { loadLaunch, RPC } from './dbc'
import type { Network } from './dbc'
import { readLifecycle } from './lifecycle'

const GENESIS: Record<Network, string> = {
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
}
export function evidenceNetwork(genesis: string) {
  return genesis === GENESIS.devnet ? 'public-devnet' : genesis === GENESIS['mainnet-beta'] ? 'mainnet-beta' : 'unrecognized-network'
}

export async function readPoolEvidence(address: string, network: Network, endpoint = RPC[network]) {
  const connection = new Connection(endpoint, 'confirmed')
  const pool = new PublicKey(address)
  const [genesisHash, launch, lifecycle, signatures] = await Promise.all([
    connection.getGenesisHash(), loadLaunch(address, network, endpoint), readLifecycle(address, network, endpoint),
    connection.getSignaturesForAddress(pool, { limit: 20 }, 'confirmed'),
  ])
  const observedNetwork = evidenceNetwork(genesisHash)
  const publicNetwork = observedNetwork !== 'unrecognized-network'
  if (publicNetwork && genesisHash !== GENESIS[network]) throw new Error('The RPC network does not match the selected network. No evidence report was exported.')
  const receipts = []
  // Read in small batches to respect public RPC limits. Missing receipts stay missing.
  for (let i = 0; i < signatures.length; i += 2) {
    const batch = await Promise.all(signatures.slice(i, i + 2).map(async entry => {
      const transaction = await connection.getTransaction(entry.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
      const accounts = transaction?.transaction.message.staticAccountKeys ?? []
      return { signature: entry.signature, slot: entry.slot, blockTime: entry.blockTime,
        signatureStatusError: entry.err, transactionAvailable: !!transaction,
        succeeded: transaction?.meta ? transaction.meta.err === null : null,
        feeLamports: transaction?.meta?.fee ?? null,
        signers: accounts.slice(0, transaction?.transaction.message.header.numRequiredSignatures ?? 0).map(key => key.toBase58()),
        instructions: transaction?.meta?.logMessages?.filter(line => line.startsWith('Program log: Instruction:')) ?? [],
        explorerUrl: publicNetwork ? `https://solscan.io/tx/${entry.signature}${observedNetwork === 'public-devnet' ? '?cluster=devnet' : ''}` : null,
      }
    }))
    receipts.push(...batch)
  }
  return { format: 'curve-covenant/pool-evidence-v1', fetchedAt: new Date().toISOString(),
    requestedNetwork: network, observedNetwork, genesisHash,
    scope: 'Latest 20 transactions referencing this pool; not a complete history, organic volume, or proof of which wallet application signed.',
    pool: address, launch, lifecycle, receipts }
}

export function downloadPoolEvidence(evidence: Awaited<ReturnType<typeof readPoolEvidence>>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = `pool-${evidence.pool}-evidence.json`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
