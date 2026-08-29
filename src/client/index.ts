/**
 * dsh-power-launch browser half — runs inside the dsh web GUI.
 *
 * Registers one official slot:
 *  - `shell.overlay` — hosts the power dock component, which portals itself
 *    into document.body (position:fixed, viewport bottom-right), so takeover
 *    views and layout transforms inside the shell never cover or displace it.
 *
 * The dock shows a power button; clicking it opens a two-step confirmation
 * and the final action POSTs to the host half's `/dsh-power-launch/api/shutdown`
 * route, which exits the dsh process cleanly (port released). The dock then
 * removes itself and closes this browser tab (window.close, with a blank-page
 * fallback where the browser refuses script-closed tabs) — no veil is shown.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' entry).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { injectStyles } from './styles.ts'
import { PowerDock } from './ui.tsx'

/** Required services: the slot registry must be up first. */
export const inject = ['slots']

/**
 * Mount the bottom-right power dock through the shell overlay slot.
 * @param ctx - client root context (slots service injected).
 */
export function apply(ctx: ClientContext): void {
  injectStyles()

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-power-launch',
    order: 100,
  }, PowerDock))
}
