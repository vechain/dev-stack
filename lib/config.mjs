import { access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'

const CONFIG_FILE = 'vechain-dev.config.mjs'

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
        `    dev:     'yarn frontend:dev',\n` +
        `  }`,
    )
  }
  const mod = await import(pathToFileURL(path).href)
  const cfg = mod.default
  if (!cfg || typeof cfg !== 'object') throw new Error(`${CONFIG_FILE} must default-export an object`)
  if (!cfg.project) throw new Error(`${CONFIG_FILE}: 'project' required`)
  if (!cfg.deploy) throw new Error(`${CONFIG_FILE}: 'deploy' command required`)
  if (!cfg.dev) throw new Error(`${CONFIG_FILE}: 'dev' command required`)
  return cfg
}
