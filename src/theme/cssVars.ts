import type { CSSProperties } from 'react';
import { colors } from '@/theme/colors';
import { radii, spacing } from '@/theme/spacing';

/** CSS custom properties sourced from the theme module so stylesheets do not drift. */
export const cssVars = {
  '--brand': colors.brandBlue,
  '--brand-pressed': colors.brandBlueDark,
  '--brand-ring': colors.brandBlueRing,
  '--white': colors.white,
  '--page': colors.zinc50,
  '--card': colors.white,
  '--border': colors.zinc100,
  '--hairline': colors.zinc200,
  '--zinc-300': colors.zinc300,
  '--faint': colors.zinc400,
  '--muted': colors.zinc500,
  '--zinc-600': colors.zinc600,
  '--text-secondary': colors.zinc800,
  '--text': colors.zinc900,
  '--error': colors.error,
  '--error-bg': colors.errorBg,
  '--error-border': colors.errorBorder,
  '--success': colors.success,
  '--online': colors.online,
  '--offline': colors.offline,
  '--warn': colors.warn,
  '--space-xs': `${spacing.xs}px`,
  '--space-sm': `${spacing.sm}px`,
  '--space-md': `${spacing.md}px`,
  '--space-lg': `${spacing.lg}px`,
  '--space-xl': `${spacing.xl}px`,
  '--space-xxl': `${spacing.xxl}px`,
  '--radius-md': `${radii.md}px`,
  '--radius-lg': `${radii.lg}px`,
  '--radius-xl': `${radii.xl}px`,
  '--radius-xxl': `${radii.xxl}px`,
} as CSSProperties;
