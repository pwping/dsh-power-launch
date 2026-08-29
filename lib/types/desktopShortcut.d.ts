/** Default shortcut (and Start Menu) name without the `.lnk` extension. */
export declare const DEFAULT_SHORTCUT_NAME = "DeepSeek Harness Web";
/** Environment kill-switch: set to "0"/"false" to disable auto-creation. */
export declare const DISABLE_ENV = "DSH_POWER_LAUNCH_SHORTCUT";
/**
 * Absolute path to the launcher batch shipped in this package
 * (`<plugin>/launcher/dsh-launch.bat`, resolved from `lib/index.js`).
 * @param moduleUrl - the host module's `import.meta.url`.
 * @returns the launcher path (may not exist if the pack layout changed).
 */
export declare function launcherPath(moduleUrl: string): string;
/**
 * Absolute path to the official DeepSeek Harness whale icon shipped in this
 * package (`<plugin>/assets/dsh-whale.ico`).
 * @param moduleUrl - the host module's `import.meta.url`.
 * @returns the ico path (may not exist if the asset was not packed).
 */
export declare function iconPath(moduleUrl: string): string;
/** Options for {@link ensureDesktopShortcut}. */
export interface EnsureShortcutOptions {
    /** Absolute path to the launcher batch to point the shortcut at. */
    target: string;
    /** Absolute path to a `.ico` for the shortcut; falls back to a system icon. */
    icon?: string;
    /** Shortcut name without extension; defaults to {@link DEFAULT_SHORTCUT_NAME}. */
    name?: string;
    /** When true (default), skip unless the env kill-switch disables it. */
    enabled?: boolean;
}
/**
 * Best-effort: asynchronously create the Desktop shortcut if absent. This
 * does NOT block the caller or the boot: the long-lived dsh host keeps the
 * child alive while it runs. The worker is unref'd (never holds the process
 * open) and its outcome is logged to stderr for diagnosability. Never throws.
 * @param opts - target launcher path, optional name and enabled flag.
 * @returns true if the worker was launched, false if skipped/failed to spawn.
 */
export declare function ensureDesktopShortcut(opts: EnsureShortcutOptions): boolean;
