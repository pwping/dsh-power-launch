import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export type PowerDockProps = PropsRuntime<'shell.overlay'> & InjectFace<object>;
/** The bottom-right power dock and its confirmation / veil surfaces. */
export declare function PowerDock(_props: PowerDockProps): import("react").ReactPortal | null;
