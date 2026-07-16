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
  tabBarGlassTint: 'rgba(248, 253, 254, 0.82)',
  imageOverlay: 'rgba(255, 255, 255, 0.62)',
  cameraBackground: '#000000',
  cameraScrim: 'rgba(0, 0, 0, 0.42)',
  cameraScrimLight: 'rgba(0, 0, 0, 0.34)',
  cameraOverlayStrong: 'rgba(0, 0, 0, 0.55)',
  onTint: '#FFFFFF',
  error: '#B42318',
} as const;

/**
 * Palette réservée aux parcours Aujourd'hui et Routines.
 * Elle reste volontairement locale pour ne pas modifier le rendu du Scan.
 */
export const RoutineColors = {
  text: '#142329',
  background: '#FCFDFD',
  backgroundElement: '#FFFFFF',
  backgroundSelected: '#EDF5F5',
  textSecondary: '#607178',
  controlBorder: '#7B8D92',
  tint: '#075B66',
  tintPressed: '#04454E',
  success: '#287A55',
  sun: '#C77822',
  separator: '#CBD9DC',
  onTint: '#FFFFFF',
  error: '#B42318',
} as const;

export const RoutineMotion = {
  quick: 140,
  state: 180,
  content: 220,
  dragActivation: 400,
} as const;

export const NavigationMotion = {
  press: 100,
  selection: 220,
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
