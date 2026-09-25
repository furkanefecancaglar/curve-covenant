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

The setup script downloads the current deployments, so a future upgrade may change these hashes and behavior. The stock-token local lifecycle is now covered below. A public wallet launch and real issuer-funded trading remain outstanding.

## Browser integration check

The actual launch form was exercised in Chromium with an ephemeral local signer implementing Phantom's signing interface. Playwright routed both configured RPC URLs to localhost; the test never sent to the public networks. Selecting XRXx, entering metadata, and submitting the form created local pool `6RAK5qq89aYjHiDkNJUiwmfJHLzvq6yWF1AUVNwSN6Ww`. The graduation panel then read the migrated local SOL pool and displayed both destination vault balances. No browser exceptions occurred.

The UI network labels in this isolated test reflect the selected form option because RPC calls were intercepted. They are not evidence of mainnet or public devnet transactions. This verifies browser application wiring and signing/confirmation handling, not Phantom extension behavior or public deployment.

## Full browser lifecycle regression

Run the local validator, then start the app with `npm run dev -- --port 4175`. In another terminal:

```bash
CHROMIUM_PATH=/path/to/chromium node scripts/browser-local-flow.mjs
```

This reproducible test creates a SOL pool through the real form, checks that the pool address transfers into the graduation panel, asks for a 3 SOL buy quote, signs the swap with its displayed minimum output, waits for the graduation threshold, signs the migration, and checks that the resulting vault balances are displayed without browser exceptions. All RPC requests are routed to localhost, and the signing interface uses an ephemeral local test key.

Observed local DBC pool: `5Vk6KfLEH4WDmdCQBVQnkM3uJaaqtvgfVtkrrKzhrtCa`. Observed local DAMM v2 pool: `DGdSsFgVawb8c6SaDZi3RYkojxF5DyZ2sDqjKhUVYE5v`. All stages passed.

## Stock-token long-curve lifecycle (2026-09-26)

This fixture uses the actual cloned XRXx mint, including its Token-2022 extensions, its DBC badge, the current deployed programs, and the current canonical DAMM v2 migration config. It gives a local test token account a **synthetic 1,000 XRXx balance in genesis**. It neither mints nor acquires real xStocks and makes no mainnet write. The generated signer is temporary and saved with mode 0600 outside the repository.

Start the normal local validator on port 18899 first. Then:

```bash
npx tsx scripts/prepare-stock-fixture.ts
# The command prints a fresh /tmp/curve-stock-fixture-... directory.
EXTRA_ACCOUNTS_DIR=/tmp/curve-stock-fixture-.../accounts \
LOCAL_GOSSIP_PORT=19100 LOCAL_DYNAMIC_PORT_RANGE=19101-19130 \
LOCAL_FAUCET_PORT=19950 LOCAL_RPC_PORT=19299 \
bash scripts/start-local-validator.sh /path/to/meteora-invent/studio
```

With this second validator running, test the stock launch in another terminal:

```bash
STOCK_FIXTURE_DIR=/tmp/curve-stock-fixture-... \
LOCAL_RPC_PORT=19299 QUOTE=XRXx GRADUATE=1 PRESET=long npm run test:local

# App must be running on port 4175. This also tests rejecting and resuming step 2.
STOCK_FIXTURE_DIR=/tmp/curve-stock-fixture-... LOCAL_RPC_PORT=19299 \
LONG_CURVE=1 CANCEL_SECOND=1 CHROMIUM_PATH=/path/to/chromium \
node scripts/browser-local-flow.mjs
```

Two implementation defects were found and corrected:

1. The 16-segment stock launch's combined transaction measured 1,603 bytes, above Solana's 1,232-byte packet limit. The product now measures the actual SDK transaction and splits oversized launches into config creation (1,110 bytes in this fixture) and token/pool creation. A declined second approval can resume with the same config and mint in the same tab. Smaller curves still use the combined transaction. An offline regression signs the SDK transactions for all four presets and both SOL/XRXx to check their real serialized size.
2. The bundled Invent DAMM migration config had `permission=0`; the current mainnet copy has `permission=1` for stock-token support. The validator setup now fetches that current account. This config also enables dynamic fees: the product's old “fixed 1%” wording was wrong. The UI now reads the destination's initial base and dynamic fee settings from chain. Ignored custom fee parameters were removed from the fixed-fee config builder.

Observed full browser result, using the synthetic local balance:

- DBC pool: `8LH1FJ3fYXKoowcfRMvcxoRVtcWvbd7CNncPm9f4GAvV`
- DAMM v2 pool: `8AcsMrWyWtqur7ywHkse4RPjx8hz6H5LQmEKJZCoRcuj`
- Sequence: config approval → deliberately declined pool approval → resumed pool approval → buy → graduation → destination vault reads.
- Five signing attempts, zero browser exceptions.
- Final vault balances: 192,852,846.56431 base tokens and 1.92852777 quote tokens.
- Destination terms displayed: 1% initial base fee plus dynamic fee.

The public-network labels in this isolated browser test are intercepted to localhost. This is local integration evidence, not mainnet usage or Phantom extension certification. Issuer changes to mint controls after the snapshot are not covered.
