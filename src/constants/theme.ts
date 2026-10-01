// src/constants/theme.ts
// Tokens pulled from the actual Melone brand: warm off-white background,
// deep forest-green wordmark/text, orange as the ONLY accent/CTA color.

export const colors = {
  ink: '#1f6443',          // deep forest green — headings, wordmark
  inkSoft: '#48685C',      // secondary text on light bg
  orange: '#F2A71B',       // brand CTA color — used sparingly, high impact
  orangeDeep: '#E08E00',
  background: '#F6F8F3',   // warm sage-white page background
  surface: '#FFFFFF',
  border: '#E6ECE4',
  inputBg: '#FBFCFA',
  muted: '#8AA098',
  badgeBg: '#EDF3EA',
  white: '#FFFFFF',
  error: '#E5484D',
} as const;

export const gradients = {
  button: ['#1f6443', '#163A2E'] as const,
  buttonPressed: ['#163A2E', '#0F2A21'] as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  full: 999,
} as const;

export const shadow = {
  card: {
    shadowColor: '#163A2E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 6,
  },
  button: {
    shadowColor: '#F2A71B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 6,
  },
  soft: {
    shadowColor: '#163A2E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;