// Using @storybook/experimental-nextjs-vite for Vite-native HMR speed in the monorepo.
// Track for graduation to @storybook/nextjs (stable) in Storybook 9.x.
import type { StorybookConfig } from '@storybook/experimental-nextjs-vite'

const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/experimental-nextjs-vite',
    options: {},
  },
}

export default config
