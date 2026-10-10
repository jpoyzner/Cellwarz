import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  webServer: [
    {
      command: 'npm run serve',
      url: 'http://localhost:8080',
      // The planet still flies by, but its pull on avatars/blocks would shove the deterministic movement specs around;
      // robots and the randomly scattered blocks are left out (only the fixed fixture blocks stay): they would
      // otherwise kill, shoot or shove test avatars at random.
      env: {
        CELLWARZ_PLANET_PULL: 'off',
        CELLWARZ_ROBOTS: 'off',
        CELLWARZ_RANDOM_BLOCKS: 'off',
        // Teleporting in uses the fixed spawn portals (not a random floor spot) so specs can rely on where avatars start.
        CELLWARZ_RANDOM_TELEPORT: 'off',
        // Debug recordings made by the specs stay out of the real ./recordings folder.
        CELLWARZ_RECORDINGS_DIR: 'test-results/recordings',
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run start -- --no-open',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: {
    baseURL: 'http://localhost:3000',
  },
});
