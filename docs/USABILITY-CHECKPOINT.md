# Curve Covenant usability checkpoint — 2026-09-30

## User request and observed constraint

The user funded Phantom on devnet, then could not complete the launch. They asked for ongoing development focused on real usefulness and evidence. The exact point where they stopped remains unknown. No claim is made that the underlying Phantom interaction has been reproduced with the actual extension.

## Implemented

- A small devnet rehearsal and a one-click reproduction of the video's exact whale scenario.
- Default SOL design uses opening/graduation caps of 1/10 and a reserve threshold around 2.4025 test SOL, instead of the previous hundreds-of-SOL threshold.
- Connect → unsigned on-chain simulation → cost review → signature. Wallet address, SOL balance, estimated debit including rent, and expected remaining balance are shown.
- Recheck before signing; account changes and increased costs require a fresh review. Editing the curve or metadata invalidates the previous review.
- Empty-wallet funding instructions, mobile Phantom link preserving the current curve, rejection and RPC error explanations.
- Submitted launch addresses retained in memory after a confirmation/read failure, including combined launches. Resume in the same tab instead of generating another pool. Reload recovery is still not supported.
- Four visible scenario buttons and paired opening-jump, early-output-share and late-cost measurements. Opening a named example resets scenario/budget state.
- Exact half-inventory sell amount and a fresh chain-evidence export (last 20 pool transactions, genesis, terms, graduation status). Unavailable transaction data stays unverified; unknown genesis gets no public explorer URL.

## Validation

- 58 unit tests pass, including insufficient/missing simulation data, account switching, increased cost and uncertain-submission recovery.
- TypeScript and production build pass. The existing bundle-size advisory remains.
- Four scenario schedules, JSON/SVG exports, exact config selection/share restore and 390 px layout pass in the browser.
- Real public devnet unsigned simulation: creation debit 0.02657072 SOL at the checked slot, including 0.000015 SOL fee. This is a time-specific estimate, not a hardcoded price or confirmed transaction.
- Browser onboarding: absent provider, rejected connection, empty wallet, changed wallet, changed terms, example reset and mobile layout pass. Provider is a test interface that cannot sign; no public transaction was sent.
- Local SOL browser flow: launch → buy → half-inventory sell → balance refresh → graduation → evidence export passed.
- Local synthetic-XRXx long-curve flow: same lifecycle, deliberately declined second approval, resumed creation, exact selected configuration comparison, and evidence export passed (7 signing attempts).
- The local report correctly identifies the genesis as unrecognized instead of labeling it public devnet/mainnet.

Local pools from this run (not publicly verifiable):

- SOL DBC: `DntwiEYadU39Yni3yWQDgzbdNcHzp1EdByhHNEs6a8gj`; DAMM v2: `DcFfCjAsXs9eGNrZJXka6YPgNnm3pv5N2Hf5Ze6JTEcE`.
- Synthetic XRXx DBC: `2vWqNe6wf1EvQd5JGyGTQK9aGtzz9iSToSyx5xKig4Q7`; DAMM v2: `3qJ3cGmVwTXzzkCQqdpWfJFrkKfVZAZfLy2CgWZxLGMc`.

## Public execution remains open

An independently generated devnet test signer could not obtain faucet funding: the first request returned an internal error, the smaller follow-up returned 429. No public pool, mainnet usage, organic volume or third-party adoption is claimed. No user wallet key was accessed or user funds spent.

## Next work

1. First deployment verified on the public site: scenario/export/share checks and unsigned devnet onboarding passed. The graduation follow-up deployment also completed successfully.
2. Migration cost review and submitted-signature recovery are implemented in the second iteration. Continue improving pending transaction recovery and first-time usage.
3. Obtain a real public-wallet execution when possible; record actual receipts and extension interaction separately from automated/local evidence.
4. Real builder trials and mainnet xStock transactions remain external evidence gates. No outreach is authorized.

## Reproduce new checks

```bash
npm test
npm run build
CHROMIUM_PATH=/path/to/chrome node scripts/browser-scenarios.mjs
PREFLIGHT_WALLET=<funded-public-devnet-address> CHROMIUM_PATH=/path/to/chrome node scripts/browser-onboarding.mjs
```

