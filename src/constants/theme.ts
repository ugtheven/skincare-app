import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  text: '#0E1726',
  background: '#FFFFFF',
  backgroundElement: '#FCFDFE',
  backgroundSelected: '#EFF8FA',
  textSecondary: '#566575',
  tint: '#0A7C91',
  success: '#239B4B',
  sun: '#DF8500',
  separator: '#D8E1E8',
  tabBar: '#FFFFFF',
  imageOverlay: 'rgba(255, 255, 255, 0.62)',
} as const;

export type ThemeColor = keyof typeof Colors;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
