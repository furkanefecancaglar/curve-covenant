import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { buildStudioConfig, PRESETS } from '../src/studio'

const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
const payer = Keypair.generate()
const config = Keypair.generate()
const quoteMint = new PublicKey('So11111111111111111111111111111111111111112')

try {
  const airdrop = await connection.requestAirdrop(payer.publicKey, Math.floor(LAMPORTS_PER_SOL * 0.1))
  await connection.confirmTransaction(airdrop, 'confirmed')
  const client = DynamicBondingCurveClient.create(connection, 'confirmed')
  const transaction = await client.partner.createConfig({
    ...buildStudioConfig(PRESETS.steady.values), payer: payer.publicKey, config: config.publicKey,
    feeClaimer: payer.publicKey, leftoverReceiver: payer.publicKey, quoteMint,
  })
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  transaction.feePayer = payer.publicKey
  transaction.recentBlockhash = blockhash
  transaction.sign(payer, config)
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false })
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  const account = await connection.getAccountInfo(config.publicKey, 'confirmed')
  console.log(JSON.stringify({ successful: Boolean(account), configAddress: config.publicKey.toBase58(), signature, owner: account?.owner.toBase58() }))
  if (!account) process.exitCode = 1
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
