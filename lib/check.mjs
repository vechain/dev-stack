import { readFile } from 'node:fs/promises'
import { projectConfigFile } from './paths.mjs'
import { hasCode } from './thor.mjs'

const DEFAULT_RPC = 'http://localhost:8669'

// Check whether a project's contracts are still deployed on the current chain.
// Truth source is ~/.vechain-dev/config/<project>.json — wiped by
// `vechain-dev clean`, so its absence means the chain has been reset and the
// project must redeploy. Per-project files (e.g. b3tr's packages/config/local.ts)
// are deliberately NOT consulted: they live outside the shared state and go
// stale across cleans.
//
// Pass `expectedAddresses` (env-var name → 0x address) to also catch the case
// where the registration is stale — e.g. a consumer has cached deployment
// artifacts at a different address than what's currently registered. Useful
// in pre-deploy hooks that want to decide whether to wipe local artifacts.
export async function isProjectDeployed(project, { rpcUrl = DEFAULT_RPC, expectedAddresses } = {}) {
  let registration
  try {
    registration = JSON.parse(await readFile(projectConfigFile(project), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return { deployed: false, reason: 'not-registered' }
    throw err
  }
  const registered = registration.addresses || {}
  const addresses = Object.values(registered)
  if (!addresses.length) return { deployed: false, reason: 'not-registered' }

  if (expectedAddresses) {
    for (const [name, expected] of Object.entries(expectedAddresses)) {
      const actual = registered[name]
      if (!actual || actual.toLowerCase() !== expected.toLowerCase()) {
        return { deployed: false, reason: 'address-mismatch', name, expected, actual: actual ?? null }
      }
    }
  }

  // De-dupe: registrations commonly expose the same address under multiple
  // env-var aliases (e.g. STARGATE_CONTRACT + STARGATE_DELEGATION_CONTRACT).
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))]
  for (const addr of unique) {
    if (!(await hasCode(addr, rpcUrl))) {
      return { deployed: false, reason: 'missing-code', address: addr }
    }
  }
  return { deployed: true }
}
