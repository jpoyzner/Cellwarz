import type { RawData, WebSocket } from 'ws';
import { Engine } from './engine';
import { getSprites } from './jsonGenerator';
import type { World } from './world';
import { parseLook } from './look';
import { Session } from './session';
import type { Cell } from './cell/cell';
import { saveLatestRecording } from './recordingStore';

const CONNECT_PARAM = 'connect';
const INACTIVE_PARAM = 'inactive';
const LOGIN_PARAM = 'login';
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
const RECORDING_PARAM = 'recording';
const SCORE_KEY = 'score';
const DIAMONDS_KEY = 'diamonds';
const PLANET_KEY = 'planet';
// Clients extrapolate the planet from its velocity, so a periodic resync only has to correct small drift.
const PLANET_RESYNC_MS = 2000;
// Sanity cap on one report; a client reports a few blocks at a time.
const MAX_BLOCKS_PER_REPORT = 100;
const TIMEOUT = 3000;

export class SocketHub {
  private login: string | undefined;
  /** The room this connection last rendered, so a dead player's spectating keeps streaming it. */
  private cell: Cell | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inactivityCount = 0;
  private diedNotified = false;
  private sentPlanetId: number | undefined;
  private sentPlanetAt = 0;
  private sentDiamonds = 0;
  private sentLooksRevision = Session.looksRevision;
  /** A login-screen connection that only watches the main room (for the radar); it has no avatar or session. */
  private spectating = false;

  constructor(
    private readonly world: World,
    private readonly socket: WebSocket,
  ) {
    socket.on('message', (data: RawData) => {
      try {
        this.onTextMessage(JSON.parse(data.toString()));
      } catch (e) {
        console.error(e);
      }
    });

    socket.on('close', () => {
      if (this.timer) clearInterval(this.timer);
      if (this.login) this.world.getZion().getHardlines().get(this.login)?.detach(this);
    });
  }

  private onTextMessage(data: Record<string, unknown>): void {
    if (CONNECT_PARAM in data) {
      if (data[SPECTATE_PARAM]) this.handleSpectate();
      else this.handleLogin(data);
    } else if (SCORED_PARAM in data) {
      this.handleScored(data);
    } else if (RECORDING_PARAM in data) {
      this.handleRecording(data);
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

    session.addBlocks(Math.min(blocks, MAX_BLOCKS_PER_REPORT));
  }

  // A player's debug recording (backtick key); only the latest is kept on disk, see recordingStore.ts.
  private handleRecording(data: Record<string, unknown>): void {
    if (!this.login) return;
    saveLatestRecording(data[RECORDING_PARAM]).catch((e) => console.error(e));
  }

  private handleSpectate(): void {
    this.spectating = true;
    this.cell = this.world.getZion().getRandomEngine().getCell();
    this.send(this.getCellState(this.cell));
    this.startRendering();
  }

  private handleLogin(data: Record<string, unknown>): void {
    this.spectating = false;
    let jump = false;
    if (this.login === undefined) {
      this.login = data[LOGIN_PARAM] as string;
      jump = Boolean(data[JUMP_PARAM]);
    }

    const zion = this.world.getZion();
    const hardlines = zion.getHardlines();
    const session = hardlines.get(this.login);
    let cell: Cell;

    if (!session) {
      cell = zion.getRandomEngine().getCell();
      const avatar = cell.addAvatarAtRandomFloor(this.login);
      if (!avatar) return;
      hardlines.set(this.login, new Session(avatar));
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

    this.timer = setInterval(() => {
      try {
        this.renderClient();
      } catch (e) {
        console.error(e);
        if (this.timer) clearInterval(this.timer);
        this.socket.close();
      }
    }, 1000 / Engine.ENGINE_FRAMES_PER_SECOND);
  }

  renderClient(): void {
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
      this.send({ [DIED_PARAM]: true });
      this.send(this.getCellState(cell));
    }
    this.sendPlanetIfDue(cell);
    this.sendDiamondsIfChanged(session.getDiamonds());
    this.sendLooksIfChanged();
    const needsRefresh = this.world.getZion().stale(this.login);

    // Redraw-only frames are the sprite map itself (flat, unwrapped) — matches the original terse wire protocol.
    const json: Record<string, unknown> = needsRefresh
      ? this.getCellState(cell)
      : (getSprites(cell.getEngine().getRedrawSprites(), true) as Record<string, unknown>);

    this.send(json);

    if (needsRefresh) {
      this.world.getZion().loginNotStale(this.login);
    }

    this.inactivityCount++;
  }

  // Radar-only: the room's frames and planet, with no avatar, score or inactivity cut-off.
  private renderSpectator(): void {
    const cell = this.cell;
    if (!cell) return;

    this.sendPlanetIfDue(cell);
    this.send(getSprites(cell.getEngine().getRedrawSprites(), true));
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
    if (!planet) return;

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

    return {
      [CONNECT_PARAM]: '0',
      [SPRITES_KEY]: getSprites(cell.getCellData().getSprites(), false),
      [AVATARS_KEY]: avatars,
      [IMAGE_PATHS_KEY]: cell.getCellData().getImagePaths(),
      [BACKGROUND_KEY]: cell.getBackground(),
      worldWidth: cell.getMinCellWidth(),
      worldHeight: cell.getMinCellHeight(),
      following: robotBody?.getCellIndex() ?? null,
      lamps: cell.getLamps(),
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

    const key = data[KEY_PARAM] as number;
    session.getUI().reactTo(key, Boolean(data[DOWN_PARAM]));

    if (this.inactivityCount === TIMEOUT) {
      this.handleLogin(data);
    }

    this.inactivityCount = 0;
  }

  private send(payload: unknown): void {
    if (this.socket.readyState === this.socket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }
}
