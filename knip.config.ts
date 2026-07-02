import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['scripts/*.ts'],
      project: ['scripts/**/*.{js,ts}'],
    },
    'packages/*': {
      entry: ['src/index.{js,ts}'],
      project: ['src/**/*.{js,ts}'],
    },
  },
  ignoreDependencies: ['bun-types'],
  ignoreBinaries: ['vite'],
};

export default config;
