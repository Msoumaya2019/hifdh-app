// Design system - Colors
// Palette: vert profond, blanc cassé, beige, doré discret

export const colors = {
  // Vert profond - couleur principale
  primary: '#0B4D3B',
  primaryLight: '#1A6B52',
  primaryDark: '#063026',
  primarySurface: '#E8F0EC',

  // Blanc cassé - fonds
  background: '#FAF8F4',
  surface: '#FFFFFF',
  surfaceVariant: '#F5F2EC',

  // Beige - touches secondaires
  beige: '#E8DFD0',
  beigeLight: '#F0EBE0',
  beigeDark: '#D4C9B5',

  // Doré discret - accents
  gold: '#C4A35A',
  goldLight: '#D4B876',
  goldDark: '#A88842',

  // Texte
  textPrimary: '#1A1A1A',
  textSecondary: '#5C5C5C',
  textTertiary: '#8E8E8E',
  textOnPrimary: '#FFFFFF',
  textOnDark: '#FAF8F4',

  // États
  success: '#2E7D32',
  successLight: '#E8F5E9',
  warning: '#ED6C02',
  warningLight: '#FFF3E0',
  error: '#C62828',
  errorLight: '#FFEBEE',
  info: '#0277BD',
  infoLight: '#E1F5FE',

  // Bordures
  border: '#E0DDD7',
  borderLight: '#EFECE6',

  // Révisions - niveaux de maîtrise
  masteryPerfect: '#2E7D32',
  masteryGood: '#66BB6A',
  masteryHesitant: '#FFA726',
  masteryPoor: '#EF5350',
  masteryRelearn: '#C62828',

  // Graphe de progression
  chartPrimary: '#0B4D3B',
  chartSecondary: '#C4A35A',
  chartTertiary: '#1A6B52',
} as const;

export type Color = keyof typeof colors;
