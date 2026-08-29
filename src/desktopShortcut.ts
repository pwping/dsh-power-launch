/**
 * Desktop shortcut bootstrapping for the host half.
 *
 * On every dsh web boot (fire-and-forget, never blocks or throws) we ask
 * Windows to (re)write a "DeepSeek Harness Web" shortcut on the current
 * user's Desktop that runs the bundled launcher
 * (`launcher/dsh-launch.bat`) and carries the official whale icon
 * (`assets/dsh-whale.ico`). The write is idempotent and self-healing: a
 * deleted shortcut comes back on next boot, and shipped fixes (icon, target)
 * propagate to an already-present shortcut. A renamed/moved shortcut is a
 * different file and stays untouched.
 *
 * The launcher path is resolved from the plugin's own location, so the
 * shortcut always points at the launcher shipped inside THIS package (works
 * through the profile's `link:` install because Node reports the real path in
 * `import.meta.url`).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Default shortcut (and Start Menu) name without the `.lnk` extension. */
export const DEFAULT_SHORTCUT_NAME = 'DeepSeek Harness Web'

/** Environment kill-switch: set to "0"/"false" to disable auto-creation. */
export const DISABLE_ENV = 'DSH_POWER_LAUNCH_SHORTCUT'

/**
 * Absolute path to the launcher batch shipped in this package
 * (`<plugin>/launcher/dsh-launch.bat`, resolved from `lib/index.js`).
 * @param moduleUrl - the host module's `import.meta.url`.
 * @returns the launcher path (may not exist if the pack layout changed).
 */
export function launcherPath(moduleUrl: string): string {
  return fileURLToPath(new URL('../launcher/dsh-launch.bat', new URL(moduleUrl)))
}

/**
 * Absolute path to the official DeepSeek Harness whale icon shipped in this
 * package (`<plugin>/assets/dsh-whale.ico`).
 * @param moduleUrl - the host module's `import.meta.url`.
 * @returns the ico path (may not exist if the asset was not packed).
 */
export function iconPath(moduleUrl: string): string {
  return fileURLToPath(new URL('../assets/dsh-whale.ico', new URL(moduleUrl)))
}

/**
 * PowerShell that creates the Desktop shortcut if it is missing. Values are
 * passed through the child environment to dodge quoting/encoding pitfalls; the
 * whole script is handed to `-EncodedCommand` (UTF-16LE base64) so it is
 * immune to codepage issues.
 */
function buildEnsureScript(): string {
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    "$target=$env:DSH_LNKL_TARGET",
    "if(-not $target -or -not (Test-Path -LiteralPath $target)){exit 0}",
    "$name=$env:DSH_LNKL_NAME; if(-not $name){$name='DeepSeek Harness Web'}",
    "$desktop=[Environment]::GetFolderPath('Desktop')",
    "$lnk=Join-Path $desktop ($name + '.lnk')",
    "$ws=New-Object -ComObject WScript.Shell",
    "$s=$ws.CreateShortcut($lnk)",
    "$s.TargetPath=$target",
    "$s.WorkingDirectory=Split-Path -Parent $target",
    "$s.WindowStyle=1",
    "if($env:DSH_LNKL_ICON -and (Test-Path -LiteralPath $env:DSH_LNKL_ICON)){ $s.IconLocation=\"$($env:DSH_LNKL_ICON),0\" } else { $s.IconLocation=\"$env:SystemRoot\\System32\\shell32.dll,13\" }",
    "$s.Description='DeepSeek Harness Web：启动前自动关端口并经镜像检查更新，桌面一键启动。'",
    '$s.Save()',
  ].join('\n')
}

/** Encode a script string as PowerShell `-EncodedCommand` (UTF-16LE base64). */
function encodeCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** Options for {@link ensureDesktopShortcut}. */
export interface EnsureShortcutOptions {
  /** Absolute path to the launcher batch to point the shortcut at. */
  target: string
  /** Absolute path to a `.ico` for the shortcut; falls back to a system icon. */
  icon?: string
  /** Shortcut name without extension; defaults to {@link DEFAULT_SHORTCUT_NAME}. */
  name?: string
  /** When true (default), skip unless the env kill-switch disables it. */
  enabled?: boolean
}

/**
 * Best-effort: asynchronously create the Desktop shortcut if absent. This
 * does NOT block the caller or the boot: the long-lived dsh host keeps the
 * child alive while it runs. The worker is unref'd (never holds the process
 * open) and its outcome is logged to stderr for diagnosability. Never throws.
 * @param opts - target launcher path, optional name and enabled flag.
 * @returns true if the worker was launched, false if skipped/failed to spawn.
 */
export function ensureDesktopShortcut(opts: EnsureShortcutOptions): boolean {
  const disabled = /^(0|false)$/i.test(process.env[DISABLE_ENV] ?? '')
  if (disabled || opts.enabled === false) return false
  if (!existsSync(opts.target)) return false

  const root = process.env.SystemRoot ?? 'C:\\Windows'
  const powershell = `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  try {
    const child = spawn(
      powershell,
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeCommand(buildEnsureScript())],
      {
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, DSH_LNKL_TARGET: opts.target, DSH_LNKL_NAME: opts.name ?? DEFAULT_SHORTCUT_NAME, DSH_LNKL_ICON: opts.icon ?? '' },
      },
    )
    child.on('error', () => { /* fire-and-forget: a missing PowerShell never breaks boot */ })
    child.on('exit', (code) => {
      process.stderr.write(`[dsh-power-launch] desktop-shortcut worker exited code=${code}\n`)
    })
    // Don't keep the dsh event loop alive for a cosmetic side task.
    child.unref()
    return true
  } catch {
    return false
  }
}
