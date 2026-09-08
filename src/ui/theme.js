/**
 * Design tokens, borrowed straight from iOS.
 *
 * The app is used almost exclusively as an installed app on an iPhone, so looking
 * like the rest of the phone is the cheapest way to look trustworthy — and a
 * participant who trusts the app argues with it less. Values here are Apple's own
 * (system colours, the SF type scale, 44pt touch targets), not approximations.
 *
 * One accent colour, one font, four text colours. Every screen composes from
 * these; nothing invents its own palette.
 */

// San Francisco is already on the device. Loading a webfont to look like iOS is
// both slower and less convincing than just asking for the system face.
export const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

export const C = {
  // Text, in Apple's four levels of emphasis.
  label: '#000000',
  secondary: 'rgba(60,60,67,0.60)',
  tertiary: 'rgba(60,60,67,0.30)',
  inverse: '#FFFFFF',

  // Surfaces. Grouped content sits on grey, cards are white.
  bg: '#FFFFFF',
  grouped: '#F2F2F7',
  card: '#FFFFFF',
  fill: 'rgba(120,120,128,0.12)',
  fillStrong: 'rgba(120,120,128,0.20)',

  separator: 'rgba(60,60,67,0.18)',
  separatorOpaque: '#C6C6C8',

  // System colours. Blue is the only accent; the rest carry meaning only.
  accent: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',

  // On-camera chrome for the trial screen.
  scrim: 'rgba(0,0,0,0.55)',
  onDark: '#FFFFFF',
  onDarkSecondary: 'rgba(255,255,255,0.65)',
};

/** The SF type scale, as used by iOS. Each entry is ready to spread into style. */
export const T = {
  largeTitle: { fontSize: 34, fontWeight: 700, letterSpacing: '0.012em', lineHeight: 1.2 },
  title1: { fontSize: 28, fontWeight: 700, letterSpacing: '0.008em', lineHeight: 1.2 },
  title2: { fontSize: 22, fontWeight: 700, letterSpacing: '0.004em', lineHeight: 1.25 },
  title3: { fontSize: 20, fontWeight: 600, lineHeight: 1.3 },
  headline: { fontSize: 17, fontWeight: 600, lineHeight: 1.35 },
  body: { fontSize: 17, fontWeight: 400, lineHeight: 1.45 },
  callout: { fontSize: 16, fontWeight: 400, lineHeight: 1.4 },
  subhead: { fontSize: 15, fontWeight: 400, lineHeight: 1.4 },
  footnote: { fontSize: 13, fontWeight: 400, lineHeight: 1.35 },
  caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.3 },
};

export const R = { control: 12, card: 12, sheet: 22, pill: 999 };

// 16pt gutters, 44pt minimum touch target — both straight out of the HIG.
export const SP = { gutter: 16, gap: 12, tap: 44 };

/**
 * Safe-area helpers. The app runs with viewport-fit=cover and a translucent
 * status bar so the camera can reach the screen edges on the trial screen; the
 * cost is that EVERY other screen has to add the insets back itself, or its
 * content slides up under the Dynamic Island.
 */
export const SAFE = {
  top: 'env(safe-area-inset-top, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
};
