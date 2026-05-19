import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { composeDir, defaultGenesis, generatedDir, home } from './paths.mjs'

const NETWORK = 'vechain-thor'

function run(cmd, args, { capture = false, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: { ...process.env, ...env },
    })
    let stdout = ''
    let stderr = ''
    if (capture) {
      child.stdout.on('data', (d) => (stdout += d.toString()))
      child.stderr.on('data', (d) => (stderr += d.toString()))
    }
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${stderr}`))
    })
  })
}

export async function ensureNetwork() {
  const { stdout } = await run('docker', ['network', 'ls', '--format', '{{.Name}}'], { capture: true })
  if (stdout.split('\n').includes(NETWORK)) return
  await run('docker', ['network', 'create', NETWORK])
}

export async function removeNetwork() {
  try {
    await run('docker', ['network', 'rm', NETWORK], { capture: true })
  } catch {
    // network may not exist or may still have endpoints; not fatal
  }
}

export async function composeRequiresEnv() {
  return {
    VECHAIN_DEV_HOME: home(),
    VECHAIN_DEV_GENESIS: process.env.VECHAIN_DEV_GENESIS || defaultGenesis(),
  }
}

function composeArgs(files) {
  const args = ['compose', '--project-name', 'vechain-dev']
  for (const f of files) args.push('-f', join(composeDir(), f))
  return args
}

export async function composeUp(files, services = []) {
  const env = await composeRequiresEnv()
  const args = [...composeArgs(files), 'up', '-d']
  if (services.length) args.push(...services)
  await run('docker', args, { env })
}

export async function composeDown(files, { volumes = false } = {}) {
  const env = await composeRequiresEnv()
  const args = [...composeArgs(files), 'down', '--remove-orphans']
  if (volumes) args.push('-v')
  await run('docker', args, { env })
}

export async function composeRecreate(files, services) {
  const env = await composeRequiresEnv()
  const args = [...composeArgs(files), 'up', '-d', '--force-recreate', ...services]
  await run('docker', args, { env })
}

export async function composeRm(files, services) {
  const env = await composeRequiresEnv()
  const args = [...composeArgs(files), 'rm', '-f', '-s', '-v', ...services]
  await run('docker', args, { env })
}

export async function composePs(files) {
  const env = await composeRequiresEnv()
  const { stdout } = await run('docker', [...composeArgs(files), 'ps', '--format', 'json'], { capture: true, env })
  return stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

export async function waitHealthy(container, timeoutMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const { stdout } = await run(
        'docker',
        ['inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', container],
        { capture: true },
      )
      const status = stdout.trim()
      if (status === 'healthy') return
    } catch {
      // container may not exist yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`timed out waiting for ${container} to become healthy`)
}
