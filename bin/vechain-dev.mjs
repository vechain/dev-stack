#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { loadConfig } from '../lib/config.mjs'
import {
  composeDown,
  composeLogs,
  composeRecreate,
  composeRm,
  composeStop,
  composeUp,
  ensureNetwork,
  removeNetwork,
  waitHealthy,
} from '../lib/docker.mjs'
import { readAll, writeEnv } from '../lib/addressBook.mjs'
import { waitForThor } from '../lib/thor.mjs'
import { isProjectDeployed } from '../lib/check.mjs'
import { detail, error, info, step, warn } from '../lib/log.mjs'
import { home } from '../lib/paths.mjs'

const SHARED_FILES = ['base.yaml', 'indexer.yaml', 'explorer.yaml']
const INFRA_SERVICES = [
  'mongo-node1',
  'mongo-setup',
  'vechain-indexer',
  'vechain-indexer-api',
  'block-explorer',
]

async function shellExec(cmd, { exec = false } = {}) {
  return new Promise((resolve, reject) => {
    const shell = process.env.SHELL || '/bin/bash'
    const child = spawn(shell, ['-c', cmd], { stdio: 'inherit' })
    if (exec) {
      const fwd = (sig) => () => child.kill(sig)
      process.on('SIGINT', fwd('SIGINT'))
      process.on('SIGTERM', fwd('SIGTERM'))
    }
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`'${cmd}' exited ${code}`))))
  })
}

async function ensureThor() {
  step('ensuring docker network')
  await ensureNetwork()
  step('starting thor-solo (chain state preserved)')
  await composeUp(['base.yaml'], ['thor-solo'])
  await waitForThor()
  await waitHealthy('thor-solo')
}

async function runDeployIfNeeded(cfg, { force, skip }) {
  if (skip) {
    step(`--skip-deploy: not running '${cfg.deploy}'`)
    return
  }
  const status = force ? { deployed: false, reason: 'forced' } : await isProjectDeployed(cfg.project)
  if (status.deployed) {
    step(`contracts already deployed for '${cfg.project}' — skipping deploy (pass --redeploy to force)`)
    return
  }
  if (status.reason === 'missing-code') {
    detail(`registered address ${status.address} has no code on-chain — redeploying`)
  } else if (status.reason === 'not-registered') {
    detail(`no registration found for '${cfg.project}' — deploying`)
  } else if (status.reason === 'address-mismatch') {
    detail(`registered ${status.name}=${status.actual ?? '(missing)'} differs from expected ${status.expected} — redeploying`)
  } else if (status.reason === 'forced') {
    detail('--redeploy: forcing deploy')
  }
  step(`running deploy: ${cfg.deploy}`)
  await shellExec(cfg.deploy)
}

async function mergeAndRecreateInfra(cfg, { recreateExplorer = true } = {}) {
  step('merging address book')
  const projects = await readAll()
  if (cfg && !projects.find((p) => p.project === cfg.project)) {
    warn(`no registration for project '${cfg.project}' — did the deploy step call registerAddresses?`)
  }
  const summary = await writeEnv(projects)
  detail(`${projects.length} project(s), ${summary.profileCount} profile(s), ${summary.addressCount} address var(s)`)

  const services = recreateExplorer
    ? ['mongo-node1', 'mongo-setup', 'vechain-indexer', 'vechain-indexer-api', 'block-explorer']
    : ['mongo-node1', 'mongo-setup', 'vechain-indexer', 'vechain-indexer-api']

  if (recreateExplorer) {
    step('starting mongo + indexer + explorer (fresh state)')
    await composeUp(['indexer.yaml', 'explorer.yaml'], services)
  } else {
    step('recreating indexer')
    await composeRecreate(['indexer.yaml'], ['vechain-indexer', 'vechain-indexer-api'])
  }
}

function printEndpoints() {
  info('shared stack ready')
  info('  thor-solo      → http://localhost:8669')
  info('  indexer-api    → http://localhost:8089')
  info('  block-explorer → http://localhost:8088')
}

async function up({ force = false, skip = false } = {}) {
  const cfg = await loadConfig()
  step(`project: ${cfg.project}`)

  await ensureThor()

  step('clearing ephemeral services (mongo + indexer + explorer)')
  await composeRm(['indexer.yaml', 'explorer.yaml'], INFRA_SERVICES)

  await runDeployIfNeeded(cfg, { force, skip })
  await mergeAndRecreateInfra(cfg)

  printEndpoints()

  step(`exec: ${cfg.dev}`)
  await shellExec(cfg.dev, { exec: true })
}

async function deploy({ force = false } = {}) {
  const cfg = await loadConfig()
  step(`project: ${cfg.project}`)
  await waitForThor()
  await runDeployIfNeeded(cfg, { force, skip: false })
  await mergeAndRecreateInfra(cfg, { recreateExplorer: false })
  info('deploy complete')
}

async function soloUp() {
  await ensureThor()
  info('thor-solo → http://localhost:8669')
}

async function soloDown() {
  step('stopping thor-solo (chain state preserved)')
  await composeStop(['base.yaml'], ['thor-solo'])
}

