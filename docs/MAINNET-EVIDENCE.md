# Public Phantom evidence — execution worksheet

Status: not executed. A public wallet address has been requested; no mainnet transaction is claimed.

## Required inputs

- Actual public Phantom wallet address, available SOL and intended xStock quote balance.
- Token name, symbol and a matching publicly accessible metadata JSON URL.
- Selected exported scenario config and exact input/output amounts to review.
- A concrete spending limit reviewed against live network fees, rent and swap simulation.

## Prepare before the user signs

1. Read the wallet's native SOL and relevant associated token balances. Recheck the quote mint controls and Meteora token badge.
2. Fix the selected exported configuration; record its hash and actual quote threshold. Verify that the launch transaction uses that config.
3. Build and simulate the required transactions, identify combined versus two-step creation, and show actual account rent / estimated network fees. Do not hardcode a guessed cost as a quote.
4. Prepare a small buy and an inventory-backed sale. Record the reviewed minimum output and quote timestamp. Treat migration as an additional transaction with its own feasibility and costs.
5. Present the exact ready-to-review transaction sequence through Phantom. The real wallet holder supplies the signature; never use a local fixture signer as a substitute for public-wallet proof.

## Capture and verify

For each confirmed step retain: network, signature and explorer URL, slot/time, wallet signer, pool/config/mint, instruction outcome, before/after relevant balances, quote minimum versus actual output, and the config identity. If confirmation fails, record the failure and resolve it before claiming completion.

The video must show actual Phantom approval and the app's post-transaction refresh. Public SOL and public xStock evidence must be identified separately. The current SOL rehearsal option is devnet; do not relabel it as mainnet.

## Evidence labels

- `not-executed`: prepared instructions only.
- `local-validator`: actual local execution, including synthetic stock balances where used.
- `public-devnet`: real publicly verifiable testnet signature.
- `mainnet-beta`: actual mainnet transaction verified through mainnet RPC.

Keep these labels on screenshots, videos and manifests. None of these by itself establishes organic volume, independent users or revenue.
