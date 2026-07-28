/**
 * Warms the dev server before any spec runs.
 *
 * Vite compiles routes lazily, so the FIRST request for a route pays for the
 * whole module graph. With several workers starting at once they all block on
 * that one compile, and specs then fail waiting for hydration that is merely
 * slow rather than broken — which reads exactly like a detection bug.
 *
 * Fetching each route once here moves that cost out of the tests.
 */
const ROUTES = ['/', '/events']

async function warm(baseURL: string, path: string) {
  const deadline = Date.now() + 90_000
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL(path, baseURL))
      if (response.ok) {
        // Read the body: the server streams the shell, and we want the render
        // to have actually completed, not just the headers to have arrived.
        await response.text()
        return
      }
      lastError = new Error(`${path} responded ${response.status}`)
    } catch (error) {
      // The webServer may not be listening yet depending on start-up order.
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`could not warm ${path}: ${String(lastError)}`)
}

export default async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
  for (const path of ROUTES) await warm(baseURL, path)
}
