/**
 * Global stylesheet injected once by the client plugin. Every class is
 * prefixed `pl-` so it cannot collide with the shell. The dock lives in a
 * body portal (position:fixed), above everything in the page.
 */
let injected = false

/** Inject the stylesheet (idempotent). */
export function injectStyles(): void {
  if (injected) return
  injected = true
  const style = document.createElement('style')
  style.id = 'dsh-power-launch-css'
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
`
  document.head.appendChild(style)
}
