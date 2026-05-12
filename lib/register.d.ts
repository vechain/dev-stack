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
