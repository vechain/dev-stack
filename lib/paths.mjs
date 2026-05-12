import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const home = () =>
  process.env.VECHAIN_DEV_HOME || join(homedir(), '.vechain-dev')

export const projectConfigDir = () => join(home(), 'config')
export const generatedDir = () => join(home(), 'generated')
export const projectConfigFile = (project) => join(projectConfigDir(), `${project}.json`)

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
export const composeDir = () => join(packageRoot, 'compose')
export const defaultGenesis = () => join(packageRoot, 'genesis', 'solo.default.json')
