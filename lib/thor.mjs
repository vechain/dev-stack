export async function waitForThor(url = 'http://localhost:8669', timeoutMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/blocks/best`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`thor-solo at ${url} did not respond within ${timeoutMs}ms`)
}

export async function hasCode(address, url = 'http://localhost:8669') {
  const res = await fetch(`${url}/accounts/${address}`)
  if (!res.ok) return false
  const body = await res.json()
  return Boolean(body.hasCode)
}

// vechain-indexer-api has no docker healthcheck, so poll the HTTP port
// directly. Any response (including 404) means the server is up; only
// transport-level errors (ECONNREFUSED, etc.) count as "not yet".
export async function waitForIndexerApi(url = 'http://localhost:8089', timeoutMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(`${url}/`, { signal: AbortSignal.timeout(2000) })
      return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`indexer-api at ${url} did not respond within ${timeoutMs}ms`)
}
