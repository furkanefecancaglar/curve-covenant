import { loadLaunch } from '../src/dbc'
import { Connection } from '@solana/web3.js'
import { QUOTES, verifyQuoteAsset } from '../src/quotes'

const CONFIG = '3jdtmNC1rZP8Li6ERtt4JjdAgQEJ6XAEzCQfvNB8hT8L'
const launch = await loadLaunch(CONFIG, 'mainnet-beta')
if (launch.kind !== 'config' || launch.migrationTarget !== 'Meteora DAMM v2' ||
    launch.quoteDecimals !== 6 || Number(launch.migrationQuoteThreshold) <= 0) {
  throw new Error('Live DBC config produced an unexpected result')
}
console.log(`DBC smoke passed: config ${launch.configAddress}, slot ${launch.slot}`)
const badge = await verifyQuoteAsset(new Connection('https://solana-rpc.publicnode.com', 'confirmed'), QUOTES.XRXx)
if (!badge) throw new Error('XRXx DBC token badge missing')
console.log(`Stock quote smoke passed: XRXx badge ${badge.toBase58()}`)
