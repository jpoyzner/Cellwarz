import type { RawData, WebSocket } from 'ws';
import type { Engine } from './engine';
import { getSprites } from './jsonGenerator';
import type { World } from './world';
import { parseLook } from './look';
import { Session } from './session';
import type { SessionOwner } from './session';
import type { Cell } from './cell/cell';
import { dumpSprites } from './blackBoxDump';
import type { DumpedSprite } from './blackBoxDump';
import { saveLatestBlackBox } from './blackBoxStore';
import { topScores } from './leaderboard';
import { checkCallsign } from './callsign';
import { defaultConfig } from './config';
import type { ServerConfig } from './config';
import { LoginThrottle } from './loginThrottle';
import { TokenBucket } from './rateLimit';

const CONNECT_PARAM = 'connect';
const INACTIVE_PARAM = 'inactive';
const LOGIN_PARAM = 'login';
const HASH_PARAM = 'hash';
const DENIED_PARAM = 'denied';
const DISPLACED_PARAM = 'displaced';
// Why a login was turned away (the client shows a notice for each).
const FULL_PARAM = 'full';
const INVALID_PARAM = 'invalid';
const RESERVED_PARAM = 'reserved';
const THROTTLED_PARAM = 'throttled';
const BLACK_BOX_ENABLED_KEY = 'blackBox';
// Sanity cap on a login hash; the client's field is capped far lower.
const MAX_HASH_LENGTH = 128;
const JUMP_PARAM = 'jump';
const SPECTATE_PARAM = 'spectate';
const HEADBAND_PARAM = 'headband';
const BELT_PARAM = 'belt';
const LOOKS_KEY = 'looks';
const SPRITES_KEY = 'sprites';
const AVATARS_KEY = 'avatars';
const IMAGE_PATHS_KEY = 'imagePaths';
const BACKGROUND_KEY = 'background';
const KEY_PARAM = 'key';
const DOWN_PARAM = 'down';
const DIED_PARAM = 'died';
const SCORED_PARAM = 'scored';
const BLACK_BOX_PARAM = 'blackBox';
const BLACK_BOX_STARTED_PARAM = 'blackBoxStarted';
const SCORE_KEY = 'score';
const DIAMONDS_KEY = 'diamonds';
const PLANET_KEY = 'planet';
const LEADERBOARD_KEY = 'leaderboard';
const LEADERBOARD_POLL_MS = 1000;
// Clients extrapolate the planet from its velocity, so a periodic resync only has to correct small drift.
const PLANET_RESYNC_MS = 2000;
// Sanity cap on one report; a client reports a few blocks at a time (Session.claimBlocks also rate-limits them).
const MAX_BLOCKS_PER_REPORT = 100;
// Each connection may send a burst of messages, then this many per second (key presses are the bulk of it); a client that
// keeps flooding anyway is hung up on.
const MESSAGE_BURST = 120;
const MESSAGES_PER_SECOND = 80;
const MAX_DROPPED_MESSAGES = 600;
const TIMEOUT = 3000;
// How often a connection checks whether the engine has stepped (frames go out within this of each step).
const RENDER_POLL_MS = 4;

/** What a connection knows about where it came from and the rules it runs under (unit tests use the permissive defaults). */
export interface HubOptions {
  config: ServerConfig;
  /** The client's network address, for throttling wrong-hash guesses. */
  address: string;
  loginThrottle: LoginThrottle;
}

// Every connection streaming the same engine step needs the very same redraw frame, so it is serialized once per step
// and shared (with dozens of players this is most of the server's work).
let frameCache: { engine: Engine; since: number; step: number; text: string } | undefined;

