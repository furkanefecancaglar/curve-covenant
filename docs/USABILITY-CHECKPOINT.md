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
