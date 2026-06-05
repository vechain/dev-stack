import { access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const CONFIG_FILE = 'vechain-dev.config.mjs'

export const ALL_SERVICES = ['thor', 'indexer', 'explorer']

export function needsAddressBook(services) {
  return services.includes('indexer') || services.includes('explorer')
}

export async function loadConfig(cwd = process.cwd()) {
  const path = resolve(cwd, CONFIG_FILE)
  try {
    await access(path)
  } catch {
    throw new Error(
      `No ${CONFIG_FILE} found in ${cwd}.\n` +
        `Create one with:\n` +
        `  export default {\n` +
        `    project: 'my-project',\n` +
        `    profiles: ['accounts'],\n` +
        `    deploy:  'yarn deploy:solo',\n` +
        `  }`,
    )
  }
  const mod = await import(pathToFileURL(path).href)
  const cfg = mod.default
  if (!cfg || typeof cfg !== 'object') throw new Error(`${CONFIG_FILE} must default-export an object`)
  if (!cfg.project) throw new Error(`${CONFIG_FILE}: 'project' required`)

  const services = cfg.services ?? ALL_SERVICES
  if (!Array.isArray(services) || services.length === 0) {
    throw new Error(`${CONFIG_FILE}: 'services' must be a non-empty array`)
  }
  if (!services.includes('thor')) {
    throw new Error(`${CONFIG_FILE}: 'services' must include 'thor'`)
  }
  for (const s of services) {
    if (!ALL_SERVICES.includes(s)) {
      throw new Error(
        `${CONFIG_FILE}: unknown service '${s}' — must be one of ${ALL_SERVICES.join(', ')}`,
      )
    }
  }

  if (needsAddressBook(services) && !cfg.deploy) {
    throw new Error(
      `${CONFIG_FILE}: 'deploy' command required when 'services' includes 'indexer' or 'explorer'`,
    )
  }

  return { ...cfg, services: [...new Set(services)] }
}
