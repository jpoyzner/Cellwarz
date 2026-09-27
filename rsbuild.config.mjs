import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

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
    proxy: {
      '/socketrefresh': {
        target: 'ws://localhost:8080',
        ws: true,
      },
      '/images': {
        target: 'http://localhost:8080',
      },
    },
  },
});
