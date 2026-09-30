import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { projectConfigDir, generatedDir } from './paths.mjs'

const INDEXER_ONLY_PROFILE = 'indexer'

// Indexer start-block defaults for solo: every known per-profile cursor pinned
// to genesis. Safe to set even when the corresponding profile is inactive — the
// indexer only reads the cursor when the profile is enabled. Adding a new
// profile that introduces its own INDEXER_START_BLOCK_* var? Append it here.
const SOLO_START_BLOCKS = [
  'B3TR',
  'B3TR_BALANCE',
  'B3TR_CHALLENGES',
  'B3TR_NAVIGATOR',
  'B3TR_PROPOSAL',
  'B3TR_SUSTAINABLE_ACTIONS',
  'B3TR_TREASURY',
  'B3TR_X_ALLOC_RESULT',
  'BLOCKS',
  'CLAUSES',
  'DELEGATION',
  'HISTORY',
  'NFTS',
  'NFT_BLACKLIST',
  'SAFE',
  'STARGATE',
  'STARGATE_STAKING',
  'STARGATE_TOKEN',
  'TRANSFERS',
  'VALIDATOR',
  'VEVOTE',
  'VEVOTE_HISTORIC',
  'VTHO_CLAIMED',
  'VTHO_GENERATED_BY_BLOCK',
]

// Profiles the indexer has since renamed or folded into another. Spring
// silently ignores an unknown profile, so a consumer still declaring the old
// name would just lose that data — translate it instead.
export const RENAMED_PROFILES = {
  transactions: 'blocks',
  transaction: 'blocks',
  'transaction-count': 'blocks',
  'validator-reward': 'validator',
  'vevote-historic-proposals': 'vevote-historic',
}

function startBlockDefaults() {
  return Object.fromEntries(SOLO_START_BLOCKS.map((s) => [`INDEXER_START_BLOCK_${s}`, '0']))
}

export async function readAll() {
  let entries
  try {
    entries = await readdir(projectConfigDir())
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  const projects = []
  for (const name of entries) {
    if (!name.endsWith('.json')) continue
    const body = await readFile(join(projectConfigDir(), name), 'utf8')
    projects.push(JSON.parse(body))
  }
  return projects
}

export function build(projects) {
  const profiles = new Set()
  const renamed = []
  const addresses = {}
  for (const p of projects) {
    for (const pr of p.profiles || []) {
      const current = RENAMED_PROFILES[pr]
      if (current) renamed.push({ project: p.project, from: pr, to: current })
      profiles.add(current ?? pr)
    }
    Object.assign(addresses, p.addresses || {})
  }
  const projectProfiles = [...profiles].sort()
  return {
    indexerEnv: {
      SPRING_PROFILES_ACTIVE: [INDEXER_ONLY_PROFILE, ...projectProfiles].join(','),
      ...startBlockDefaults(),
      ...addresses,
    },
    indexerApiEnv: {
      SPRING_PROFILES_ACTIVE: projectProfiles.join(','),
      ...addresses,
    },
    explorerEnv: addresses,
    renamed,
  }
}

function serialise(env) {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n'
  )
}

export async function writeEnv(projects) {
  await mkdir(generatedDir(), { recursive: true })
  const { indexerEnv, indexerApiEnv, explorerEnv, renamed } = build(projects)
  await Promise.all([
    writeFile(join(generatedDir(), 'indexer.env'), serialise(indexerEnv), 'utf8'),
    writeFile(join(generatedDir(), 'indexer-api.env'), serialise(indexerApiEnv), 'utf8'),
    writeFile(join(generatedDir(), 'explorer.env'), serialise(explorerEnv), 'utf8'),
  ])
  return {
    profileCount: indexerEnv.SPRING_PROFILES_ACTIVE.split(',').length,
    addressCount: Object.keys(explorerEnv).length,
    renamed,
  }
}
