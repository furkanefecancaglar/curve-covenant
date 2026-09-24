# Curve Covenant

**Live, human-readable terms for Meteora Dynamic Bonding Curve (DBC) launches.**

Curve Covenant reads a DBC pool or config directly from Solana using Meteora's official TypeScript SDK. It shows the initial trading fee, fee schedule, quote asset and graduation threshold, migration target, creator and partner fee and liquidity shares, token authority, and live pool progress. Its scenario lab uses Meteora's swap quote math to estimate a buy, fee split, and partial fill without sending a transaction. A launch team can export terms as a portable JSON covenant. Anyone can import that file later and compare each declared field against a fresh on-chain read.

This is an independent tool, not a Meteora product or financial advice.

## Try it

Open [the live site](https://furkanefecancaglar.github.io/curve-covenant/) and choose **Try a live pool**, or paste any Meteora DBC pool/config address. A wallet is not required. Use a custom RPC endpoint under **Advanced** if the shared public endpoint is rate limited.

The included sample pool is a live technical fixture, not an endorsement of its token. The [official DBC program](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk) is `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`.

## Why this exists

DBC launchpads can configure fee schedules, graduation thresholds, post-migration liquidity distribution, token authority, and more. Those choices are visible on-chain but difficult for many people to interpret together. A reusable disclosure format lets launch teams publish precise terms and lets users verify them independently.

The app supports standard and transfer-hook variants of both DBC pools and configs through `DynamicBondingCurveClient.state`. Its scenario lab calls `DynamicBondingCurveClient.pool.swapQuote2` in partial-fill mode on fresh pool state. It uses exact integer arithmetic for raw quote token units and validates account ownership against the DBC program before decoding. It never asks users to sign a transaction.

## Run locally

```bash
npm ci
npm run dev
```

Run checks:

```bash
npm test
npm run build
```

Requires Node.js 22 or newer. The app is a static Vite/React site; all chain reads happen directly in the browser. Mainnet defaults to PublicNode because Solana's own shared mainnet RPC rejects many browser origins. Devnet uses Solana's public devnet RPC. Neither endpoint is hard-coded into a backend; users can supply their own RPC.

## Covenant format

Version `curve-covenant/v1` is a JSON object containing the network, config and optional pool address, project name, description, creation time, and selected claims. Comparison is exact for the selected decoded on-chain fields. If a claim differs from the current config, the UI shows both the declared and live values.

Anyone can create a covenant file. The current format **does not authenticate the publisher** or commit claims on-chain. It is a transparent disclosure and repeatable comparison, not a proof of the issuer's identity or a guarantee of future behavior. Any use of the file as a project statement should include an independently verified publication channel.

## Architecture

```text
Solana RPC ──> Meteora DBC SDK decoder ──> normalized launch report
                                           │
                                           ├──> readable inspector
                                           ├──> raw account snapshot
                                           └──> covenant JSON ⇄ live comparison
```

The DBC integration is in [`src/dbc.ts`](src/dbc.ts). The portable disclosure and comparison logic is in [`src/covenant.ts`](src/covenant.ts). All decoded raw account fields remain available in the UI for independent checking.

## Roadmap

- Explain how time and market-cap based fee schedules evolve after launch.
- Add a full curve path and side-by-side launch scenarios.
- Add verifiable issuer signatures and pinned provenance for covenants.
- Watch a launch over time and highlight changes to claimable amounts and graduation state.

## Sources

- [Meteora DBC overview](https://docs.meteora.ag/core-products/dbc/what-is-dbc)
- [Official DBC SDK](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk)
- [DBC account model](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dbc/program/accounts.mdx)

## License

MIT. The on-chain Meteora programs have their own license; this project's license only covers Curve Covenant source code.
