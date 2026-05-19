#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { loadConfig } from '../lib/config.mjs'
import {
  composeDown,
  composeRecreate,
  composeRm,
  composeUp,
  ensureNetwork,
  removeNetwork,
  waitHealthy,
} from '../lib/docker.mjs'
import { readAll, writeEnv } from '../lib/addressBook.mjs'
import { waitForThor } from '../lib/thor.mjs'
import { detail, error, info, step, warn } from '../lib/log.mjs'
import { home } from '../lib/paths.mjs'

const SHARED_FILES = ['base.yaml', 'indexer.yaml', 'explorer.yaml']

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

async function up() {
  const cfg = await loadConfig()
  step(`project: ${cfg.project}`)

  step('ensuring docker network')
  await ensureNetwork()

  step('starting thor-solo (chain state preserved)')
  await composeUp(['base.yaml'], ['thor-solo'])
  await waitForThor()
  await waitHealthy('thor-solo')

  step('clearing ephemeral services (mongo + indexer + explorer)')
  await composeRm(
    ['indexer.yaml', 'explorer.yaml'],
    ['block-explorer', 'vechain-indexer-api', 'vechain-indexer', 'mongo-setup', 'mongo-node1'],
  )

  step(`running deploy: ${cfg.deploy}`)
  await shellExec(cfg.deploy)

  step('merging address book')
  const projects = await readAll()
  if (!projects.find((p) => p.project === cfg.project)) {
    warn(`deploy did not register addresses for project '${cfg.project}' — did you call registerAddresses?`)
  }
  const summary = await writeEnv(projects)
  detail(`${projects.length} project(s), ${summary.profileCount} profile(s), ${summary.addressCount} address var(s)`)

  step('starting mongo + indexer + explorer (fresh state)')
  await composeUp(
    ['indexer.yaml', 'explorer.yaml'],
    ['mongo-node1', 'mongo-setup', 'vechain-indexer', 'vechain-indexer-api', 'block-explorer'],
  )

  info('shared stack ready')
  info('  thor-solo      → http://localhost:8669')
  info('  indexer-api    → http://localhost:8089')
  info('  block-explorer → http://localhost:8088')

  step(`exec: ${cfg.dev}`)
  await shellExec(cfg.dev, { exec: true })
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

const commands = { up, down, reset, sync, status }
const cmd = process.argv[2]

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Usage: vechain-dev <command>

Commands:
  up      ensure shared infra, run deploy, sync env, restart indexer/explorer, exec dev
  down    stop the stack (thor state preserved; mongo is ephemeral)
  reset   tear down all shared infra, volumes, and ~/.vechain-dev/
  sync    re-merge address book and recreate indexer/explorer
  status  show registered projects and service health
`)
  process.exit(cmd ? 0 : 1)
}

if (!commands[cmd]) {
  error(`unknown command: ${cmd}`)
  process.exit(1)
}

commands[cmd]().catch((err) => {
  error(err.message)
  process.exit(1)
})
