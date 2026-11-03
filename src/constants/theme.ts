export const colors = {
  ink: '#185e3c',          
  inkSoft: '#48685C',     
  orange: '#f9c462',       
  orangeDeep: '#E08E00',
  background: '#F6F8F3',  
  surface: '#FFFFFF',
  border: '#E6ECE4',
  inputBg: '#FBFCFA', 
  muted: '#8AA098',
  badgeBg: '#EDF3EA',
  white: '#FFFFFF',
  error: '#E5484D',
  black: '#000000',
  inkDeep: '#163A2E',
  inkDarker: '#0F2A21',
  inkMid: '#1F6443',
  orangeDark: '#9A6500',
  orangeText: '#533800',
  softGreen: '#E6F0EA',
  softGreenAlt: '#EEF5F0',
  neutral: '#D5DBD7',
  neutralSoft: '#F3F5F4',
  neutralMuted: '#9AA3A0',
  errorDark: '#8C2F20',
  errorBackground: '#FDECEC',
  errorBorder: '#E9B6B1',
  warning: '#8A5A00',
  warningBackground: '#FFF2C6',
  warningBorder: '#E7C761',
  success: '#16834B',
  successBright: '#2E9E66',
  successBackground: '#E8F7EE',
  busy: '#E5383B',
  busyHighlight: '#FF8A80',
  busySoft: '#FDECEA',
  offBackground: '#EEF0ED',
  offBorder: '#E0E4DF',
  freeBorder: '#E4EBE5',
  settingsAccent: '#6B4B00',
  overlay: '#163A2E',
  artSkin: '#F5C9A0',
  artHair: '#2A1B12',
  artSkinLight: '#EDB98E',
  artSkinHighlight: '#F6CFA8',
  artSkinShadow: '#E7A97F',
  artUniform: '#4A2C1A',
  artDark: '#2B2B2B',
  artDarkWarm: '#5A3A28',
  artRed: '#7A1F2B',
  artRedLight: '#E8737F',
  artRedSoft: '#F06E6E',
  artBlue: '#8ED1FF',
  artNeutral: '#E8ECEA',
  artNeutralLight: '#EDEDED',
} as const;

/** Build a translucent color from a theme token. */
export const withAlpha = (color: string, opacity: number): string => {
  const hex = color.replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value) || normalized.length !== 6) return color;
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, opacity))})`;
};

/** Blend two theme colors for small decorative gradients rendered as text. */
export const blendColors = (fromColor: string, toColor: string, amount: number): string => {
  const parse = (color: string) => {
    const hex = color.replace('#', '');
    const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
    const value = Number.parseInt(normalized, 16);
    return Number.isFinite(value) && normalized.length === 6
      ? [(value >> 16) & 255, (value >> 8) & 255, value & 255]
      : null;
  };
  const from = parse(fromColor);
  const to = parse(toColor);
  if (!from || !to) return fromColor;
  const t = Math.max(0, Math.min(1, amount));
  const rgb = from.map((channel, index) => Math.round(channel + (to[index] - channel) * t));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
};

export const gradients = {
  button: [colors.inkMid, colors.inkDeep] as const,
  buttonPressed: [colors.inkDeep, colors.inkDarker] as const,
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
    shadowColor: colors.inkDeep,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 6,
  },
  button: {
    shadowColor: colors.orange,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 6,
  },
  soft: {
    shadowColor: colors.inkDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;