export class SocketHub implements SessionOwner {
  private login: string | undefined;
  /** The room this connection last rendered, so a dead player's spectating keeps streaming it. */
  private cell: Cell | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inactivityCount = 0;
  /** The engine step whose changes this connection has sent up to (so each step's redraws go out exactly once). */
  private sentStep: { engine: Engine; step: number } | undefined;
  private diedNotified = false;
  private blackBoxStartDump: DumpedSprite[] | undefined;
  private sentPlanetId: number | undefined;
  private sentPlanetAt = 0;
  private sentDiamonds = 0;
  private sentLooksRevision = Session.looksRevision;
  private sentLeaderboard = '';
  private leaderboardCheckedAt = 0;
  /** A login-screen connection that only watches the main room (for the radar); it has no avatar or session. */
  private spectating = false;
  /** A newer login took this connection's session over (or it was refused); nothing it sends counts any more. */
  private dropped = false;
  private readonly messageBucket = new TokenBucket(MESSAGE_BURST, MESSAGES_PER_SECOND);
  private droppedMessages = 0;

  constructor(
    private readonly world: World,
    private readonly socket: WebSocket,
    private readonly options: HubOptions = { config: defaultConfig(), address: 'local', loginThrottle: new LoginThrottle() },
  ) {
    socket.on('message', (data: RawData) => {
      if (!this.messageBucket.take()) {
        if (++this.droppedMessages > MAX_DROPPED_MESSAGES) this.socket.close(1008, 'too many messages');
        return;
      }

      try {
        const message: unknown = JSON.parse(data.toString());
        if (typeof message === 'object' && message !== null && !Array.isArray(message)) {
          this.onTextMessage(message as Record<string, unknown>);
        }
      } catch (e) {
        console.error(e);
      }
    });

    socket.on('close', () => {
      if (this.timer) clearInterval(this.timer);
      if (this.login) this.world.getZion().getHardlines().get(this.login)?.detach(this);
    });
  }

  /** Called when a newer login takes this connection's session over: tell the client, then hang up. */
  drop(): void {
    this.cutOff(DISPLACED_PARAM);
  }

  private cutOff(reason: string): void {
    this.dropped = true;
    if (this.timer) clearInterval(this.timer);
    this.send({ [CONNECT_PARAM]: reason });
    this.socket.close();
  }

  private onTextMessage(data: Record<string, unknown>): void {
    if (this.dropped) return;
    if (CONNECT_PARAM in data) {
      if (data[SPECTATE_PARAM]) this.handleSpectate();
      else this.handleLogin(data);
    } else if (SCORED_PARAM in data) {
      this.handleScored(data);
    } else if (BLACK_BOX_STARTED_PARAM in data) {
      this.handleBlackBoxStarted();
    } else if (BLACK_BOX_PARAM in data) {
      this.handleBlackBox(data);
    } else {
      this.reactToKey(data);
    }
  }

  // The block-break itself is a client-side cosmetic, so the client reports how many blocks reached its score.
  private handleScored(data: Record<string, unknown>): void {
    if (!this.login) return;
    const session = this.world.getZion().getHardlines().get(this.login);
    const blocks = Math.floor(Number(data[SCORED_PARAM]));
    if (!session || !Number.isFinite(blocks) || blocks <= 0) return;

    session.claimBlocks(Math.min(blocks, MAX_BLOCKS_PER_REPORT));
  }

  // The player's room as the server sees it: every sprite's real class, size, mass and motion, which the client's terse wire
  // format doesn't carry.
  private dumpBlackBoxSprites(): DumpedSprite[] | undefined {
    const session = this.login ? this.world.getZion().getHardlines().get(this.login) : undefined;
    const cell = (session?.getAvatar() ?? session?.getRobotBody())?.getCell() ?? this.cell;
    return cell ? dumpSprites(cell) : undefined;
  }

  // The client pressed backtick: capture the server-side starting state to pair with the one it sends when it finishes.
  private handleBlackBoxStarted(): void {
    if (!this.login || !this.options.config.blackBoxEnabled) return;
    this.blackBoxStartDump = this.dumpBlackBoxSprites();
  }

