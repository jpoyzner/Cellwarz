import { defineConfig } from '@playwright/test';

// Set these to run the suite beside a dev server that is already using the default ports.
const apiPort = process.env.CELLWARZ_API_PORT ?? '8080';
const webPort = process.env.CELLWARZ_WEB_PORT ?? '3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  webServer: [
    {
      command: 'npm run serve',
      // /healthz answers as soon as the server is up (the home page needs a client build, which the browser tests don't).
      url: `http://localhost:${apiPort}/healthz`,
      // The planet still flies by, but its pull on avatars/blocks would shove the deterministic movement specs around;
      // robots and the randomly scattered blocks are left out (only the fixed fixture blocks stay): they would
      // otherwise kill, shoot or shove test avatars at random.
      env: {
        PORT: apiPort,
        CELLWARZ_PLANET_PULL: 'off',
        CELLWARZ_ROBOTS: 'off',
        CELLWARZ_RANDOM_BLOCKS: 'off',
        // Teleporting in uses the fixed spawn portals (not a random floor spot) so specs can rely on where avatars start.
        CELLWARZ_RANDOM_TELEPORT: 'off',
        // Every spec connects from this one machine, so the per-visitor limits (sockets, wrong-hash tries) are lifted.
        CELLWARZ_MAX_PLAYERS: '500',
        CELLWARZ_MAX_CONNECTIONS: '2000',
        CELLWARZ_MAX_CONNECTIONS_PER_IP: '1000',
        CELLWARZ_LOGIN_FAILURES_PER_ADDRESS: '100000',
        CELLWARZ_LOGIN_FAILURES_PER_CALLSIGN: '100000',
        // Black Boxes made by the specs stay out of the real ./black-box folder.
        CELLWARZ_BLACK_BOX_DIR: 'test-results/black-box',
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run start -- --no-open --port ${webPort}`,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: {
    baseURL: `http://localhost:${webPort}`,
  },
});
