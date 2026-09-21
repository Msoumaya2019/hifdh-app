// Design system - Typography

import { Platform } from 'react-native';

// Tailles de police
export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 36,
} as const;

// Polices
export const fonts = {
  // Police arabe pour le Coran
  quran: 'AmiriQuran',
  araby: 'Amiri',
  arabyBold: 'Amiri-Bold',
  // Police latine pour l'interface
  regular: Platform.select({ ios: 'System', default: 'sans-serif' }),
  medium: Platform.select({ ios: 'System-Medium', default: 'sans-serif-medium' }),
  bold: Platform.select({ ios: 'System-Bold', default: 'sans-serif-bold' }),
} as const;

// Hauteurs de ligne
export const lineHeights = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
  quran: 2.0, // Espacement généreux pour le texte coranique
} as const;

// Poids de police
export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Rayons de bordure
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

// Espacements
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;
