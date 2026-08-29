/**
 * dsh-power-launch — host half.
 *
 * Registers two loopback routes under `/dsh-power-launch/api/` on the dsh web
 * server:
 *  - GET  status    -> { name, version, port, pid } (which dsh build is live);
 *  - POST shutdown  -> flushes the JSON reply, then exits this host process
 *    with code 0 so the listen port is released and the next launch starts
 *    clean. Exit 0 is a clean stop for the dsh-doctor supervisor (user
 *    stop / task complete), never a crash — no automatic restart.
 *
 * The browser half (./client) renders the bottom-right power dock that calls
 * these routes. The shutdown route refuses anything that is not a POST with
 * the `x-dsh-power-launch: confirm` header: a custom header forces a CORS
 * preflight that a hostile cross-origin page cannot pass, while our
 * same-origin client sends it freely.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { DEFAULT_SHORTCUT_NAME, ensureDesktopShortcut, iconPath, launcherPath } from './desktopShortcut.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'power-launch'

/** The webServer service must be up before the routes mount. */
export const inject = ['webServer']

/** Route prefix this plugin owns on the host web server. */
export const API_PREFIX = '/dsh-power-launch'

/** Header a shutdown request must carry (see module docs). */
export const SHUTDOWN_HEADER = 'x-dsh-power-launch'

/** Shape of the GET status reply. */
export interface PowerLaunchStatus {
  /** Always "dsh" — the product the dock is powering off. */
  name: string
  /** Version of the running @deepseek-ai/dsh install ("unknown" if unreadable). */
  version: string
  /** Port the web server is actually listening on. */
  port: number
  /** Pid of the host process the shutdown route exits. */
  pid: number
}

/**
 * Resolve the version of the @deepseek-ai/dsh package the CLI is running from.
 * `process.argv[1]` is the dsh bin (`<dsh-pkg>/lib/bin.js`); its package.json
 * sits one level up. Degrades to "unknown" instead of throwing at boot.
 * @returns the semver string of the live install.
 */
export function resolveDshVersion(): string {
  try {
    const entry = process.argv[1]
    const start = entry ? dirname(entry) : dirname(fileURLToPath(import.meta.url))
    let dir = start
    // Walk up a few levels; the install layout is <root>/lib/bin.js but a
    // symlinked bin or a bundled launcher may sit deeper.
    for (let depth = 0; depth < 6; depth++) {
      const candidate = join(dir, 'package.json')
      try {
        const manifest = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version?: string }
        if (manifest.name === '@deepseek-ai/dsh' && manifest.version) return manifest.version
      } catch {
        /* not here; keep walking */
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    /* never fail the boot over a version badge */
  }
  return 'unknown'
}

/** Write a JSON reply with the given status code. */
function reply(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

/** Build the GET status route reporting which dsh build is live. */
export function makeStatusRoute(ctx: Context): WebRoute {
  return {
    kind: 'exact',
    path: `${API_PREFIX}/api/status`,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        reply(res, 405, { error: 'method-not-allowed' })
        return
      }
      const status: PowerLaunchStatus = {
        name: 'dsh',
        version: resolveDshVersion(),
        port: ctx.webServer.port,
        pid: process.pid,
      }
      reply(res, 200, status)
    },
  }
}

/**
 * Build the POST shutdown route. Guards: POST only + the confirm header, so
 * cross-origin pages cannot trigger an exit. On accept, answer first, then
 * exit(0) on the next tick (the flush is already handed to the socket).
 */
export function makeShutdownRoute(): WebRoute {
  let requested = false
  return {
    kind: 'exact',
    path: `${API_PREFIX}/api/shutdown`,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (req.method !== 'POST') {
        reply(res, 405, { error: 'method-not-allowed' })
        return
      }
      if (req.headers[SHUTDOWN_HEADER] !== 'confirm') {
        reply(res, 403, { error: 'missing-confirm-header' })
        return
      }
      if (requested) {
        reply(res, 202, { ok: true, note: 'shutdown-already-requested' })
        return
      }
      requested = true
      reply(res, 200, { ok: true, exitingWith: 0 })
      process.stderr.write('[dsh-power-launch] clean shutdown requested; exiting with code 0\n')
      // One tick later: the reply is flushed, React clients have seen it.
      setTimeout(() => process.exit(0), 150).unref()
    },
  }
}

/**
 * Mount the status + shutdown routes on the host web server, and bootstrap
 * the Desktop shortcut (create-if-missing, fire-and-forget) so installing
 * this plugin is all it takes: from then on one Desktop click runs the
 * full start flow. Disable with env `DSH_POWER_LAUNCH_SHORTCUT=0`.
 * @param ctx - host Cordis context (webServer service injected).
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const dispose = ctx.webServer.register(makeStatusRoute(ctx))
    return () => dispose()
  }, 'power-launch: status route')

  ctx.effect(() => {
    const dispose = ctx.webServer.register(makeShutdownRoute())
    return () => dispose()
  }, 'power-launch: shutdown route')

  // One-shot, fire-and-forget: (re)write the Desktop shortcut with the
  // official whale icon every boot so installing this plugin is all it takes.
  // Never blocks boot.
  try {
    const target = launcherPath(import.meta.url)
    const icon = iconPath(import.meta.url)
    if (ensureDesktopShortcut({ target, icon })) {
      process.stderr.write(`[dsh-power-launch] desktop shortcut ensured (name: ${DEFAULT_SHORTCUT_NAME})\n`)
    }
  } catch {
    /* never block the boot over a shortcut */
  }
}