  // A player's Black Box (backtick key) plus the server-side sprite dumps from its start and end; only the latest is kept
  // on disk, see blackBoxStore.ts.
  private handleBlackBox(data: Record<string, unknown>): void {
    if (!this.login || !this.options.config.blackBoxEnabled) return;
    const blackBox = data[BLACK_BOX_PARAM];
    const server = { startSprites: this.blackBoxStartDump, endSprites: this.dumpBlackBoxSprites() };
    this.blackBoxStartDump = undefined;
    const withServerState = typeof blackBox === 'object' && blackBox !== null ? { ...blackBox, server } : blackBox;
    saveLatestBlackBox(withServerState).catch((e) => console.error(e));
  }

  private handleSpectate(): void {
    this.spectating = true;
    this.cell = this.world.getZion().getRandomEngine().getCell();
    this.send(this.getCellState(this.cell));
    this.sendLeaderboardIfChanged(true);
    this.startRendering();
  }

  private handleLogin(data: Record<string, unknown>): void {
    this.spectating = false;
    let jump = false;
    const zion = this.world.getZion();
    const hardlines = zion.getHardlines();
    const hash = typeof data[HASH_PARAM] === 'string' ? (data[HASH_PARAM] as string).slice(0, MAX_HASH_LENGTH) : '';
    if (this.login === undefined) {
      const { config, address, loginThrottle } = this.options;
      const rawLogin = data[LOGIN_PARAM];
      const check = checkCallsign(rawLogin, config.reservedNames, typeof rawLogin === 'string' && hardlines.has(rawLogin));
      if (!check.ok) {
        this.cutOff(check.reason === 'reserved' ? RESERVED_PARAM : INVALID_PARAM);
        return;
      }

      const login = check.login;
      if (loginThrottle.blockedFor(address, login) > 0) {
        this.cutOff(THROTTLED_PARAM);
        return;
      }

      const existing = hardlines.get(login);
      if (existing && !existing.acceptsPassword(hash)) {
        loginThrottle.recordFailure(address, login);
        this.cutOff(DENIED_PARAM);
        return;
      }
      if (zion.isFull(login)) {
        this.cutOff(FULL_PARAM);
        return;
      }

      if (existing) loginThrottle.recordSuccess(address, login);
      existing?.protect(hash); // the first hash an unprotected callsign is used with becomes its permanent one.
      this.login = login;
      jump = Boolean(data[JUMP_PARAM]);
    }

    const session = hardlines.get(this.login);
    let cell: Cell;

    if (!session) {
      cell = zion.getRandomEngine().getCell();
      const avatar = cell.addAvatarAtRandomFloor(this.login);
      if (!avatar) return;
      const created = new Session(avatar);
      created.protect(hash);
      zion.addSession(this.login, created);
    } else if (session.unplugged() || jump) {
      cell = zion.getRandomEngine().getCell();
      const avatar = cell.addAvatarAtRandomFloor(this.login);
      if (!avatar) return;
      session.plugin(avatar);
      this.diedNotified = false;
    } else {
      cell = session.getAvatar()!.getCell();
    }

    const loggedIn = hardlines.get(this.login)!;
    // A connect message states the player's colours outright (none = default); a key press that revives an idle one doesn't.
    if (CONNECT_PARAM in data) loggedIn.setLook(parseLook(data[HEADBAND_PARAM], data[BELT_PARAM]));
    loggedIn.attach(this);
    this.cell = cell;
    this.send(this.getCellState(cell));

    this.world.getZion().loginNotStale(this.login);

    this.startRendering();
  }

  private startRendering(): void {
    this.inactivityCount = 0;

    if (this.timer) {
      clearInterval(this.timer);
    }

    // Polls often but only sends when the simulation has stepped: frames then go out right after each step instead of on a
    // second 48 FPS timer drifting against the engine's (which made avatars on moving blocks advance at uneven intervals).
    let renderedStep: number | undefined;
    this.timer = setInterval(() => {
      try {
        const engine = (this.cell ?? this.world.getZion().getRandomEngine().getCell()).getEngine();
        if (engine.getStepCount() === renderedStep) return;
        renderedStep = engine.getStepCount();
        this.renderClient();
      } catch (e) {
        console.error(e);
        if (this.timer) clearInterval(this.timer);
        this.socket.close();
      }
    }, RENDER_POLL_MS);
  }

