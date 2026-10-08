import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  webServer: [
    {
      command: 'npm run serve',
      url: 'http://localhost:8080',
      // The planet still flies by, but its pull on avatars/blocks would shove the deterministic movement specs around.
      env: { CELLWARZ_PLANET_PULL: 'off' },
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
