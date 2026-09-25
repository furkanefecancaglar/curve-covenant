import { expect, it } from 'vitest'
import { poolShareUrl, readPoolLibrary, rememberPool } from './pool-library'

const address = '8LH1FJ3fYXKoowcfRMvcxoRVtcWvbd7CNncPm9f4GAvV'
it('recovers valid public bookmarks from a damaged library and strips unrelated fields', () => {
  const pools = readPoolLibrary(JSON.stringify([null, { address: 'broken' }, {
    address, network: 'mainnet-beta', label: 'Example', savedAt: '2026-09-26T00:00:00Z', unwanted: 'discard',
  }]))
  expect(pools).toHaveLength(1)
  expect(Object.keys(pools[0]).sort()).toEqual(['address', 'label', 'network', 'savedAt'])
  expect(readPoolLibrary('broken JSON')).toEqual([])
})

it('keeps network identity and a custom name when reopening, and shares only the selected pool', () => {
  const first = rememberPool([], { address, network: 'devnet' }, 'My launch')
  const both = rememberPool(first, { address, network: 'mainnet-beta' })
  const reopened = rememberPool(both, { address, network: 'devnet' })
  expect(reopened).toHaveLength(2)
  expect(reopened[0].label).toBe('My launch')
  const url = new URL(poolShareUrl('https://example.org/app/?design=stale&view=inspector', reopened[0]))
  expect([...url.searchParams.keys()]).toEqual(['pool', 'network'])
  expect(url.searchParams.get('network')).toBe('devnet')
})
