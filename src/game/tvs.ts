// Background TVs: world-space screens (Cell.getTvs()) hanging from chains that all show one shared, muted video;
// when it ends they show a plain "YOUR AD HERE" card for a few seconds, then the video starts over. Purely cosmetic
// and client-side — nothing here touches gameplay, and each client plays its own copy at its own moment.

export interface Tv {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where the two chains holding the TV up end, on the wall directly above it. */
  chainTopY: number;
}

/** How long the "YOUR AD HERE" card shows between plays of the video. */
export const AD_DURATION_MS = 5000;
const CHAIN_COLOR = '#8a90b0';
const CHAIN_LINK_LENGTH_PX = 16;
// Links overlap a little, like real chain, and alternate between face-on (an open oval) and edge-on (a thin bar).
const CHAIN_LINK_PITCH_PX = 12;
const CHAIN_LINK_WIDTH_PX = 8;
const CHAIN_LINE_WIDTH_PX = 2.5;
const CHAIN_INSET_RATIO = 0.2;

// Served by the Express server (see server.ts); the WebM copy is there for browsers without H.264.
const VIDEO_SOURCES: ReadonlyArray<{ src: string; type: string }> = [
  { src: '/videos/imu_full.mp4', type: 'video/mp4; codecs="avc1.4D401E"' },
  { src: '/videos/imu_full.webm', type: 'video/webm; codecs="vp9"' },
];
const SCREEN_DIM = 0.88;
const FRAME_PX = 10;
const NEON_COLORS = ['#00f6ff', '#ff2ea6', '#ffb347', '#b6ff3c'];
// A video element has a frame to draw once it has the current frame's data.
const HAVE_CURRENT_DATA = 2;

// A random start never lands this close to the end, so players don't see the ad card right after the video begins.
const END_MARGIN_SECONDS = 10;

/** A random point to start the video from (seconds), kept clear of the end; 0 until the duration is known. */
export function randomStartTime(duration: number, random: () => number = Math.random): number {
  if (!Number.isFinite(duration) || duration <= END_MARGIN_SECONDS) return 0;
  return random() * (duration - END_MARGIN_SECONDS);
}

/** Whether a TV overlaps the viewport (frame + glow margin included). */
export function isTvVisible(tv: Tv, offsetX: number, offsetY: number, viewWidth: number, viewHeight: number): boolean {
  const margin = FRAME_PX + 24;
  const x = tv.x - offsetX;
  const y = tv.y - offsetY;
  return x + tv.width + margin > 0 && x - margin < viewWidth && y + tv.height + margin > 0 && y - margin < viewHeight;
}

/** Whether a TV's chains (the column from the wall above down to the TV) overlap the viewport. */
export function areChainsVisible(tv: Tv, offsetX: number, offsetY: number, viewWidth: number, viewHeight: number): boolean {
  const x = tv.x - offsetX;
  const top = tv.chainTopY - offsetY;
  const bottom = tv.y - offsetY;
  return x + tv.width > 0 && x < viewWidth && bottom > 0 && top < viewHeight;
}

/** The x of each of a TV's two chains. */
export function chainXs(tv: Tv): [number, number] {
  return [tv.x + tv.width * CHAIN_INSET_RATIO, tv.x + tv.width * (1 - CHAIN_INSET_RATIO)];
}

/**
 * Top y of every chain link between `top` and `bottom` that is within the viewport (0..viewHeight), keyed by its index
 * from the top so the face-on/edge-on pattern stays put as the camera moves. Only visible links are returned, since a
 * chain can be well over a thousand pixels long.
 */
export function visibleChainLinks(top: number, bottom: number, viewHeight: number): Array<{ index: number; y: number }> {
  const first = Math.max(0, Math.floor((0 - CHAIN_LINK_LENGTH_PX - top) / CHAIN_LINK_PITCH_PX));
  const links: Array<{ index: number; y: number }> = [];

  for (let index = first; ; index++) {
    const y = top + index * CHAIN_LINK_PITCH_PX;
    // The last link may tuck behind the TV's frame (drawn after the chains) so no gap shows between them.
    if (y + CHAIN_LINK_LENGTH_PX > bottom + FRAME_PX || y > viewHeight) break;
    links.push({ index, y });
  }
  return links;
}

/** The centered source rectangle that fills a screen of the given shape without stretching the video. */
export function coverCrop(
  videoWidth: number,
  videoHeight: number,
  screenWidth: number,
  screenHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const videoAspect = videoWidth / videoHeight;
  const screenAspect = screenWidth / screenHeight;

  if (videoAspect > screenAspect) {
    const sw = videoHeight * screenAspect;
    return { sx: (videoWidth - sw) / 2, sy: 0, sw, sh: videoHeight };
  }

  const sh = videoWidth / screenAspect;
  return { sx: 0, sy: (videoHeight - sh) / 2, sw: videoWidth, sh };
}

export class TvScreens {
  private video: HTMLVideoElement | undefined;
  private failed = false;
  /** When the ad card currently showing (after the video ended) gives way to the video again. */
  private adUntil: number | undefined;

  /** Whether the shared video is actually playing right now (it is paused while no TV is on screen). */
  get isPlaying(): boolean {
    return this.video !== undefined && !this.video.paused && !this.video.ended;
  }

  /** Whether the "YOUR AD HERE" card is up instead of the video. */
  get isShowingAd(): boolean {
    return this.adUntil !== undefined && performance.now() < this.adUntil;
  }

