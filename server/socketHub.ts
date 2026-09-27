import type { RawData, WebSocket } from 'ws';
import { Engine } from './engine';
import { getSprites, getTools } from './jsonGenerator';
import type { World } from './world';
import { Session } from './session';
import type { Cell } from './cell/cell';

const CONNECT_PARAM = 'connect';
const INACTIVE_PARAM = 'inactive';
const LOGIN_PARAM = 'login';
const JUMP_PARAM = 'jump';
const SPRITES_KEY = 'sprites';
const AVATARS_KEY = 'avatars';
const TOOLS_KEY = 'tools';
const IMAGE_PATHS_KEY = 'imagePaths';
const KEY_PARAM = 'key';
const DOWN_PARAM = 'down';
const TIMEOUT = 3000;

export class SocketHub {
  private login: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private inactivityCount = 0;

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
    });
  }

  private onTextMessage(data: Record<string, unknown>): void {
    if (CONNECT_PARAM in data) {
      this.handleLogin(data);
    } else {
      this.reactToKey(data);
    }
  }

  private handleLogin(data: Record<string, unknown>): void {
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
      const avatar = cell.addAvatarAtEntrance(this.login);
      if (!avatar) return;
      hardlines.set(this.login, new Session(avatar));
    } else if (session.unplugged() || jump) {
      cell = zion.getRandomEngine().getCell();
      const avatar = cell.addAvatarAtEntrance(this.login);
      if (!avatar) return;
      session.plugin(avatar);
    } else {
      cell = session.getAvatar()!.getCell();
    }

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
    if (!this.login) return;

    if (this.inactivityCount === TIMEOUT) {
      // TODO: inactivity count no longer handled client-side (kept from original Java implementation).
      if (this.timer) clearInterval(this.timer);
      this.send({ [CONNECT_PARAM]: INACTIVE_PARAM });
      return;
    }

    const session = this.world.getZion().getHardlines().get(this.login);
    const avatar = session?.getAvatar();
    if (!session || !avatar) return;

    const cell = avatar.getCell();
    const needsRefresh = this.world.getZion().stale(this.login);

    // Redraw-only frames are the sprite map itself (flat, unwrapped) — matches the original terse wire protocol.
    const json: Record<string, unknown> = needsRefresh
      ? this.getCellState(cell)
      : (getSprites(cell.getEngine().getRedrawSprites(), true, avatar) as Record<string, unknown>);

    this.send(json);

    if (needsRefresh) {
      this.world.getZion().loginNotStale(this.login);
    }

    this.inactivityCount++;
  }

  private getCellState(cell: Cell): Record<string, unknown> {
    const avatars: Record<string, number> = {};
    for (const avatarSession of this.world.getZion().getHardlines().values()) {
      const avatar = avatarSession.getAvatar();
      if (!avatarSession.unplugged() && avatar) {
        avatars[avatar.getName()] = avatar.getCellIndex();
      }
    }

    const sessionAvatar = this.login ? this.world.getZion().getHardlines().get(this.login)?.getAvatar() : undefined;

    return {
      [CONNECT_PARAM]: '0',
      [SPRITES_KEY]: getSprites(cell.getCellData().getSprites(), false, undefined),
      [AVATARS_KEY]: avatars,
      [TOOLS_KEY]: sessionAvatar ? getTools(sessionAvatar) : {},
      [IMAGE_PATHS_KEY]: cell.getCellData().getImagePaths(),
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
