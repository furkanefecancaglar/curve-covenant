import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js'
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QUOTES } from '../src/quotes'

// Local genesis fixture only. The issuer mint, badge and program accounts remain unchanged.
// A synthetic quote balance makes local stock-token swaps reproducible without issuer keys.
const connection = new Connection('http://127.0.0.1:18899', 'confirmed')
const payer = Keypair.generate()
const funding = await connection.requestAirdrop(payer.publicKey, 1_000_000_000)
await connection.confirmTransaction(funding, 'confirmed')
const mint = new PublicKey(QUOTES.XRXx.mint)
const ata = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID)
const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(
  payer.publicKey, ata, payer.publicKey, mint, TOKEN_2022_PROGRAM_ID))
await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed' })
const account = await connection.getAccountInfo(ata)
if (!account) throw new Error('Local token account creation failed')
const data = Buffer.from(account.data)
data.writeBigUInt64LE(1_000n * 10n ** 8n, 64)
const directory = await mkdtemp(join(tmpdir(), 'curve-stock-fixture-'))
await mkdir(join(directory, 'accounts'))
await writeFile(join(directory, 'accounts', `${ata.toBase58()}.json`), JSON.stringify({ pubkey: ata.toBase58(), account: {
  data: [data.toString('base64'), 'base64'], owner: account.owner.toBase58(), executable: false,
  lamports: account.lamports, rentEpoch: 0,
} }))
await writeFile(join(directory, 'signer.json'), JSON.stringify(Array.from(payer.secretKey)), { mode: 0o600 })
await writeFile(join(directory, 'fixture.json'), JSON.stringify({ network: 'local-validator', syntheticBalance: true,
  mint: mint.toBase58(), ata: ata.toBase58(), owner: payer.publicKey.toBase58(), amount: '1000', decimals: 8 }))
console.log(directory)
