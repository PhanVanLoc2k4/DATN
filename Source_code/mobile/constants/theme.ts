/**
 * Security Monitoring Premium Theme
 */

import { Platform } from 'react-native';

const tintColorLight = '#3B82F6';
const tintColorDark = '#60A5FA';

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F8FAFC',
    tint: tintColorLight,
    icon: '#64748B',
    tabIconDefault: '#94A3B8',
    tabIconSelected: tintColorLight,
    card: '#FFFFFF',
    border: '#E2E8F0',
    danger: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
  },
  dark: {
    text: '#F1F5F9',
    background: '#0F172A', // Slate 900
    tint: tintColorDark,
    icon: '#94A3B8',
    tabIconDefault: '#475569',
    tabIconSelected: tintColorDark,
    card: '#1E293B', // Slate 800
    border: 'rgba(255, 255, 255, 0.1)',
    danger: '#F87171',
    success: '#34D399',
    warning: '#FBBF24',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    serif: 'Georgia',
    rounded: 'System',
    mono: 'Courier',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});
