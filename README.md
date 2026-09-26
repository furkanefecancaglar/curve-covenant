# Curve Covenant Pair Launch

**Measure curve trade-offs for xStock-paired DBC launches, then launch the configuration you chose.**

[Live product](https://furkanefecancaglar.github.io/curve-covenant/) · [Live DBC inspector](https://furkanefecancaglar.github.io/curve-covenant/?view=inspector) · [Competition track](https://superteam.fun/earn/listing/meteora-dbc)

Meteora DBC supports stock tokens as quote assets. Pair Launch lets a builder select an issuer-listed xStock, choose a launch curve, simulate a hypothetical early buy with the official DBC quote math, and build wallet-confirmed transactions that create the DBC config, SPL token mint and virtual pool. A SOL/devnet option lets builders rehearse the same flow without mainnet funds. The graduation panel reads live DBC reserve progress, builds the DAMM v2 migration transaction, and verifies the destination pool and its vault balances. Complete SOL and XRXx long-curve launch → buy → DAMM v2 graduation have been confirmed on a local validator; no public network graduation is claimed.

This is an independent early-stage product, not a Meteora or xStocks product. A new token quoted in an xStock is **not** ownership in the underlying company. Mainnet launches use real SOL for rent and fees; the user must review and confirm each wallet transaction.

## Scenario-driven selection

The Scenario Lab compares one-segment and 16-segment curves under sequential retail buys, an early whale, buy/sell pressure and graduation progress. Both use the same supply, exact opening price, quote reserve threshold and fee schedule. Ending prices differ. Every trade advances reserves and actor inventory; results include price paths, cohort costs, early buy-output share, fees and graduation progress.

Export the complete raw-unit ledger and SDK configurations as JSON, or a standalone SVG summary. Select a compared configuration for launch and share a link that restores it exactly. The engine matched **56 actual swaps on eight local pools** across SOL/XRXx, both curves and fixed/decaying fees. See the [method and raw proof](docs/SCENARIO-METHOD.md).

The long curve is not declared universally better: in the checked-in whale example it lowers the first price jump from 311.08% to 239.16%, but increases the early cohort's share of buy output from 88.70% to 91.23%. These are hypothetical schedule results, not observed demand or a fairness guarantee. The scenarios do not model external quote liquidity or stock-price changes.

[Whale report](docs/evidence/scenarios/whale.json) · [Visual summary](docs/evidence/scenarios/whale.svg) · [Roadmap and acceptance gates](docs/ROADMAP.md)

## Why this specific launch flow

Stock-token quotes make price discovery possible in units of a tokenized equity instead of SOL or USDC. A thin quote market can make an abrupt opening curve particularly hard to reason about. The workbench includes a 16-segment long curve with four times as much SDK liquidity weight in its early segments as in its final segment, plus a decaying fee schedule. Builders can compare it with fixed-fee, simple decaying-fee and two-stage designs. The two-stage preset reserves 35% of supply as leftover with the launch wallet as receiver; the other presets reserve 0.001%. This is displayed alongside the design. DAMM v2 starts with a 1% base trading fee plus a dynamic fee after graduation. These are experimental technical models, not claims of better market outcomes.

The xStock catalog currently includes XRXx, FLNCx, QUBTx and AIx. Their mint addresses came from the [issuer's public assets API](https://api.xstocks.fi/api/v2/public/assets) and were checked against Solana mainnet on 2026-09-25. The browser checks mint owner, precision, paused/transfer-hook state and the DBC token badge again before building a stock-quoted transaction. An issuer listing and token badge do not guarantee that the token remains tradable or suitable for a particular market.

## Flow

1. Select SOL on devnet or an xStock on mainnet.
2. Choose a curve model and edit supply, opening/graduation market caps in quote units, fee schedule, creator share and permanent liquidity lock.
3. Read the SDK-derived graduation quote threshold and simulate a hypothetical buy before a pool exists. Compare three curve shapes side by side under the same supply, market caps and fee schedule, including average execution cost relative to the opening price, leftover allocation and unfilled input. Export the exact SDK config JSON or copy a share link that recreates the quote asset and all edited terms.
4. Provide token name, symbol and an HTTPS metadata JSON URL. The devnet form includes a clearly labeled CCDEMO example hosted in this repo; replace it with matching metadata for your own token. The SDK creates config + token mint + DBC virtual pool, using two wallet approvals when the curve exceeds a single transaction. An unfinished second step can be resumed in the same tab. The app checks for both new accounts and links to the explorer.
5. The new pool is filled into the graduation panel automatically; you can also paste an existing DBC pool. Read reserve progress, connect your wallet to inspect base-token, quote-token and SOL balances, then get a live buy or sell quote with a 1% minimum-output bound. Confirm the trade with your wallet; balances refresh after confirmation. Token balances reflect the associated accounts used by the swap, and SOL quotes use the native SOL balance. When the threshold is reached, submit migration and inspect DAMM v2 vault balances.
6. Created and inspected pools are remembered in this browser (up to 30 public-address bookmarks). Reopen one after a page reload or share a direct pool link with its network. Chain state is fetched again when opened.
7. Use the [companion inspector](https://furkanefecancaglar.github.io/curve-covenant/?view=inspector) to read real reserve progress and terms from an existing DBC pool. The inspector also supports a swap quote, embeddable report, and signed disclosure comparison.

The product currently requires a user-hosted metadata JSON URL. It does not upload images, create an xStock, custody funds, operate an unattended migration keeper, or create DLMM positions. SOL and XRXx launches and their complete DBC → DAMM v2 lifecycles have been confirmed on a **local validator**, using copies of the official deployed programs. The stock-token fixture uses a synthetic local balance. See [reproduction and evidence](docs/LOCAL-LAUNCH.md). A public devnet/mainnet launch through Phantom has **not** yet been confirmed. Our devnet faucet probe was rate limited on 2026-09-25, so it is not evidence of a deployed pool. There are no claimed active users or trading volume.

## Development

```bash
npm ci
npm run dev
npm test
npm run build
npm run smoke
# With the local validator running:
npm run verify:scenarios
```

Node.js 22+ is required. The app is a static Vite/React site. Meteora SDK calculations and Solana RPC reads happen in the browser. Mainnet reads default to PublicNode because Solana's public mainnet RPC can reject browser origins; the inspector allows a custom RPC.

Key files:

- [`src/studio.ts`](src/studio.ts) — four DBC curve/fee designs, SDK validation and pre-launch quote simulation.
- [`src/quotes.ts`](src/quotes.ts) — issuer-listed xStock mints, mint precision and DBC token badge verification.
- [`src/trade.ts`](src/trade.ts) — live buy/sell previews, quote expiry, and wallet-signed partial-fill swaps with minimum output enforcement.
- [`src/balances.ts`](src/balances.ts) — exact associated-account balances for SPL Token/Token-2022 and native SOL.
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
