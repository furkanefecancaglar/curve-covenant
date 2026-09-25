import { expect, it, vi } from 'vitest'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { DynamicBondingCurveClient, deriveTokenBadgeAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { buildStudioConfig, PRESETS } from './studio'
import { QUOTES } from './quotes'
import { buildLaunchPlan } from './launch-plan'

it('keeps signed SDK launch transactions inside Solana packet limits for SOL and stock curves', async () => {
  for (const quote of [QUOTES.SOL, QUOTES.XRXx]) {
    const connection = new Connection('http://127.0.0.1:8899')
    // The builder only needs the quote mint's owning token program; no network calls in this regression.
    vi.spyOn(connection, 'getAccountInfo').mockResolvedValue({ owner: quote.id === 'SOL' ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID,
      lamports: 1, executable: false, data: Buffer.alloc(0) })
    const client = DynamicBondingCurveClient.create(connection)
    for (const preset of Object.values(PRESETS)) {
      const payer = Keypair.generate(), config = Keypair.generate(), mint = Keypair.generate()
      const quoteMint = new PublicKey(quote.mint)
      const plan = await buildLaunchPlan(client, { ...buildStudioConfig(preset.values, quote.decimals),
        payer: payer.publicKey, config: config.publicKey, quoteMint, feeClaimer: payer.publicKey, leftoverReceiver: payer.publicKey,
        tokenBadge: quote.id === 'SOL' ? undefined : deriveTokenBadgeAddress(quoteMint),
        preCreatePoolParam: { name: 'Curve Covenant Demo', symbol: 'CCDEMO', uri: 'https://example.org/metadata.json',
          poolCreator: payer.publicKey, baseMint: mint.publicKey } })
      plan.transaction.sign(...(plan.mode === 'split' ? [payer, config] : [payer, config, mint]))
      expect(plan.transaction.serialize().length).toBe(plan.bytes)
      expect(plan.bytes).toBeLessThanOrEqual(1232)
      expect(plan.mode).toBe(preset.values.preset === 'long' ? 'split' : 'combined')
    }
  }
})
