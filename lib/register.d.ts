export interface RegisterAddressesInput {
  /** Project name (lower-kebab-case, [a-z][a-z0-9-]*) */
  project: string
  /** Spring profile names this project contributes to the shared indexer */
  profiles: string[]
  /** Map of env-var name → 0x-prefixed 20-byte hex address */
  addresses: Record<string, string>
}

/**
 * Writes ~/.vechain-dev/addresses/<project>.json with the supplied
 * profiles + addresses. The shared dev-stack CLI reads these files to
 * build the merged env files mounted into the indexer + block-explorer.
 *
 * @returns the absolute path of the file written
 */
export function registerAddresses(input: RegisterAddressesInput): Promise<string>

export interface IsProjectDeployedOptions {
  /** Thor RPC URL. Defaults to http://localhost:8669. */
  rpcUrl?: string
}

export type ProjectDeploymentStatus =
  | { deployed: true }
  | { deployed: false; reason: 'not-registered' }
  | { deployed: false; reason: 'missing-code'; address: string }

/**
 * Checks whether a previously-registered project still has all of its
 * contracts on-chain. Returns `{ deployed: true }` only if every address in
 * the project's registration file has code on the current chain.
 *
 * Use this from a project's deploy script (or rely on `vechain-dev up`,
 * which calls this for you) instead of doing a per-project `getCode` check
 * against an in-repo config file — those files are not part of the shared
 * state and go stale across `vechain-dev reset`.
 */
export function isProjectDeployed(
  project: string,
  options?: IsProjectDeployedOptions,
): Promise<ProjectDeploymentStatus>
