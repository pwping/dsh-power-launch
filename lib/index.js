import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
//#region src/desktopShortcut.ts
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
/** Default shortcut (and Start Menu) name without the `.lnk` extension. */
const DEFAULT_SHORTCUT_NAME = "DeepSeek Harness Web";
/**
* Absolute path to the launcher batch shipped in this package
* (`<plugin>/launcher/dsh-launch.bat`, resolved from `lib/index.js`).
* @param moduleUrl - the host module's `import.meta.url`.
* @returns the launcher path (may not exist if the pack layout changed).
*/
function launcherPath(moduleUrl) {
	return fileURLToPath(new URL("../launcher/dsh-launch.bat", new URL(moduleUrl)));
}
/**
* Absolute path to the official DeepSeek Harness whale icon shipped in this
* package (`<plugin>/assets/dsh-whale.ico`).
* @param moduleUrl - the host module's `import.meta.url`.
* @returns the ico path (may not exist if the asset was not packed).
*/
function iconPath(moduleUrl) {
	return fileURLToPath(new URL("../assets/dsh-whale.ico", new URL(moduleUrl)));
}
/**
* PowerShell that creates the Desktop shortcut if it is missing. Values are
* passed through the child environment to dodge quoting/encoding pitfalls; the
* whole script is handed to `-EncodedCommand` (UTF-16LE base64) so it is
* immune to codepage issues.
*/
function buildEnsureScript() {
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
		"$s.Save()"
	].join("\n");
}
/** Encode a script string as PowerShell `-EncodedCommand` (UTF-16LE base64). */
function encodeCommand(script) {
	return Buffer.from(script, "utf16le").toString("base64");
}
/**
* Best-effort: asynchronously create the Desktop shortcut if absent. This
* does NOT block the caller or the boot: the long-lived dsh host keeps the
* child alive while it runs. The worker is unref'd (never holds the process
* open) and its outcome is logged to stderr for diagnosability. Never throws.
* @param opts - target launcher path, optional name and enabled flag.
* @returns true if the worker was launched, false if skipped/failed to spawn.
*/
function ensureDesktopShortcut(opts) {
	if (/^(0|false)$/i.test(process.env["DSH_POWER_LAUNCH_SHORTCUT"] ?? "") || opts.enabled === false) return false;
	if (!existsSync(opts.target)) return false;
	const powershell = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
	try {
		const child = spawn(powershell, [
			"-NoProfile",
			"-WindowStyle",
			"Hidden",
			"-ExecutionPolicy",
			"Bypass",
			"-EncodedCommand",
			encodeCommand(buildEnsureScript())
		], {
			stdio: "ignore",
			windowsHide: true,
			env: {
				...process.env,
				DSH_LNKL_TARGET: opts.target,
				DSH_LNKL_NAME: opts.name ?? "DeepSeek Harness Web",
				DSH_LNKL_ICON: opts.icon ?? ""
			}
		});
		child.on("error", () => {});
		child.on("exit", (code) => {
			process.stderr.write(`[dsh-power-launch] desktop-shortcut worker exited code=${code}\n`);
		});
		child.unref();
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region src/index.ts
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
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
const name = "power-launch";
/** The webServer service must be up before the routes mount. */
const inject = ["webServer"];
/** Route prefix this plugin owns on the host web server. */
const API_PREFIX = "/dsh-power-launch";
/** Header a shutdown request must carry (see module docs). */
const SHUTDOWN_HEADER = "x-dsh-power-launch";
/**
* Resolve the version of the @deepseek-ai/dsh package the CLI is running from.
* `process.argv[1]` is the dsh bin (`<dsh-pkg>/lib/bin.js`); its package.json
* sits one level up. Degrades to "unknown" instead of throwing at boot.
* @returns the semver string of the live install.
*/
function resolveDshVersion() {
	try {
		const entry = process.argv[1];
		let dir = entry ? dirname(entry) : dirname(fileURLToPath(import.meta.url));
		for (let depth = 0; depth < 6; depth++) {
			const candidate = join(dir, "package.json");
			try {
				const manifest = JSON.parse(readFileSync(candidate, "utf8"));
				if (manifest.name === "@deepseek-ai/dsh" && manifest.version) return manifest.version;
			} catch {}
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	} catch {}
	return "unknown";
}
/** Write a JSON reply with the given status code. */
function reply(res, code, body) {
	const payload = JSON.stringify(body);
	res.writeHead(code, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(payload),
		"Cache-Control": "no-store"
	});
	res.end(payload);
}
/** Build the GET status route reporting which dsh build is live. */
function makeStatusRoute(ctx) {
	return {
		kind: "exact",
		path: `${API_PREFIX}/api/status`,
		handler: (req, res) => {
			if (req.method !== "GET" && req.method !== "HEAD") {
				reply(res, 405, { error: "method-not-allowed" });
				return;
			}
			reply(res, 200, {
				name: "dsh",
				version: resolveDshVersion(),
				port: ctx.webServer.port,
				pid: process.pid
			});
		}
	};
}
/**
* Build the POST shutdown route. Guards: POST only + the confirm header, so
* cross-origin pages cannot trigger an exit. On accept, answer first, then
* exit(0) on the next tick (the flush is already handed to the socket).
*/
function makeShutdownRoute() {
	let requested = false;
	return {
		kind: "exact",
		path: `${API_PREFIX}/api/shutdown`,
		handler: (req, res) => {
			if (req.method !== "POST") {
				reply(res, 405, { error: "method-not-allowed" });
				return;
			}
			if (req.headers["x-dsh-power-launch"] !== "confirm") {
				reply(res, 403, { error: "missing-confirm-header" });
				return;
			}
			if (requested) {
				reply(res, 202, {
					ok: true,
					note: "shutdown-already-requested"
				});
				return;
			}
			requested = true;
			reply(res, 200, {
				ok: true,
				exitingWith: 0
			});
			process.stderr.write("[dsh-power-launch] clean shutdown requested; exiting with code 0\n");
			setTimeout(() => process.exit(0), 150).unref();
		}
	};
}
/**
* Mount the status + shutdown routes on the host web server, and bootstrap
* the Desktop shortcut (create-if-missing, fire-and-forget) so installing
* this plugin is all it takes: from then on one Desktop click runs the
* full start flow. Disable with env `DSH_POWER_LAUNCH_SHORTCUT=0`.
* @param ctx - host Cordis context (webServer service injected).
*/
function apply(ctx) {
	ctx.effect(() => {
		const dispose = ctx.webServer.register(makeStatusRoute(ctx));
		return () => dispose();
	}, "power-launch: status route");
	ctx.effect(() => {
		const dispose = ctx.webServer.register(makeShutdownRoute());
		return () => dispose();
	}, "power-launch: shutdown route");
	try {
		if (ensureDesktopShortcut({
			target: launcherPath(import.meta.url),
			icon: iconPath(import.meta.url)
		})) process.stderr.write(`[dsh-power-launch] desktop shortcut ensured (name: ${DEFAULT_SHORTCUT_NAME})\n`);
	} catch {}
}
//#endregion
export { API_PREFIX, SHUTDOWN_HEADER, apply, inject, makeShutdownRoute, makeStatusRoute, name, resolveDshVersion };
