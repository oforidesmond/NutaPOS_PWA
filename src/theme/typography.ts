import type { CSSProperties } from 'react';
import { colors } from '@/theme/colors';
import { fontFamilies, fontWeights } from '@/theme/fonts';

/** Legacy scale kept alongside `text`, matching the mobile theme module. */
export const typography = {
  title: {
    fontSize: 22,
    fontWeight: fontWeights.semiBold,
    color: colors.zinc900,
    fontFamily: fontFamilies.semiBold,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: fontWeights.semiBold,
    color: colors.zinc800,
    fontFamily: fontFamilies.semiBold,
  },
  body: {
    fontSize: 16,
    fontWeight: fontWeights.regular,
    color: colors.zinc700,
    fontFamily: fontFamilies.regular,
  },
  caption: {
    fontSize: 14,
    fontWeight: fontWeights.regular,
    color: colors.zinc500,
    fontFamily: fontFamilies.regular,
  },
  button: {
    fontSize: 16,
    fontWeight: fontWeights.semiBold,
    fontFamily: fontFamilies.semiBold,
  },
} as const satisfies Record<string, CSSProperties>;

/**
 * Apple-aligned type scale from the mobile `text` object.
 * Large title 32/38 through caption 12/16.
 */
export const text = {
  largeTitle: {
    fontSize: 32,
    lineHeight: '38px',
    fontFamily: fontFamilies.semiBold,
    fontWeight: fontWeights.semiBold,
    letterSpacing: -0.5,
    color: colors.zinc900,
  },
  title1: {
    fontSize: 28,
    lineHeight: '34px',
    fontFamily: fontFamilies.semiBold,
    fontWeight: fontWeights.semiBold,
    letterSpacing: -0.4,
    color: colors.zinc900,
  },
  title2: {
    fontSize: 22,
    lineHeight: '28px',
    fontFamily: fontFamilies.semiBold,
    fontWeight: fontWeights.semiBold,
    letterSpacing: -0.3,
    color: colors.zinc900,
  },
  headline: {
    fontSize: 17,
    lineHeight: '22px',
    fontFamily: fontFamilies.semiBold,
    fontWeight: fontWeights.semiBold,
    color: colors.zinc900,
  },
  body: {
    fontSize: 16,
    lineHeight: '22px',
    fontFamily: fontFamilies.regular,
    fontWeight: fontWeights.regular,
    color: colors.zinc800,
  },
  callout: {
    fontSize: 16,
    lineHeight: '21px',
    fontFamily: fontFamilies.regular,
    fontWeight: fontWeights.regular,
    color: colors.zinc500,
  },
  subheadline: {
    fontSize: 15,
    lineHeight: '20px',
    fontFamily: fontFamilies.regular,
    fontWeight: fontWeights.regular,
    color: colors.zinc800,
  },
  footnote: {
    fontSize: 13,
    lineHeight: '18px',
    fontFamily: fontFamilies.medium,
    fontWeight: fontWeights.medium,
    letterSpacing: 0.2,
    color: colors.zinc600,
  },
  caption: {
    fontSize: 12,
    lineHeight: '16px',
    fontFamily: fontFamilies.regular,
    fontWeight: fontWeights.regular,
    letterSpacing: 0.2,
    color: colors.zinc400,
  },
} as const satisfies Record<string, CSSProperties>;
