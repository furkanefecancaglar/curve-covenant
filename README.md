# Curve Covenant Pair Launch

**A Meteora DBC launch workbench for tokens quoted in tokenized stocks.**

[Live product](https://furkanefecancaglar.github.io/curve-covenant/) · [Live DBC inspector](https://furkanefecancaglar.github.io/curve-covenant/?view=inspector) · [Competition track](https://superteam.fun/earn/listing/meteora-dbc)

Meteora DBC supports stock tokens as quote assets. Pair Launch lets a builder select an issuer-listed xStock, choose a launch curve, simulate a hypothetical early buy with the official DBC quote math, and build one wallet-confirmed transaction that creates the DBC config, SPL token mint and virtual pool. A SOL/devnet option lets builders rehearse the same flow without mainnet funds. The graduation panel reads live DBC reserve progress, builds the DAMM v2 migration transaction, and verifies the destination pool and its vault balances. A complete SOL launch → buy → DAMM v2 graduation has been confirmed on a local validator; no public network graduation is claimed.

This is an independent early-stage product, not a Meteora or xStocks product. A new token quoted in an xStock is **not** ownership in the underlying company. Mainnet launches use real SOL for rent and fees; the user must review and confirm each wallet transaction.

## Why this specific launch flow

Stock-token quotes make price discovery possible in units of a tokenized equity instead of SOL or USDC. A thin quote market can make an abrupt opening curve particularly hard to reason about. The workbench includes a 16-segment long curve with four times as much SDK liquidity weight in its early segments as in its final segment, plus a decaying fee schedule. Builders can compare it with fixed-fee, simple decaying-fee and two-stage designs. These are experimental technical models, not claims of better market outcomes.

The xStock catalog currently includes XRXx, FLNCx, QUBTx and AIx. Their mint addresses came from the [issuer's public assets API](https://api.xstocks.fi/api/v2/public/assets) and were checked against Solana mainnet on 2026-09-25. The browser checks mint owner, precision, paused/transfer-hook state and the DBC token badge again before building a stock-quoted transaction. An issuer listing and token badge do not guarantee that the token remains tradable or suitable for a particular market.

## Flow

1. Select SOL on devnet or an xStock on mainnet.
2. Choose a curve model and edit supply, opening/graduation market caps in quote units, fee schedule, creator share and permanent liquidity lock.
3. Read the SDK-derived graduation quote threshold and simulate a hypothetical buy before a pool exists. Export the exact SDK config JSON.
4. Provide token name, symbol and an HTTPS metadata JSON URL. The devnet form includes a clearly labeled CCDEMO example hosted in this repo; replace it with matching metadata for your own token. The wallet-confirmed SDK transaction creates config + token mint + DBC virtual pool together. The app checks for both new accounts and links to the explorer.
5. Paste a DBC pool address into the graduation panel. It checks reserve progress, enables wallet migration after the threshold, and reads DAMM v2 vault balances after graduation.
6. Use the [companion inspector](https://furkanefecancaglar.github.io/curve-covenant/?view=inspector) to read real reserve progress and terms from an existing DBC pool. The inspector also supports a swap quote, embeddable report, and signed disclosure comparison.

The product currently requires a user-hosted metadata JSON URL. It does not upload images, create an xStock, custody funds, operate an unattended migration keeper, or create DLMM positions. Combined SOL and XRXx launches and the complete SOL DBC → DAMM v2 lifecycle have been confirmed on a **local validator**, using the official deployed programs. See [reproduction and evidence](docs/LOCAL-LAUNCH.md). A public devnet/mainnet launch through Phantom has **not** yet been confirmed. Our devnet faucet probe was rate limited on 2026-09-25, so it is not evidence of a deployed pool. There are no claimed active users or trading volume.

## Development

```bash
npm ci
npm run dev
npm test
npm run build
npm run smoke
```

Node.js 22+ is required. The app is a static Vite/React site. Meteora SDK calculations and Solana RPC reads happen in the browser. Mainnet reads default to PublicNode because Solana's public mainnet RPC can reject browser origins; the inspector allows a custom RPC.

Key files:

- [`src/studio.ts`](src/studio.ts) — four DBC curve/fee designs, SDK validation and pre-launch quote simulation.
- [`src/quotes.ts`](src/quotes.ts) — issuer-listed xStock mints, mint precision and DBC token badge verification.
- [`src/lifecycle.ts`](src/lifecycle.ts) — DBC reserve progress, DAMM v2 migration, destination verification and vault reads.
- [`src/CurveChart.tsx`](src/CurveChart.tsx) — interactive curve visualization from 33 SDK-calculated points.
- [`src/publish.ts`](src/publish.ts) — Phantom-signed config or combined config + pool creation.
- [`src/Studio.tsx`](src/Studio.tsx) and [`src/LaunchPanel.tsx`](src/LaunchPanel.tsx) — product UI.
- [`src/dbc.ts`](src/dbc.ts) and [`src/covenant.ts`](src/covenant.ts) — live inspector and signed term checks.

The included `scripts/devnet-probe.ts` demonstrates a standalone ephemeral-keypair devnet config creation. It requests test SOL from the public faucet and may fail when that faucet is unavailable; no private key is stored.

## Competition status

The [readiness file](docs/SUBMISSION.md) maps the product to Meteora and Colosseum criteria. It documents the remaining public wallet launch proof, user validation, stock-token migration testing, and new presentation/demo work. The previous inspector-only videos and deck were removed. No Colosseum or Superteam submission and no prize are claimed.

## Sources

- [Meteora DBC developer guide](https://docs.meteora.ag/developer-guides/dbc)
- [Meteora Invent launchpad scaffold](https://docs.meteora.ag/invent/scaffold/fun-launch)
- [Meteora Invent actions](https://docs.meteora.ag/invent/actions)
- [Official DBC SDK](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk)
- [xStocks issuer asset API](https://api.xstocks.fi/api/v2/public/assets)

## License

MIT. Meteora components retain their own licenses.