  /** Whether the browser could decode a source; false drives the "NO SIGNAL" screens. */
  get hasSignal(): boolean {
    return this.video !== undefined && !this.failed && this.video.readyState >= HAVE_CURRENT_DATA;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    tvs: readonly Tv[],
    offsetX: number,
    offsetY: number,
    viewWidth: number,
    viewHeight: number,
    now: number,
  ): void {
    this.drawChains(ctx, tvs, offsetX, offsetY, viewWidth, viewHeight);

    const visible = tvs.filter((tv) => isTvVisible(tv, offsetX, offsetY, viewWidth, viewHeight));
    const showAd = this.updateAdPhase(visible.length > 0, now);
    if (visible.length === 0) return;

    const video = this.video;
    const frame = !showAd && video && this.hasSignal ? video : undefined;
    const crop = frame && coverCrop(frame.videoWidth, frame.videoHeight, visible[0].width, visible[0].height);

    for (const tv of visible) {
      const index = tvs.indexOf(tv);
      const x = Math.round(tv.x - offsetX);
      const y = Math.round(tv.y - offsetY);
      const color = NEON_COLORS[index % NEON_COLORS.length];

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 28;
      ctx.fillStyle = '#05060c';
      ctx.fillRect(x - FRAME_PX, y - FRAME_PX, tv.width + FRAME_PX * 2, tv.height + FRAME_PX * 2);
      ctx.restore();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - FRAME_PX + 1, y - FRAME_PX + 1, tv.width + FRAME_PX * 2 - 2, tv.height + FRAME_PX * 2 - 2);

      if (frame && crop) {
        ctx.globalAlpha = SCREEN_DIM;
        ctx.drawImage(frame, crop.sx, crop.sy, crop.sw, crop.sh, x, y, tv.width, tv.height);
        ctx.globalAlpha = 1;
      } else if (showAd) {
        this.drawAd(ctx, x, y, tv);
      } else {
        this.drawNoSignal(ctx, x, y, tv, color, now);
      }
    }
  }

  dispose(): void {
    if (!this.video) return;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
    this.video = undefined;
  }

  private drawChains(
    ctx: CanvasRenderingContext2D,
    tvs: readonly Tv[],
    offsetX: number,
    offsetY: number,
    viewWidth: number,
    viewHeight: number,
  ): void {
    ctx.fillStyle = CHAIN_COLOR;
    ctx.strokeStyle = CHAIN_COLOR;
    ctx.lineWidth = CHAIN_LINE_WIDTH_PX;
    for (const tv of tvs) {
      if (!areChainsVisible(tv, offsetX, offsetY, viewWidth, viewHeight)) continue;

      const top = Math.round(tv.chainTopY - offsetY);
      const bottom = Math.round(tv.y - FRAME_PX - offsetY);
      const links = visibleChainLinks(top, bottom, viewHeight);
      for (const chainX of chainXs(tv)) {
        const x = Math.round(chainX - offsetX);
        for (const { index, y } of links) {
          if (index % 2 === 0) {
            ctx.beginPath();
            ctx.ellipse(x, y + CHAIN_LINK_LENGTH_PX / 2, CHAIN_LINK_WIDTH_PX / 2, CHAIN_LINK_LENGTH_PX / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.fillRect(x - CHAIN_LINE_WIDTH_PX / 2, y, CHAIN_LINE_WIDTH_PX, CHAIN_LINK_LENGTH_PX);
          }
        }
      }
    }
  }

  private drawAd(ctx: CanvasRenderingContext2D, x: number, y: number, tv: Tv): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, tv.width, tv.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('YOUR AD HERE', x + tv.width / 2, y + tv.height / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  private drawNoSignal(ctx: CanvasRenderingContext2D, x: number, y: number, tv: Tv, color: string, now: number): void {
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(x, y, tv.width, tv.height);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(now / 300);
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO SIGNAL', x + tv.width / 2, y + tv.height / 2);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  /** Returns whether the ad card is showing. Decodes only while a TV is on screen, so off-screen TVs cost nothing. */
  private updateAdPhase(anyVisible: boolean, now: number): boolean {
    if (this.adUntil !== undefined) {
      if (now < this.adUntil) return true;
      // The ad is over: the video starts again from the beginning (only the very first play starts partway in).
      this.adUntil = undefined;
      if (this.video) this.video.currentTime = 0;
    }

    if (anyVisible) {
      const video = this.ensureVideo();
      if (video.paused && !this.failed) void video.play().catch(() => undefined);
    } else if (this.video && !this.video.paused) {
      this.video.pause();
    }
    return false;
  }

  private ensureVideo(): HTMLVideoElement {
    if (this.video) return this.video;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-hidden', 'true');
    // Kept in the DOM (but invisible) because some browsers won't keep decoding a detached video.
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0;';

    const supported = VIDEO_SOURCES.find((source) => video.canPlayType(source.type) !== '');
    if (supported) video.src = supported.src;
    else this.failed = true;
    // The first play starts partway in, as soon as the duration is known.
    video.addEventListener(
      'loadedmetadata',
      () => {
        video.currentTime = randomStartTime(video.duration);
      },
      { once: true },
    );
    video.addEventListener('ended', () => {
      this.adUntil = performance.now() + AD_DURATION_MS;
    });
    video.addEventListener('error', () => {
      this.failed = true;
    });

    document.body.appendChild(video);
    this.video = video;
    return video;
  }
}