async function soloLogs({ follow = false } = {}) {
  await composeLogs(['base.yaml'], ['thor-solo'], { follow })
}

async function down() {
  const cfg = await loadConfig().catch(() => null)
  const files = cfg?.overlay ? [...SHARED_FILES, cfg.overlay] : SHARED_FILES
  step('stopping stack (thor state preserved)')
  await composeDown(files)
}

async function reset() {
  step('tearing down shared infra + volumes')
  await composeDown(SHARED_FILES, { volumes: true }).catch((e) => warn(e.message))
  step(`removing ${home()}`)
  await rm(home(), { recursive: true, force: true })
  step('removing docker network')
  await removeNetwork()
  info('reset complete')
}

async function sync() {
  const projects = await readAll()
  const summary = await writeEnv(projects)
  step(`merged ${projects.length} project(s), ${summary.profileCount} profile(s), ${summary.addressCount} address var(s)`)
  step('recreating indexer + explorer')
  await composeRecreate(SHARED_FILES, ['vechain-indexer', 'vechain-indexer-api', 'block-explorer'])
  info('sync complete')
}

async function status() {
  const projects = await readAll()
  if (!projects.length) {
    info('no projects registered')
  } else {
    info(`registered projects (${projects.length}):`)
    for (const p of projects) {
      detail(`  ${p.project} — ${p.profiles.length} profile(s), ${Object.keys(p.addresses).length} address(es)`)
    }
  }
  try {
    await fetch('http://localhost:8669/blocks/best', { signal: AbortSignal.timeout(1000) })
    info('thor-solo:      up')
  } catch {
    info('thor-solo:      down')
  }
  try {
    await fetch('http://localhost:8089/', { signal: AbortSignal.timeout(1000) })
    info('indexer-api:    up')
  } catch {
    info('indexer-api:    down')
  }
  try {
    await fetch('http://localhost:8088/', { signal: AbortSignal.timeout(1000) })
    info('block-explorer: up')
  } catch {
    info('block-explorer: down')
  }
}

const HELP = `Usage: vechain-dev <command> [flags]

Commands:
  up [--redeploy] [--skip-deploy]
      Ensure shared infra, run deploy if needed, sync env, restart indexer/explorer, exec dev.
      --redeploy     force the project's deploy command even if contracts are already on-chain
      --skip-deploy  bring infra up but don't run the deploy command at all

  deploy [--redeploy]
      Run the project's deploy command and recreate the indexer (no thor/mongo/explorer restart).
      Use when you've changed contracts but the rest of the stack is already up.

  down
      Stop the full stack (thor state preserved; mongo is ephemeral).

  reset
      Tear down all shared infra, volumes, and ~/.vechain-dev/.

  sync
      Re-merge the address book and recreate indexer + explorer.

  status
      Show registered projects and service health.

  solo up
      Start only thor-solo. No vechain-dev.config.mjs required.

  solo down
      Stop only thor-solo. Chain state preserved on the named volume.

  solo logs [-f]
      Tail thor-solo logs.

Solo customization (env vars, all optional):
  VECHAIN_DEV_THOR_IMAGE                     docker image (default ghcr.io/vechain/thor:latest)
  VECHAIN_DEV_THOR_GAS_LIMIT                 block gas limit (default 40000000)
  VECHAIN_DEV_THOR_TXPOOL_LIMIT              global txpool size (default 10000)
  VECHAIN_DEV_THOR_TXPOOL_LIMIT_PER_ACCOUNT  per-account txpool size (default 256)
  VECHAIN_DEV_THOR_API_CORS                  CORS origin (default *)
  VECHAIN_DEV_GENESIS                        path to a custom genesis JSON
`

const argv = process.argv.slice(2)
const [cmd, sub, ...rest] = argv
const flags = new Set(rest.filter((a) => a.startsWith('--') || a === '-f'))

async function dispatch() {
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP)
    process.exit(cmd ? 0 : 1)
  }

  if (cmd === 'solo') {
    if (sub === 'up') return soloUp()
    if (sub === 'down') return soloDown()
    if (sub === 'logs') return soloLogs({ follow: flags.has('-f') || flags.has('--follow') })
    error(`unknown solo subcommand: ${sub ?? '(none)'} — expected up | down | logs`)
    process.exit(1)
  }

  // top-level commands also accept their flags positionally as argv[1..]
  const topFlags = new Set([sub, ...rest].filter((a) => a && (a.startsWith('--') || a === '-f')))
  const has = (f) => topFlags.has(f)

  switch (cmd) {
    case 'up':
      return up({ force: has('--redeploy'), skip: has('--skip-deploy') })
    case 'deploy':
      return deploy({ force: has('--redeploy') })
    case 'down':
      return down()
    case 'reset':
      return reset()
    case 'sync':
      return sync()
    case 'status':
      return status()
    default:
      error(`unknown command: ${cmd}`)
      process.exit(1)
  }
}

dispatch().catch((err) => {
  error(err.message)
  process.exit(1)
})