  /** The sprites that changed in the engine's steps since this connection's last frame, serialized (and shared with connections at the same step). */
  private takeRedrawFrame(cell: Cell): string {
    const engine = cell.getEngine();
    const step = engine.getStepCount();
    const since = this.sentStep?.engine === engine ? this.sentStep.step : step - 1;
    this.sentStep = { engine, step };

    if (frameCache?.engine === engine && frameCache.since === since && frameCache.step === step) return frameCache.text;

    const text = JSON.stringify(getSprites(engine.getRedrawSpritesSince(since), true));
    frameCache = { engine, since, step, text };
    return text;
  }

  renderClient(): void {
    if (this.dropped) return;
    if (this.spectating) {
      this.renderSpectator();
      return;
    }
    if (!this.login) return;

    if (this.inactivityCount === TIMEOUT) {
      // TODO: inactivity count no longer handled client-side (kept from original Java implementation).
      if (this.timer) clearInterval(this.timer);
      this.send({ [CONNECT_PARAM]: INACTIVE_PARAM });
      return;
    }

    const session = this.world.getZion().getHardlines().get(this.login);
    if (!session) return;

    const avatar = session.getAvatar();
    // A player a robot touched lives on as a robot; their connection keeps rendering the world through it.
    const watched = avatar ?? session.getRobotBody();
    if (watched) this.cell = watched.getCell();
    const cell = this.cell ?? this.world.getZion().getRandomEngine().getCell();

    // A dead player keeps receiving the world (they spectate until they press Escape): tell their client once so it can
    // react, then send a full refresh (their own sprite is gone, and `following` names their robot body if they have one).
    if (!avatar && !this.diedNotified) {
      this.diedNotified = true;
      this.send({ [DIED_PARAM]: true, ...(session.getDeathCause() && { cause: session.getDeathCause() }) });
      this.send(this.getCellState(cell));
    }
    this.sendPlanetIfDue(cell);
    this.sendDiamondsIfChanged(session.getDiamonds());
    this.sendLooksIfChanged();
    const needsRefresh = this.world.getZion().stale(this.login);

    // Redraw-only frames are the sprite map itself (flat, unwrapped) — matches the original terse wire protocol.
    if (needsRefresh) this.send(this.getCellState(cell));
    else this.sendText(this.takeRedrawFrame(cell));

    if (needsRefresh) {
      this.world.getZion().loginNotStale(this.login);
    }

    this.inactivityCount++;
  }

  // Radar-only: the room's frames and planet (plus the leaderboard), with no avatar, score or inactivity cut-off.
  private renderSpectator(): void {
    const cell = this.cell;
    if (!cell) return;

    this.sendPlanetIfDue(cell);
    this.sendLeaderboardIfChanged();
    this.sendText(this.takeRedrawFrame(cell));
  }

  // The login screen's top Disco-shard collectors: a one-shot message (not in the flat redraw frames), re-checked about once a second.
  private sendLeaderboardIfChanged(force = false): void {
    const now = Date.now();
    if (!force && now - this.leaderboardCheckedAt < LEADERBOARD_POLL_MS) return;

    this.leaderboardCheckedAt = now;
    const leaderboard = topScores(this.world.getZion().getHardlines());
    const serialized = JSON.stringify(leaderboard);
    if (serialized === this.sentLeaderboard && !force) return;

    this.sentLeaderboard = serialized;
    this.send({ [LEADERBOARD_KEY]: leaderboard });
  }

  // Everyone's colours ride a one-shot message (not the flat redraw frames) and only when somebody's changed.
  private sendLooksIfChanged(): void {
    if (Session.looksRevision === this.sentLooksRevision) return;

    this.sentLooksRevision = Session.looksRevision;
    this.send({ [LOOKS_KEY]: this.getLooks() });
  }

