export { colors, applyPalette, applyPaletteNommee, nomPaletteCourante } from './colors';
export type { Color, Palette } from './colors';
export {
  estNomPalette,
  estPaletteSombre,
  LIBELLES_PALETTES,
  ORDRE_PALETTES,
  PALETTES,
  PALETTE_PAR_DEFAUT,
} from './palettes';
export type { NomPalette } from './palettes';
export { CLE_THEME, lireThemeEnregistre, ThemeProvider, useColors, useTheme } from './ThemeProvider';
export type { Theme } from './ThemeProvider';
export { useStyles } from './styles';
export { fonts, fontSizes, fontWeights, lineHeights, radii, spacing } from './typography';