The onboarding script needs the Vite dev server on 4175 and deliberately blocks `sendTransaction`. Existing local-validator lifecycle instructions remain in `LOCAL-LAUNCH.md`.

Mobile browse URL format follows the [official Phantom documentation](https://docs.phantom.com/phantom-deeplinks/other-methods/browse).


## Second iteration — graduation and deployed checks

Graduation now has its own unsigned cost review and separate signing action. Wallet changes or increased debit require another review. If confirmation or the following pool refresh fails after submission, the receipt remains visible and the UI directs the user to read the pool before retrying. There are now 61 passing unit tests; both SOL and synthetic-XRXx local browser lifecycles passed with migration cost review.

The first deployed revision passed the browser onboarding suite against real devnet RPC (unsigned simulation only), all four scenarios, exact config export/share restoration and mobile width checks. The browser test injects a non-signing provider; this remains distinct from a real Phantom-extension run.


## Deployed lifecycle verification

Revision `9cc7432` deployed successfully through GitHub Pages (run `36706338109`). The actual public application assets passed the complete SOL lifecycle and receipt-export browser test with all RPC calls and signing redirected to the local validator. Local DBC pool: `5kKyW5RPcNRzocddEv2VwEeUkRbLFS1Siv9mCe2ZQitj`; destination: `4w4NDCUaPY7PJJ26PRuphReeMDgVi2bHN2urGEE6birg`. Five signing attempts, no browser exceptions. This is deployed-asset integration evidence against a local chain, not a public transaction or Phantom-extension demonstration.

An initial run stalled because Chrome blocked the HTTPS page's WebSocket connection to localhost (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`). The test now grants local-network access only in its isolated browser context when APP_URL is HTTPS. The same lifecycle then passed. No product/browser security settings were weakened for users.

The lifecycle harness supports `APP_URL=https://furkanefecancaglar.github.io/curve-covenant/` and injects the installed SDK's PublicKey implementation without needing Vite's development-module path.


## Third iteration — interrupted transaction recovery

- The first signature is retained before sending. A lost `sendTransaction` response now leads to checking that exact signed ID, without resending or asking for another signature.
- Confirmation uses HTTP signature-status polling with a 30-second overall wait and bounded RPC reads. Three consecutive failed reads return an unresolved receipt. Processed-only results remain pending; explicit preflight rejection and confirmed execution failure are separate outcomes.
- A missing signature is classified as expired only after finalized block height exceeds the last valid height and a second historical status lookup is still empty.
- Buy/sell receipts contain public transaction references and persist per network/pool. Reloading restores the pending check and disables new trades until the outcome is known. Storage failure is reported; in-memory trade recovery still works during that visit.
- Migration receipts are saved before broadcast and recovered on pool reads. A ready pool alone no longer clears an unresolved migration. Confirmed destination state or a verified failed/expired transaction releases the guard. Migration stops before broadcast if browser storage is unavailable.
- Launch resume checks the prior transaction before requesting another signature. An expired initial transaction without a config releases the launch for a fresh review. Launch mint keypairs remain in memory; launch recovery still requires keeping the tab open.

Validation: 82 unit tests, TypeScript/build, four-scenario browser suite and exact config/share restoration passed. The full synthetic-XRXx long-curve lifecycle also passed after declining its second signature (7 signing attempts, 6 sends; selected SDK configuration matched chain state).

Fault-injected SOL browser run: WebSockets disabled; launch response dropped after the local node accepted it; buy confirmation RPC unavailable; page reloaded and failed status recheck preserved the trade guard; later status recovery confirmed the original trade. Migration confirmation was also interrupted and recovered after reload. The complete lifecycle required exactly 5 signatures and 5 sends, with no browser exceptions. Local DBC: `14XKFeu84huVVCwW5Xg2BUvWgeHUK22H8PLR5NGp7hnz`; DAMM v2: `A39Xur8MSLbmACGHC6bzE9VM5rFepJWF2RYA6F3vNcMF`.

Reproduce against the existing local-validator fixture:

```bash
RECOVERY=1 CHROMIUM_PATH=/path/to/chrome node scripts/browser-local-flow.mjs
```

This remains automated local-chain evidence, not a real Phantom-extension run or public mainnet execution. No user wallet signature or funds were used. Network behavior follows Solana's official [sendTransaction](https://solana.com/docs/rpc/http/sendtransaction) and [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses) contracts.


## Fourth iteration — launch recovery after closing the tab

An unfinished launch now saves a validated public receipt before broadcast. It includes config/mint/payer addresses, quote selection, token metadata and transaction expiry references; it never stores the ephemeral config/mint signers or the wallet key. If receipt storage is unavailable, creation stops before broadcast.

After reopening, the Unfinished launches panel checks account ownership, pool/config/mint/creator relationships, quote mint and fee/leftover recipients on chain. A created pool opens without a wallet signature. An uncertain previous pool attempt blocks a new creation. A configuration-only launch can reuse the paid curve after a new unsigned cost review and explicit approval; the unused mint receives a new address because its original ephemeral signer was not persisted. Mainnet recovery retains the real-funds acknowledgement. The original payer, current receipt and cost are checked again before signing.

Successful pools are bookmarked before the unfinished receipt is removed. A receipt changed or completed in another tab invalidates stale continuation. Browsers supporting Web Locks also serialize attempts for the same saved configuration. Browser storage remains local to the same browser/origin; clearing it loses these recovery references.

Browser evidence:

- Combined SOL launch: hide confirmation after the node accepts creation, reload, find the original pool, open it without another signature, then buy/sell/graduate. Original config `3DzjcpE1CWWQDAM3KYJCaHssxQMJ8h6r7jKYAXukWusM` was retained. DBC `HmNqYXDdNGrQdpfdjGDJs8FUz1Mc9VL2o9EYkhUiBFms`; DAMM v2 `APN5eqTLcUuAxEsmQU6sJwX1vsdG4bMgK5AsEJse9oTH`. Full lifecycle: 5 sends, 5 signatures.
- Split synthetic-XRXx long curve: decline second approval, reload, check the saved configuration, review only the remaining cost, approve a new mint using that same config. Original config `FwZXH9zh9wufHVKcBESwhoac7PdkGttxCWXTn5Xuvadt` was retained; selected scenario config matched chain data exactly. DBC `5wmM8EybQ7a6JycFPXQkZXQTC5ejojmmFpcXjiiqGG8U`; DAMM v2 `Ed6YjvFAUrfTB9habBWoUTCRBhGrosBVYfMn7RS7c5Ca`. Full lifecycle: 6 sends, 7 signing attempts including the deliberate decline. Recovery fit the 390 px viewport.
- These are local-validator transactions with a test signing interface. No actual Phantom-extension or public-mainnet claim is added.

Reproduce with the running local fixtures:

```bash
LAUNCH_RELOAD=combined CHROMIUM_PATH=/path/to/chrome node scripts/browser-local-flow.mjs
STOCK_FIXTURE_DIR=/path/to/fixture LOCAL_RPC_PORT=19299 LONG_CURVE=1 SCENARIO_CURVE=long CANCEL_SECOND=1 LAUNCH_RELOAD=split CHROMIUM_PATH=/path/to/chrome node scripts/browser-local-flow.mjs
```

The previous deployed recovery revision `eb4e637` also passed the interrupted-trade/migration fixture against the public application assets with all chain calls redirected locally (Pages run `36708708667`, local DBC `2jTEdVQBrYa1xPzJmZNSKbitmqroK1fP4Ajj3bA5bN5c`). Its independent devnet test wallet remained unfunded; a later 1-SOL faucet request was also rejected. The user's wallet was not used to sign.


Fourth-iteration validation: 102 unit tests pass with the same 5-second per-test deadline. The runner now uses at most four workers: simultaneous SDK-heavy workers plus browser/validator processes caused the existing curve-comparison test to exceed its deadline in two overloaded runs. TypeScript/build, the four-scenario browser suite, the earlier trade/migration interruption fixture, and public-devnet unsigned onboarding pass. The onboarding check requested zero signatures and sent zero transactions; the live estimate remained 0.02657072 test SOL for combined creation.


## Fifth iteration — failures found on real mainnet reads

The repository's existing USDC reference pool `4L9LJ3B5niCSLWujRJjPU6scZVbNJz4zw6A9B3aPxTeT` was read on public mainnet. This is an existing reference pool, not a Curve Covenant launch or user-adoption claim.

Actual failures found:

- The default PublicNode endpoint returned HTTP 403 for `getTokenSupply`, `getTokenAccountBalance` and indexed transaction listing. Account reads still worked. This broke the graduation reader and evidence export on real mainnet even though local-validator flows passed.
- The same endpoint returned null for historical signature `4YDPmFtNkiX8Gm7X7Wq6poPp2BLRgrJn8Yrb1rKUbTLzJCHEzLt5v3GKeDQHQyQgZ8QnvZQ2jLsnAoJWG5ACeVLp`, while Solana's public endpoint returned a finalized successful receipt at slot 450089928. Treating that null as expiry would be misleading.
- Solana's public history endpoint worked from Node, but denied browser requests with HTTP 403. Its current documented mainnet hostname did the same. A documented dRPC public endpoint returned a paid-plan requirement. No provider restriction was bypassed and no API credential was borrowed.

Changes:

- Mint precision and DAMM vault balances use directly readable SPL/Token-2022 accounts, checking program owner, account type, mint and exact integer amounts.
- Current signatures are checked on the selected RPC. Before classifying an absent signature as expired, the known default mainnet RPC is routed to a separate history source only after both genesis hashes match mainnet. Local/custom RPCs stay on their own network. Failed history access keeps an uncertain transaction unresolved.
- Evidence exports preserve the valid pool state even when history fails. Each receipt is verified against the requested signature, slot and pool account reference before recording success. Missing, mismatched and skipped details remain unverified. Reads are paced and bounded, and rate/access limits stop further detail requests.
- Both Inspector and Graduation show how many listed receipts were verified; an unavailable history export explicitly says so. Inspector labels the public USDC reference pool without claiming a project launch.
- Optional RPC connection settings validate network and mainnet history support before adoption. The endpoint lives only in page memory; credentials do not enter receipts, storage, share links, reports or connection-error text. Launch, trade, migration and recovery all use the selected endpoint. The launch cost review is invalidated when it changes.

Validation:

- 125 unit tests passed, including history-source network isolation, historical confirmation, denied/partial/mismatched receipt handling, token-account verification and RPC settings.
- Real Node/mainnet export verified 2 of 20 listed receipts before the public history rate limit. The other 18 were explicitly unverified. The historical-status check returned confirmed at slot 450089928. Artifact: `/tmp/curve-public-mainnet-readonly-evidence.json`.
- Real browser/mainnet test verified the existing pool snapshot and correctly displayed history unavailable. No wallet provider was injected and only an allowlist of read methods was permitted. This is **not** a passing full-history browser run. Artifact: `/tmp/curve-public-browser-evidence.json`.
- Unsigned public-devnet onboarding passed with 0 signature requests / 0 sends. A controlled custom-endpoint route verified that launch simulation used the selected endpoint, rejected a wrong-network endpoint, cleared its input, did not persist its key, and invalidated the old review.
- Synthetic-XRXx long-curve close/reopen lifecycle passed after the token-account changes, including exact selected config equality and 5/5 pool receipt verification. Local DBC `3HWPnC5dqk5vhhgZr4GYzUnzEe4QZN59sfiSxe9scffS`; DAMM v2 `BfRujeQ7rDRZqXzhPeLo4wTqRLJbC6MeuAFyBkuQDLwc`.

Remaining dependency: a mainnet RPC endpoint that permits browser history reads has not been supplied. A concise optional account question was sent to the user. Mainnet creation/trading, actual Phantom interaction and independent builder use remain unproven.

Reproduction:

```bash
# Strict public history verification: must fail if no full receipt is available.
CHROMIUM_PATH=/path/to/chrome node scripts/browser-public-evidence.mjs
# Explicitly test the observed public-browser history denial and honest fallback.
EXPECT_HISTORY_UNAVAILABLE=1 CHROMIUM_PATH=/path/to/chrome node scripts/browser-public-evidence.mjs
CUSTOM_RPC=1 PREFLIGHT_WALLET=<funded-devnet-public-address> CHROMIUM_PATH=/path/to/chrome node scripts/browser-onboarding.mjs
```

Public provider constraints are documented in [Solana's cluster reference](https://solana.com/docs/references/clusters). The dRPC public address was checked against its [own API guide](https://drpc.org/docs/solana-api), then rejected by the actual service. These sources are not guarantees of current access.
