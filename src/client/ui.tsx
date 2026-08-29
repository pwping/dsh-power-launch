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
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PowerLaunchStatus } from '../index.ts'

export type PowerDockProps = PropsRuntime<'shell.overlay'> & InjectFace<object>

type Phase = 'idle' | 'confirm' | 'sending' | 'off' | 'error'

const STATUS_URL = '/dsh-power-launch/api/status'
const SHUTDOWN_URL = '/dsh-power-launch/api/shutdown'

const POWER_ICON = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 3v9" />
    <path d="M6.3 6.9a8 8 0 1 0 11.4 0" />
  </svg>
)

/** Tooltip text once the host status arrived; plain label before that. */
function dockTitle(status: PowerLaunchStatus | null): string {
  if (status === null) return '关机（dsh Web）'
  return `关机 — dsh v${status.version} · 端口 ${status.port} · pid ${status.pid}`
}

/** The bottom-right power dock and its confirmation / veil surfaces. */
export function PowerDock(_props: PowerDockProps) {
  const [status, setStatus] = useState<PowerLaunchStatus | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')

  // One-shot status read; the host half is optional decoration, never blocking.
  useEffect(() => {
    let alive = true
    fetch(STATUS_URL, { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<PowerLaunchStatus>) : null))
      .then((value) => { if (alive && value && value.version) setStatus(value) })
      .catch(() => { /* route absent — badge stays plain */ })
    return () => { alive = false }
  }, [])

  /**
   * Shut the host down and take this tab with it: no veil/popup — on success
   * we call window.close(). Browsers only let scripts close tabs they opened
   * themselves; when the close is refused (or the connection resets mid-
   * response because the host already exited) we blank the page to a dark
   * nothing instead, so no stale UI or error dialogs remain on screen.
   */
  const requestShutdown = async (): Promise<void> => {
    setPhase('sending')
    setError('')
    try {
      const res = await fetch(SHUTDOWN_URL, {
        method: 'POST',
        headers: { 'x-dsh-power-launch': 'confirm' },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      // A network reset here means the host exited before the reply landed —
      // that is still a successful shutdown. Only a real HTTP refusal keeps
      // the dock around for a retry.
      if (err instanceof Error && err.message.startsWith('HTTP')) {
        setError(err.message)
        setPhase('error')
        return
      }
    }
    setPhase('off')
    window.close()
    window.setTimeout(() => {
      try {
        document.documentElement.innerHTML =
          '<head><title>dsh 已关机</title></head><body style="margin:0;background:#0f1115"></body>'
      } catch {
        /* the tab is dead anyway */
      }
    }, 600)
  }

  // After the shutdown request: the dock removes itself while the tab closes
  // (or blanks). Nothing is displayed — per user request, no veil.
  if (phase === 'off') return null

  const busy = phase === 'sending'

  return createPortal(
    <div className="pl-dock">
      {phase === 'confirm' || phase === 'error' ? (
        <div className="pl-pop" role="dialog" aria-label="关机确认">
          <p className="pl-pop-title">确认退出？</p>
          <p className="pl-pop-body">
            将退出 dsh Web 宿主进程{status ? `（端口 ${status.port}）` : ''}，进行中的会话会中断；端口随即释放，下次启动不会冲突。
          </p>
          {phase === 'error' ? <p className="pl-error">关机请求失败：{error}</p> : null}
          <div className="pl-pop-actions">
            <button type="button" className="pl-action" onClick={() => { setPhase('idle'); setError('') }}>
              取消
            </button>
            <button type="button" className="pl-action pl-action-confirm" onClick={() => { void requestShutdown() }}>
              {phase === 'error' ? '重试退出' : '确认退出'}
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={phase === 'confirm' || busy ? 'pl-btn pl-btn-danger' : 'pl-btn'}
        title={dockTitle(status)}
        aria-label="关机"
        aria-disabled={busy}
        onClick={() => { if (!busy) setPhase(phase === 'confirm' ? 'idle' : 'confirm') }}
      >
        {POWER_ICON}
      </button>
    </div>,
    document.body,
  )
}
