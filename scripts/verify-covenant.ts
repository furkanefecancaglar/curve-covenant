#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { compareCovenant, parseCovenant, verifyCovenantSignature } from '../src/covenant'
import { loadLaunch, RPC } from '../src/dbc'

const args = process.argv.slice(2)
const requireRoleSignature = args.includes('--require-role-signature')
const rpcIndex = args.indexOf('--rpc')
const file = args.find((arg, index) => !arg.startsWith('--') && !(rpcIndex >= 0 && index === rpcIndex + 1))
if (!file || (rpcIndex >= 0 && !args[rpcIndex + 1])) {
  console.error('Usage: npm run verify -- <covenant.json> [--require-role-signature] [--rpc URL]')
  process.exit(2)
}

try {
  const covenant = parseCovenant(JSON.parse(await readFile(file, 'utf8')))
  const endpoint = rpcIndex >= 0 ? args[rpcIndex + 1] : RPC[covenant.network]
  const launch = await loadLaunch(covenant.poolAddress || covenant.configAddress, covenant.network, endpoint)
  const checks = compareCovenant(covenant, launch)
  const signature = verifyCovenantSignature(covenant, launch)
  const claimsMatch = checks.length > 0 && checks.every(check => check.matches)
  const roleSigned = Boolean(signature?.valid && signature.authorizedRole)
  const passed = claimsMatch && (!signature || signature.valid) && (!requireRoleSignature || roleSigned)
  console.log(JSON.stringify({
    passed, project: covenant.project, network: launch.network, configAddress: launch.configAddress,
    poolAddress: launch.poolAddress ?? null, slot: launch.slot, fetchedAt: launch.fetchedAt,
    checks, signature: signature ?? { valid: false, authorizedRole: null, reason: 'unsigned' },
  }, null, 2))
  if (!passed) process.exitCode = 1
} catch (error) {
  console.error(JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
}
