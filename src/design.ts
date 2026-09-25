import { buildStudioConfig, PRESETS } from './studio'
import type { StudioInputs } from './studio'
import { QUOTES } from './quotes'
import type { QuoteId } from './quotes'

export type LaunchDesign = { version: 1; quoteId: QuoteId; inputs: StudioInputs }
export function encodeDesign(quoteId: QuoteId, inputs: StudioInputs): string {
  return btoa(JSON.stringify({ version: 1, quoteId, inputs } satisfies LaunchDesign))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeDesign(encoded: string): LaunchDesign {
  try {
    if (encoded.length > 4096 || !/^[a-zA-Z0-9_-]+$/.test(encoded)) throw new Error()
    const parsed = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
    if (parsed?.version !== 1 || typeof parsed.quoteId !== 'string' || !Object.hasOwn(QUOTES, parsed.quoteId)) throw new Error()
    const input = parsed.inputs
    if (!input || typeof input.preset !== 'string' || !Object.hasOwn(PRESETS, input.preset)) throw new Error()
    const inputs = Object.fromEntries(Object.keys(PRESETS.steady.values).map(key => {
      if (key !== 'preset' && (typeof input[key] !== 'number' || !Number.isFinite(input[key]))) throw new Error()
      return [key, input[key]]
    })) as StudioInputs
    const quoteId = parsed.quoteId as QuoteId
    buildStudioConfig(inputs, QUOTES[quoteId].decimals)
    return { version: 1, quoteId, inputs }
  } catch { throw new Error('This shared design is invalid or uses an unsupported version. The default design is shown.') }
}
