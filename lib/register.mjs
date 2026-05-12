import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { projectConfigDir, projectConfigFile } from './paths.mjs'

const PROJECT_NAME = /^[a-z][a-z0-9-]*$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

export async function registerAddresses({ project, profiles, addresses }) {
  if (!project || !PROJECT_NAME.test(project)) {
    throw new Error(
      `registerAddresses: 'project' must match ${PROJECT_NAME} (got ${JSON.stringify(project)})`,
    )
  }
  if (!Array.isArray(profiles) || profiles.some((p) => typeof p !== 'string' || !p)) {
    throw new Error(`registerAddresses: 'profiles' must be a non-empty array of strings`)
  }
  if (!addresses || typeof addresses !== 'object') {
    throw new Error(`registerAddresses: 'addresses' must be an object of ENV_NAME -> 0x address`)
  }
  for (const [k, v] of Object.entries(addresses)) {
    if (typeof v !== 'string' || !ADDRESS.test(v)) {
      throw new Error(`registerAddresses: address for ${k} is not a 0x… 20-byte hex: ${v}`)
    }
  }

  await mkdir(projectConfigDir(), { recursive: true })

  const path = projectConfigFile(project)
  const tmp = `${path}.tmp`
  const body = JSON.stringify(
    { project, profiles: [...new Set(profiles)].sort(), addresses, updatedAt: new Date().toISOString() },
    null,
    2,
  )
  await mkdir(dirname(tmp), { recursive: true })
  await writeFile(tmp, body + '\n', 'utf8')
  await rename(tmp, path)

  return path
}
