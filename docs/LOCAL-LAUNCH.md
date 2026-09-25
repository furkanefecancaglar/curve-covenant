# Reproduce the local launch and graduation

These results are from **a local Solana validator**, using copies of the deployed DBC and DAMM v2 programs. They are not public devnet/mainnet deployments, traction, or externally verifiable public signatures. The tests use ephemeral generated signers and local faucet SOL. No user wallet or mainnet funds are used.

## Setup

Install the Solana CLI (including `solana-test-validator`), Node.js 22+, and this project's dependencies. Obtain the official [Meteora Invent repository](https://github.com/MeteoraAg/meteora-invent). The fixture used here was commit `dd77ef3d5aede3f0ff21d566d052097200417f5e`; its `studio/src/tests/artifacts` supplies canonical accounts and Metaplex.

```bash
npm ci
bash scripts/start-local-validator.sh /path/to/meteora-invent/studio
```

The helper reads deployed program binaries and the XRXx mint/badge from mainnet and starts a new, temporary local ledger on port 18899. It does not modify mainnet. Keep that terminal open and run in a second terminal:

```bash
# Stock-quoted config + token mint + virtual pool
QUOTE=XRXx npm run test:local

# SOL config + mint + pool, buy to threshold, graduate to DAMM v2
GRADUATE=1 npm run test:local
```

The lifecycle fixture lowers the market caps to 1 and 10 SOL to keep local funding small. Its graduation threshold is about 2.4025 SOL. It checks reserve >= threshold, submits the SDK migration transaction with both position NFT signers, verifies `isMigrated === 1` and the DAMM v2 account owner, then exercises the product's lifecycle reader and confirms nonzero destination quote balance. This is the same curve builder and migration SDK used by the product; the browser's Phantom signing interaction remains separately unverified with a real wallet.

## Observed results

XRXx launch:

- Local config: `4Rkm1BY1GDgKyY3et4H8z4ttpNzLGyxKLXpc6ntw4oPA`
- Local base mint: `7XAn5HLFyHa595BbSs2uqDbBccdc3Vi9HseYwtidF2Eo`
- Local DBC pool: `HRzLo2Hb92XNTZ3GR1b2eevyBDdDKp7XvdU6SfmJJJig`
- All three accounts were present after confirmation.

SOL lifecycle:

- Local DBC pool: `Cts7n5VCGAShnTaudbUjKqd8w2BLLce1C5WA4mDkkXRA`
- Local DAMM v2 pool: `9j6oUYEXSi81exHR6fpyZELJAhj9BY2eEUJNHp1wMz6B`
- Migration signature (local only): `2dCQ7gspj4cYRYjoMTKcvRVHBoPQdREz5CCBJibhjbYDsxH2vq5euT1tFaDUZGHjkyHCZFepaqJ575Lz1tGnUmMc`
- Destination owner: `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`
- Destination vaults read by the product: 239,770,187.153839 base tokens and 2.397701695 SOL.

Each rerun generates new addresses. The old bundled Invent DBC executable rejected the current XRXx mint with `InvalidQuoteMint`; using the currently deployed executable resolved that local fixture version mismatch.

Program hashes of the tested copies:

```text
DBC:     4c26a8a5da99f8ce932fa0300c46675b527090021fbb74214c9486bedda9f23b
DAMM v2: 4d5b920baebc090f89b2e8796a3452ed067c9667a143058c96a312f2c1e6848b
```

The setup script downloads the current deployments, so a future upgrade may change these hashes and behavior. A full stock-token swap/migration with real issuer constraints and any public wallet launch are still outstanding.

## Browser integration check

The actual launch form was exercised in Chromium with an ephemeral local signer implementing Phantom's signing interface. Playwright routed both configured RPC URLs to localhost; the test never sent to the public networks. Selecting XRXx, entering metadata, and submitting the form created local pool `6RAK5qq89aYjHiDkNJUiwmfJHLzvq6yWF1AUVNwSN6Ww`. The graduation panel then read the migrated local SOL pool and displayed both destination vault balances. No browser exceptions occurred.

The UI network labels in this isolated test reflect the selected form option because RPC calls were intercepted. They are not evidence of mainnet or public devnet transactions. This verifies browser application wiring and signing/confirmation handling, not Phantom extension behavior or public deployment.