  private getLooks(): Record<string, [string, string]> {
    const looks: Record<string, [string, string]> = {};
    for (const [name, session] of this.world.getZion().getHardlines()) {
      const look = session.getLook();
      if (look) looks[name] = [look.headband, look.belt];
    }
    return looks;
  }

  // A separate one-shot message (like the planet's) so the terse sprite-map wire format stays intact.
  private sendDiamondsIfChanged(diamonds: number): void {
    if (diamonds === this.sentDiamonds) return;

    this.sentDiamonds = diamonds;
    this.send({ [DIAMONDS_KEY]: diamonds });
  }

  private sendPlanetIfDue(cell: Cell): void {
    const planet = cell.getPlanet();
    if (!planet) {
      // The planet has left for its break: tell the client once so it drops it.
      if (this.sentPlanetId !== undefined) {
        this.send({ [PLANET_KEY]: null });
        this.sentPlanetId = undefined;
      }
      return;
    }

    if (planet.id !== this.sentPlanetId || Date.now() - this.sentPlanetAt >= PLANET_RESYNC_MS) {
      this.send({ [PLANET_KEY]: planet });
      this.markPlanetSent(planet.id);
    }
  }

  private markPlanetSent(planetId: number): void {
    this.sentPlanetId = planetId;
    this.sentPlanetAt = Date.now();
  }

  private getCellState(cell: Cell): Record<string, unknown> {
    const avatars: Record<string, number> = {};
    for (const avatarSession of this.world.getZion().getHardlines().values()) {
      const avatar = avatarSession.getAvatar();
      if (!avatarSession.unplugged() && avatar) {
        avatars[avatar.getName()] = avatar.getCellIndex();
      }
    }

    const session = this.login ? this.world.getZion().getHardlines().get(this.login) : undefined;
    const sessionAvatar = session?.getAvatar();
    const robotBody = sessionAvatar ? undefined : session?.getRobotBody();
    const score = session?.getScore() ?? 0;
    const diamonds = session?.getDiamonds() ?? 0;
    this.sentDiamonds = diamonds;
    this.sentLooksRevision = Session.looksRevision;

    const planet = cell.getPlanet();
    if (planet) this.markPlanetSent(planet.id);
    else this.sentPlanetId = undefined;

    return {
      [CONNECT_PARAM]: '0',
      [BLACK_BOX_ENABLED_KEY]: this.options.config.blackBoxEnabled,
      [SPRITES_KEY]: getSprites(cell.getCellData().getSprites(), false),
      [AVATARS_KEY]: avatars,
      [IMAGE_PATHS_KEY]: cell.getCellData().getImagePaths(),
      [BACKGROUND_KEY]: cell.getBackground(),
      worldWidth: cell.getMinCellWidth(),
      worldHeight: cell.getMinCellHeight(),
      following: robotBody?.getCellIndex() ?? null,
      lamps: cell.getLamps(),
      vines: cell.getVines() ?? null,
      tvs: cell.getTvs(),
      [PLANET_KEY]: planet ?? null,
      [SCORE_KEY]: score,
      [DIAMONDS_KEY]: diamonds,
      [LOOKS_KEY]: this.getLooks(),
    };
  }

  private reactToKey(data: Record<string, unknown>): void {
    if (!this.login) return;
    const session = this.world.getZion().getHardlines().get(this.login);
    if (!session) return;

    const key = data[KEY_PARAM];
    if (typeof key !== 'number') return;

    session.getUI().reactTo(key, Boolean(data[DOWN_PARAM]));

    if (this.inactivityCount === TIMEOUT) {
      this.handleLogin(data);
    }

    this.inactivityCount = 0;
  }

  private send(payload: unknown): void {
    this.sendText(JSON.stringify(payload));
  }

  private sendText(text: string): void {
    if (this.socket.readyState === this.socket.OPEN) {
      this.socket.send(text);
    }
  }
}
