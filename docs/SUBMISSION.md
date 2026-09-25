# Meteora DBC track — honest readiness review

Official listing: https://superteam.fun/earn/listing/meteora-dbc
Colosseum FAQ: https://colosseum.com/hackathon

## Product thesis

Curve Covenant Pair Launch is a stock-quoted DBC launch workbench. A new community or project token can discover its price against an issuer-listed xStock. Launch builders can choose a 16-segment long curve designed for a thinner quote asset, inspect the SDK-derived graduation threshold and simulate early trades. The SDK constructs a combined config + token mint + virtual pool transaction, with DAMM v2 as the configured destination. A graduation panel reads reserve progress, submits the DAMM v2 migration transaction, and verifies destination vault balances. A companion live inspector monitors actual pools.

The new token is not a tokenized share. This is an experiment in stock-denominated price discovery, not a claim that the product has created a new regulated asset or improved returns.

## Sponsor criteria mapped to evidence

| Criterion | Current evidence | Gap |
| --- | --- | --- |
| Deep Meteora integration | DBC curve builders, validator, pre-launch quote, combined config/pool transaction, token badge preflight, on-chain inspector | Local XRXx launch and SOL DBC → DAMM v2 lifecycle confirmed; public wallet proof and full stock-token migration remain |
| Technical execution | TypeScript source, 17 passing tests, successful build, desktop/mobile browser checks, confirmed local SOL/XRXx launches, local SOL graduation, full browser launch → quote → buy → graduation test with a local signer | Mainnet launch path untested with a wallet; no performance/operational history |
| Originality and taste | xStock quote catalog plus a 16-segment front-loaded liquidity design | Similar stock-quoted launches exist; differentiation and actual user value need validation |
| Impact potential | Tool can be reused across issuer-listed stock quote mints | No demonstrated distribution, builders or launches |
| Traction/volume | None claimed | Mainnet usage is preferred by sponsor and not yet evidenced |

## Colosseum materials

- Product: https://furkanefecancaglar.github.io/curve-covenant/
- GitHub: https://github.com/furkanefecancaglar/curve-covenant
- Project name: Curve Covenant Pair Launch
- Description: “Design and launch Meteora DBC tokens quoted in verified tokenized stocks, with SDK-based long-curve simulation and DAMM v2 graduation rules.”
- Previous presentation/demo videos and deck were removed. They described the old inspector and were not suitable for judging.
- A new 2–3 minute pitch must show the market problem, specific stock-quoted flow, defensible differentiation, SDK-backed proof and realistic route to users. A separate demo (≤3 min) must use the actual current product.
- Do not invent founders, user traction, volume, an on-chain launch, or a Colosseum project URL.

## Priority work before submission

1. Obtain public devnet SOL and confirm the Phantom browser flow. Local config + pool creation and SOL graduation are complete; see [reproduction](LOCAL-LAUNCH.md).
2. Exercise stock-quoted mainnet launch only with a funded wallet and explicit transaction review. This costs real SOL; no mainnet transaction has been sent.
3. Exercise the entire stock-token buy and migration flow, including issuer transfer constraints. The post-graduation DAMM v2 read path is implemented and locally checked. Add pool discovery and validate post-migration trading.
4. Validate the 16-segment model with prospective launch builders and compare it with existing stock-quoted launchpads. Record real feedback.
5. Create a new pitch, product demo and distribution plan based on completed evidence.
6. Complete Colosseum and Superteam submissions through the actual human accounts, including project X URL. Neither submission has been made.

Colosseum's current hackathon ends 2026-10-12. The Superteam side-track deadline shown earlier was 2026-10-13 06:59 UTC; recheck on the listing immediately before submission.
