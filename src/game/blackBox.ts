export const MAX_BLACK_BOX_MS = 10_000;
const TICK_MS = 100;

export type BlackBoxStopReason = 'manual' | 'timeout' | 'exit';

export type RecordedEvent =
  | { t: number; type: 'message'; data: Record<string, unknown> }
  | { t: number; type: 'key'; key: number; down: boolean };

/** The Black Box: everything needed to replay a bug report — the world as it was when recording began, then every server message and key press. The server adds a `server` section (full sprite dumps) before saving it. */
export interface BlackBoxRecording {
  version: 1;
  login: string;
  startedAt: string;
  durationMs: number;
  stoppedBy: BlackBoxStopReason;
  viewport: { width: number; height: number };
  userAgent: string;
  /** Renderer state at t=0 (sprites, avatars, image paths...); redraw frames are deltas on top of it. */
  initial: unknown;
  events: RecordedEvent[];
}

interface BlackBoxOptions {
  login: string;
  snapshot: () => unknown;
  /** Receives each finished recording; the caller ships it to the server, which keeps only the latest. */
  onFinished: (recording: BlackBoxRecording) => void;
  /** Called as recording starts, so the server can capture its own view of the world at the same moment. */
  onStarted?: () => void;
  /** Called on start, every tick and on stop with the milliseconds left (`null` once stopped). */
  onChange?: (remainingMs: number | null) => void;
}

/** The Black Box flight recorder, toggled by the backtick key: captures incoming server messages and outgoing key presses for up to 10 seconds. */
export class BlackBox {
  private startedPerf = 0;
  private startedAt = '';
  private initial: unknown;
  private events: RecordedEvent[] = [];
  private tick: ReturnType<typeof setInterval> | undefined;
  private active = false;

  constructor(private readonly options: BlackBoxOptions) {}

  get isRecording(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) this.stop('manual');
    else this.start();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.startedPerf = performance.now();
    this.startedAt = new Date().toISOString();
    this.initial = structuredClone(this.options.snapshot());
    this.events = [];
    this.options.onChange?.(MAX_BLACK_BOX_MS);
    this.options.onStarted?.();

    this.tick = setInterval(() => {
      const remaining = MAX_BLACK_BOX_MS - this.elapsed();
      if (remaining <= 0) this.stop('timeout');
      else this.options.onChange?.(remaining);
    }, TICK_MS);
  }

  stop(reason: BlackBoxStopReason): void {
    if (!this.active) return;
    this.active = false;
    if (this.tick) clearInterval(this.tick);
    this.tick = undefined;

    const durationMs = Math.min(Math.round(this.elapsed()), MAX_BLACK_BOX_MS);
    const events = this.events;
    this.events = [];
    this.options.onChange?.(null);
    this.options.onFinished({
      version: 1,
      login: this.options.login,
      startedAt: this.startedAt,
      durationMs,
      stoppedBy: reason,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      userAgent: navigator.userAgent,
      initial: this.initial,
      events,
    });
    this.initial = undefined;
  }

  logMessage(data: Record<string, unknown>): void {
    if (!this.active) return;
    // Cloned because the renderer keeps (and later mutates) parts of full-state payloads.
    this.events.push({ t: this.elapsed(), type: 'message', data: structuredClone(data) });
  }

  logKey(key: number, down: boolean): void {
    if (!this.active) return;
    this.events.push({ t: this.elapsed(), type: 'key', key, down });
  }

  private elapsed(): number {
    return performance.now() - this.startedPerf;
  }
}
