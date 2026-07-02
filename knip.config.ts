import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    'packages/*': {
      entry: ['src/index.{js,ts}'],
      project: ['src/**/*.{js,ts}'],
    },
  },
  ignoreDependencies: ['lint-staged'],
};

export default config;
