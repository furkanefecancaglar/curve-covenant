# Stateful scenario methodology

Verified 2026-09-26 against the local deployed DBC program copy. The engine uses Meteora SDK **1.5.13**, deterministic scenario event times and integer base units. It does not predict order flow, stock prices, external quote-token liquidity, MEV or real user behavior.

## Controlled comparison

The current release compares one-segment and 16-segment curves. Both use the same token supply, exact opening sqrt price, quote reserve threshold, fee schedule and nominal 0.001% leftover target. The one-segment builder defines the target reserve threshold. A bounded search solves the long curve's ending market cap for that threshold. Both configs use the canonical opening price, resolve the final quote rounding unit, and pass the SDK's configuration validator.

Ending prices are outcomes, not equalized inputs. In particular, the long curve can end at a higher price and leave fewer base tokens for the migration pool. Minor rounding differences can affect the actual leftover amount; the 0.001% value is the nominal allocation target, not a claim of exactly equal leftover atomic units. The two-stage preset is excluded because its 35% target allocation differs from the other curves.

Reports carry the exact resulting SDK configs. “Use for launch” supplies that exact object to transaction construction. Version 2 design links include the reference terms and controlled model, allowing the pinned normalization method to reconstruct the same configuration. Editing terms leaves the selected scenario config and starts a new design.

## State transitions

Supported scope: quote-token fees, linear timestamp fee schedules, fixed supply, disabled dynamic fees, no vesting, no referral or first-swap fee discounts. Unsupported cases fail explicitly.

For each SDK partial-fill quote:

- Buy: subtract net base output from the base reserve; add quote input excluding fees to the quote reserve; credit the actor's base inventory.
- Sell: add filled base input to the base reserve; subtract net quote output plus quote fees from the quote reserve; debit actor inventory.
- Record the SDK's next sqrt price and cumulative fees. Pool quote vault balance includes both the quote reserve and unclaimed quote fees.
- Use requested input minus gross filled input for the unfilled budget. The SDK's `amountLeft` alone is insufficient for a gross quote-budget ledger.
- Reject unowned sales, backwards event times, zero-output dust, negative reserves and trades after the graduation threshold.

## Measurements

- Average buy cost: gross quote actually spent / net base received. Fees are also reported separately.
- Execution premium: average cost / opening spot price - 1. This includes fees and price impact; it is not an on-chain slippage tolerance.
- Early share: the early cohort's buy output / all buy output. This is a fraction of gross buy output, not unique ownership or a fairness score. Actor inventories at the end are included separately in JSON.
- Reserve progress: net quote reserve / configured migration threshold. Vault balances additionally contain unclaimed fees.
- Sell pressure: a cohort sells a specified fraction of its existing inventory. Selling unowned tokens is invalid.
- Recovery: count and quote amount of subsequent scheduled buys needed to regain the spot price immediately before the sale. Unrecovered sequences report null, not an invented recovery time.
- Graduation: simulation stops at the first completed pool state. Remaining scheduled events are not executed on DBC. Unspent budget includes both partial fills and unexecuted later buys.

## Scenario schedules

- Retail: 30 equal-budget buys, one minute apart, with cohort boundaries at buys 10 and 20.
- Whale: one buyer spends 40% of the common gross buy budget at opening; 30 retail buys split the remaining 60% on a one-minute cadence.
- Sell pressure: one buyer spends 30% of the budget, sells 50% of the base received one minute later, then 30 retail buys split the remaining 70%.
- Graduation: 40 equal-budget buys from the same gross budget. This is a progress comparison, not a promise of faster graduation; equal fees and thresholds may produce equal completion steps.

The early cohort includes an opening whale/seller, when present, plus the first third of retail buyers. All percentage splits use integer arithmetic with deterministic remainder allocation. Sell rules are identical across curves, although base amounts differ because the preceding buy outputs differ.

## Independent local-chain verification

`STOCK_FIXTURE_DIR=/tmp/curve-stock-fixture-... npm run verify:scenarios` connects only to localhost. It creates eight pools: SOL/XRXx × one/16 segments × fixed/decaying fees. Every pool executes seven swaps: buys, two inventory-constrained sales, further buys and a final partially filled buy to graduation.

For all **56 confirmed swaps**, the engine matched the program's raw sqrt price, base reserve, quote reserve, cumulative quote fees, actor base balance and actual quote vault transfers exactly. Transaction block times supply the actual elapsed seconds for fee comparison. The short runs exercise early fee periods; unit checks additionally exercise the end of the fee schedule. This is representative execution parity, not a claim that every possible parameter combination has been exhaustively checked.

- [Full raw proof](evidence/scenario-chain-proof-2026-09-26.json)
- [SHA-256 manifest and program hashes](evidence/scenario-manifest-2026-09-26.json)
- [Reproducible whale report](evidence/scenarios/whale.json) and [visual summary](evidence/scenarios/whale.svg)
- Generate all four sample reports: `npx tsx scripts/export-scenario-examples.ts`.
- Offline UI regression: `CHROMIUM_PATH=/path/to/chromium node scripts/browser-scenarios.mjs` with the dev server on 4175.

The UI regression verifies all four schedules, JSON/SVG downloads, exact selected config export, exact config reconstruction from a share link, mobile overflow, invalid-input handling and zero public RPC requests.

The full browser lifecycle was also run with `SCENARIO_CURVE=long LONG_CURVE=1 CANCEL_SECOND=1` using a synthetic local XRXx balance. The compared opening price, quote threshold and all curve segment prices/liquidities matched the actual created config. Buy, sell, balance refresh and graduation passed with zero browser exceptions. Local DBC pool: `H7xvgnRfXgf5gL5z8TFb339iDKCpzdF97fzJ4Mpe4Da5`; local DAMM v2 pool: `2jTXgCtAHpAbsD6rNsLTyRbBBhwbmSKLX3yfihmns4oK`.

## A measured trade-off, not a preselected winner

In the checked-in fixed-fee XRXx whale example, the one-segment curve's first buy raises the spot price by 311.08%; the long curve raises it by 239.16%. However, the early cohort receives 88.70% versus 91.23% of gross buy output. The long curve reduces the initial price jump while increasing early output share by 2.53 percentage points. Its graduation/opening price multiple also rises from approximately 10 to 15.58.

These are hypothetical outcomes under the exported schedule and controls. They do not establish superior fairness, stock-price forecasting, organic demand or financial performance.
