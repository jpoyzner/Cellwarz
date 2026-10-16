import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// The game server the dev server proxies to (override to run a second copy beside a running one).
const apiPort = process.env.CELLWARZ_API_PORT ?? 8080;

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: './public/index.html',
  },
  source: {
    entry: { index: './src/index.tsx' },
  },
  output: {
    distPath: { root: 'dist' },
  },
  tools: {
    // /images/... is served by the Express server at runtime, not a bundled asset.
    cssLoader: {
      url: {
        filter: (url) => !url.startsWith('/'),
      },
    },
  },
  server: {
    port: 3000,
    // The game server serves /images and /videos straight from public/ (see server/web.ts), so the ~100 MB of videos must not
    // also be copied into dist/ (and from there into the Docker image).
    publicDir: { copyOnBuild: false },
    proxy: {
      '/socketrefresh': {
        target: `ws://localhost:${apiPort}`,
        ws: true,
      },
      '/images': {
        target: `http://localhost:${apiPort}`,
      },
      '/videos': {
        target: `http://localhost:${apiPort}`,
      },
    },
  },
});
