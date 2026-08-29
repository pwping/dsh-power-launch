window.__ModuleLoader__.load({
	id: "dsh-power-launch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/styles.ts
		/**
		* Global stylesheet injected once by the client plugin. Every class is
		* prefixed `pl-` so it cannot collide with the shell. The dock lives in a
		* body portal (position:fixed), above everything in the page.
		*/
		let injected = false;
		/** Inject the stylesheet (idempotent). */
		function injectStyles() {
			if (injected) return;
			injected = true;
			const style = document.createElement("style");
			style.id = "dsh-power-launch-css";
			style.textContent = `
.pl-dock {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  font-size: 13px;
  line-height: 1.5;
}
.pl-btn {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(24, 26, 32, 0.82);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  color: #f2f4f8;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}
.pl-btn:hover {
  transform: translateY(-2px) scale(1.05);
  border-color: rgba(255, 99, 99, 0.65);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.38);
}
.pl-btn:active { transform: translateY(0) scale(0.97); }
.pl-btn.pl-btn-danger {
  border-color: rgba(255, 99, 99, 0.8);
  background: rgba(150, 34, 34, 0.92);
}
.pl-pop {
  max-width: 260px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(28, 30, 36, 0.96);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: #eef1f5;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
}
.pl-pop-title {
  margin: 0 0 4px;
  font-weight: 600;
  font-size: 13px;
}
.pl-pop-body {
  margin: 0 0 10px;
  font-size: 12px;
  color: rgba(238, 241, 245, 0.72);
}
.pl-pop-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.pl-action {
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: transparent;
  color: #eef1f5;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.pl-action:hover { background: rgba(255, 255, 255, 0.08); }
.pl-action.pl-action-confirm {
  border-color: rgba(255, 99, 99, 0.85);
  background: rgba(190, 44, 44, 0.95);
}
.pl-action.pl-action-confirm:hover { background: rgba(214, 56, 56, 1); }
.pl-action[disabled] { opacity: 0.55; cursor: default; }
.pl-error {
  margin-top: 6px;
  font-size: 12px;
  color: #ffb0b0;
}
`;
			document.head.appendChild(style);
		}
		//#endregion
		//#region src/client/ui.tsx
		/**
		* The power dock surface: a fixed bottom-right button (portaled to
		* document.body so no shell overlay / takeover view can cover or shift it).
		*
		* Interaction flow (two-step confirmation):
		*   idle → (click) confirm → (取消) idle
		*                        → (确认关机) sending → off (dock removes itself, tab closes)
		*                                              → error (重试 button)
		*
		* The status badge (dsh version + port) comes from the host half's GET
		* /dsh-power-launch/api/status; a missing route (host half not loaded) simply
		* hides the tooltip details but keeps the dock functional.
		*/
		const STATUS_URL = "/dsh-power-launch/api/status";
		const SHUTDOWN_URL = "/dsh-power-launch/api/shutdown";
		const POWER_ICON = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			viewBox: "0 0 24 24",
			width: "20",
			height: "20",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			"aria-hidden": "true",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 3v9" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.3 6.9a8 8 0 1 0 11.4 0" })]
		});
		/** Tooltip text once the host status arrived; plain label before that. */
		function dockTitle(status) {
			if (status === null) return "关机（dsh Web）";
			return `关机 — dsh v${status.version} · 端口 ${status.port} · pid ${status.pid}`;
		}
		/** The bottom-right power dock and its confirmation / veil surfaces. */
		function PowerDock(_props) {
			const [status, setStatus] = (0, react.useState)(null);
			const [phase, setPhase] = (0, react.useState)("idle");
			const [error, setError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				let alive = true;
				fetch(STATUS_URL, { cache: "no-store" }).then((res) => res.ok ? res.json() : null).then((value) => {
					if (alive && value && value.version) setStatus(value);
				}).catch(() => {});
				return () => {
					alive = false;
				};
			}, []);
			/**
			* Shut the host down and take this tab with it: no veil/popup — on success
			* we call window.close(). Browsers only let scripts close tabs they opened
			* themselves; when the close is refused (or the connection resets mid-
			* response because the host already exited) we blank the page to a dark
			* nothing instead, so no stale UI or error dialogs remain on screen.
			*/
			const requestShutdown = async () => {
				setPhase("sending");
				setError("");
				try {
					const res = await fetch(SHUTDOWN_URL, {
						method: "POST",
						headers: { "x-dsh-power-launch": "confirm" },
						cache: "no-store"
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
				} catch (err) {
					if (err instanceof Error && err.message.startsWith("HTTP")) {
						setError(err.message);
						setPhase("error");
						return;
					}
				}
				setPhase("off");
				window.close();
				window.setTimeout(() => {
					try {
						document.documentElement.innerHTML = "<head><title>dsh 已关机</title></head><body style=\"margin:0;background:#0f1115\"></body>";
					} catch {}
				}, 600);
			};
			if (phase === "off") return null;
			const busy = phase === "sending";
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pl-dock",
				children: [phase === "confirm" || phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "pl-pop",
					role: "dialog",
					"aria-label": "关机确认",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "pl-pop-title",
							children: "确认退出？"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "pl-pop-body",
							children: [
								"将退出 dsh Web 宿主进程",
								status ? `（端口 ${status.port}）` : "",
								"，进行中的会话会中断；端口随即释放，下次启动不会冲突。"
							]
						}),
						phase === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "pl-error",
							children: ["关机请求失败：", error]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "pl-pop-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "pl-action",
								onClick: () => {
									setPhase("idle");
									setError("");
								},
								children: "取消"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "pl-action pl-action-confirm",
								onClick: () => {
									requestShutdown();
								},
								children: phase === "error" ? "重试退出" : "确认退出"
							})]
						})
					]
				}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: phase === "confirm" || busy ? "pl-btn pl-btn-danger" : "pl-btn",
					title: dockTitle(status),
					"aria-label": "关机",
					"aria-disabled": busy,
					onClick: () => {
						if (!busy) setPhase(phase === "confirm" ? "idle" : "confirm");
					},
					children: POWER_ICON
				})]
			}), document.body);
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services: the slot registry must be up first. */
		const inject = ["slots"];
		/**
		* Mount the bottom-right power dock through the shell overlay slot.
		* @param ctx - client root context (slots service injected).
		*/
		function apply(ctx) {
			injectStyles();
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-power-launch",
				order: 100
			}, PowerDock));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map