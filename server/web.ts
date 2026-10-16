import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { ServerConfig } from './config';
import type { World } from './world';

const DAY_SECONDS = 24 * 60 * 60;
const HASHED_ASSET_PATTERN = /\/static\//;

// The page loads only its own scripts, art, video and socket; nothing may frame it. (Styles are inline in places.)
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export interface WebOptions {
  root: string;
  config: ServerConfig;
  world: World;
  /** Sockets currently open (game and login-screen radar). */
  openConnections: () => number;
  startedAt?: number;
}

function securityHeaders(production: boolean) {
  return (_request: Request, response: Response, next: NextFunction): void => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    if (production) {
      response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  };
}

/**
 * The HTTP side: art, videos and the built client (with cache headers the CDN in front can use), plus `/healthz` for
 * monitoring and `/api/status` (player count) for the DJ Recognize site.
 */
export function createApp({ root, config, world, openConnections, startedAt = Date.now() }: WebOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders(config.production));

  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();

  app.get('/healthz', (_request, response) => {
    const zion = world.getZion();
    const step = zion.getMainRoom()?.getEngine().takeStepStats();
    response.setHeader('Cache-Control', 'no-store');
    response.json({
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      players: zion.connectedPlayers(),
      capacity: config.maxPlayers,
      connections: openConnections(),
      eventLoopDelayP99Ms: Math.round(loopDelay.percentile(99) / 1e4) / 100,
      stepAverageMs: step ? Math.round(step.averageMs * 100) / 100 : null,
      stepSlowestMs: step ? Math.round(step.slowestMs * 100) / 100 : null,
      stepBudgetMs: step ? Math.round(step.budgetMs * 100) / 100 : null,
      saving: config.dataDir !== undefined,
    });
    loopDelay.reset();
  });

  app.get('/api/status', (_request, response) => {
    const zion = world.getZion();
    const players = zion.connectedPlayers();
    if (config.statusOrigin) response.setHeader('Access-Control-Allow-Origin', config.statusOrigin);
    response.setHeader('Cache-Control', 'public, max-age=5');
    response.json({ name: 'Cyberstation', players, capacity: config.maxPlayers, full: players >= config.maxPlayers });
  });

  // In development (and the e2e run) nothing is cached, so edits to art show up at once.
  const cacheFor = (seconds: number) => (config.production ? { maxAge: seconds * 1000 } : { maxAge: 0 });

  // Art and videos come straight from public/ so a stale copy inside the built dist/ can't shadow edits.
  app.use('/images', express.static(path.join(root, 'public/images'), cacheFor(DAY_SECONDS / 24)));
  app.use('/videos', express.static(path.join(root, 'public/videos'), { ...cacheFor(DAY_SECONDS), acceptRanges: true }));
  app.use(
    express.static(path.join(root, 'dist'), {
      ...(config.production ? {} : { maxAge: 0 }),
      setHeaders: (response, filePath) => {
        if (!config.production) return;

        // Bundles under /static/ have the content hash in their name, so they never change; the page itself always revalidates.
        if (HASHED_ASSET_PATTERN.test(filePath)) response.setHeader('Cache-Control', `public, max-age=${365 * DAY_SECONDS}, immutable`);
        else response.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  return app;
}
