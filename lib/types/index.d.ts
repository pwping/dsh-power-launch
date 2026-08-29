import type { Context } from '@deepseek-ai/cordis';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export declare const name = "power-launch";
/** The webServer service must be up before the routes mount. */
export declare const inject: string[];
/** Route prefix this plugin owns on the host web server. */
export declare const API_PREFIX = "/dsh-power-launch";
/** Header a shutdown request must carry (see module docs). */
export declare const SHUTDOWN_HEADER = "x-dsh-power-launch";
/** Shape of the GET status reply. */
export interface PowerLaunchStatus {
    /** Always "dsh" — the product the dock is powering off. */
    name: string;
    /** Version of the running @deepseek-ai/dsh install ("unknown" if unreadable). */
    version: string;
    /** Port the web server is actually listening on. */
    port: number;
    /** Pid of the host process the shutdown route exits. */
    pid: number;
}
/**
 * Resolve the version of the @deepseek-ai/dsh package the CLI is running from.
 * `process.argv[1]` is the dsh bin (`<dsh-pkg>/lib/bin.js`); its package.json
 * sits one level up. Degrades to "unknown" instead of throwing at boot.
 * @returns the semver string of the live install.
 */
export declare function resolveDshVersion(): string;
/** Build the GET status route reporting which dsh build is live. */
export declare function makeStatusRoute(ctx: Context): WebRoute;
/**
 * Build the POST shutdown route. Guards: POST only + the confirm header, so
 * cross-origin pages cannot trigger an exit. On accept, answer first, then
 * exit(0) on the next tick (the flush is already handed to the socket).
 */
export declare function makeShutdownRoute(): WebRoute;
/**
 * Mount the status + shutdown routes on the host web server, and bootstrap
 * the Desktop shortcut (create-if-missing, fire-and-forget) so installing
 * this plugin is all it takes: from then on one Desktop click runs the
 * full start flow. Disable with env `DSH_POWER_LAUNCH_SHORTCUT=0`.
 * @param ctx - host Cordis context (webServer service injected).
 */
export declare function apply(ctx: Context): void;
