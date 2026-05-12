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
