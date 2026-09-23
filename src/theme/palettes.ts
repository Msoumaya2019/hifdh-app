// Les quatre palettes de l'application.
//
// POURQUOI UN TYPE `Palette` ÉCRIT À LA MAIN, ET NON DÉDUIT DE LA PALETTE VERTE
// -----------------------------------------------------------------------------
// `colors.ts` était un objet `as const`, et le type des jetons s'en déduisait.
// Quatre palettes ne peuvent pas se déduire de cette façon : il faut un
// **contrat** que les quatre remplissent, sinon la troisième oublierait un jeton
// et l'écran qui le lit recevrait `undefined` — un `color: undefined` en React
// Native ne lève pas, il retombe silencieusement sur la valeur par défaut. Le
// défaut serait alors « noir sur noir », sans message.
//
// Le contrat est donc nommé, et `tests/theme.test.mjs` vérifie que les quatre
// palettes le remplissent **jeton par jeton** — pas seulement qu'elles ont la
// même longueur.
//
// LES JETONS `primary` ET `primarySurface` NE SONT PAS INTERCHANGEABLES
// ---------------------------------------------------------------------
// Mesuré dans le code : `primary` sert de FOND aux boutons pleins, toujours
// accompagné de `textOnPrimary` ; `primarySurface` sert de fond discret, lu avec
// `primary` **comme couleur de texte**. Les deux couples doivent donc rester
// contrastés dans les quatre palettes, et la palette sombre ne peut pas se
// contenter d'assombrir la verte : sur un fond noir, un `primary` vert sombre
// disparaît. Le thème noir emploie donc un `primary` clair avec un
// `textOnPrimary` sombre — l'inverse des trois thèmes clairs.

export type NomPalette = 'vert' | 'rose' | 'bleu' | 'noir';

export interface Palette {
  // Couleur principale, et ses déclinaisons
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primarySurface: string;

  // Fonds
  background: string;
  surface: string;
  surfaceVariant: string;
  /**
   * Le papier du moushaf : le fond sur lequel est posée la page imprimée.
   *
   * Il vaut blanc dans les QUATRE palettes, thème noir compris, et ce n'est pas
   * un oubli. Les pages sont des PNG à palette dont l'unique index transparent
   * est le blanc (mesuré : `tRNS` de longueur 1, valeur 0) ; l'encre est opaque
   * et se dessine par-dessus. Sur un fond sombre, une encre `#000000` posée sur
   * `#191A1E` devient illisible, et l'inverser reviendrait à modifier la page —
   * ce que la spécification interdit. Une page de moushaf est donc blanche, dans
   * tous les thèmes : c'est ce qu'elle est.
   */
  papier: string;

  // Touches secondaires
  beige: string;
  beigeLight: string;
  beigeDark: string;

  // Accents
  gold: string;
  goldLight: string;
  goldDark: string;

  // Texte
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnPrimary: string;
  textOnDark: string;

  // États
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  error: string;
  errorLight: string;
  info: string;
  infoLight: string;

  // Bordures
  border: string;
  borderLight: string;

  // Niveaux de maîtrise
  masteryPerfect: string;
  masteryGood: string;
  masteryHesitant: string;
  masteryPoor: string;
  masteryRelearn: string;

  // Graphe de progression
  chartPrimary: string;
  chartSecondary: string;
  chartTertiary: string;
}

/** Vert profond, blanc cassé, beige, doré discret — la palette d'origine. */
const VERT: Palette = {
  primary: '#0B4D3B',
  primaryLight: '#1A6B52',
  primaryDark: '#063026',
  primarySurface: '#E8F0EC',

  background: '#FAF8F4',
  surface: '#FFFFFF',
  papier: '#FFFFFF',
  surfaceVariant: '#F5F2EC',

  beige: '#E8DFD0',
  beigeLight: '#F0EBE0',
  beigeDark: '#D4C9B5',

  gold: '#C4A35A',
  goldLight: '#D4B876',
  goldDark: '#A88842',

  textPrimary: '#1A1A1A',
  textSecondary: '#5C5C5C',
  textTertiary: '#8E8E8E',
  textOnPrimary: '#FFFFFF',
  textOnDark: '#FAF8F4',

  success: '#2E7D32',
  successLight: '#E8F5E9',
  warning: '#ED6C02',
  warningLight: '#FFF3E0',
  error: '#C62828',
  errorLight: '#FFEBEE',
  info: '#0277BD',
  infoLight: '#E1F5FE',

  border: '#E0DDD7',
  borderLight: '#EFECE6',

  masteryPerfect: '#2E7D32',
  masteryGood: '#66BB6A',
  masteryHesitant: '#FFA726',
  masteryPoor: '#EF5350',
  masteryRelearn: '#C62828',

  chartPrimary: '#0B4D3B',
  chartSecondary: '#C4A35A',
  chartTertiary: '#1A6B52',
};

/**
 * Rose profond. Le vert disparaît entièrement : `primary`, `primarySurface` et
 * les deux courbes du graphe passent au rose, sans laisser de vert résiduel.
 * Le doré est conservé — c'est un accent neutre, et il tient sur le rose.
 */
const ROSE: Palette = {
  primary: '#8C2F52',
  primaryLight: '#B0476E',
  primaryDark: '#6B203C',
  primarySurface: '#FBEAF0',

  background: '#FDF9FA',
  surface: '#FFFFFF',
  papier: '#FFFFFF',
  surfaceVariant: '#F9F1F4',

  beige: '#EFDCE3',
  beigeLight: '#F7ECF0',
  beigeDark: '#DCC3CD',

  gold: '#C4A35A',
  goldLight: '#D4B876',
  goldDark: '#A88842',

  textPrimary: '#1A1A1A',
  textSecondary: '#5C5C5C',
  textTertiary: '#8E8E8E',
  textOnPrimary: '#FFFFFF',
  textOnDark: '#FDF9FA',

  success: '#2E7D32',
  successLight: '#E8F5E9',
  warning: '#ED6C02',
  warningLight: '#FFF3E0',
  error: '#C62828',
  errorLight: '#FFEBEE',
  info: '#0277BD',
  infoLight: '#E1F5FE',

  border: '#E7DCDF',
  borderLight: '#F2EAED',

  masteryPerfect: '#2E7D32',
  masteryGood: '#66BB6A',
  masteryHesitant: '#FFA726',
  masteryPoor: '#EF5350',
  masteryRelearn: '#C62828',

  chartPrimary: '#8C2F52',
  chartSecondary: '#C4A35A',
  chartTertiary: '#B0476E',
};

/** Bleu profond. Même construction : le vert cède la place au bleu. */
const BLEU: Palette = {
  primary: '#12406E',
  primaryLight: '#1E5F9E',
  primaryDark: '#0B2A4A',
  primarySurface: '#E7EFF8',

  background: '#F8FAFD',
  surface: '#FFFFFF',
  papier: '#FFFFFF',
  surfaceVariant: '#EFF4FA',

  beige: '#DCE6F0',
  beigeLight: '#EBF1F8',
  beigeDark: '#C3D2E2',

  gold: '#C4A35A',
  goldLight: '#D4B876',
  goldDark: '#A88842',

  textPrimary: '#1A1A1A',
  textSecondary: '#5C5C5C',
  textTertiary: '#8E8E8E',
  textOnPrimary: '#FFFFFF',
  textOnDark: '#F8FAFD',

  success: '#2E7D32',
  successLight: '#E8F5E9',
  warning: '#ED6C02',
  warningLight: '#FFF3E0',
  error: '#C62828',
  errorLight: '#FFEBEE',
  info: '#0277BD',
  infoLight: '#E1F5FE',

  border: '#DDE4EC',
  borderLight: '#EBF0F6',

  masteryPerfect: '#2E7D32',
  masteryGood: '#66BB6A',
  masteryHesitant: '#FFA726',
  masteryPoor: '#EF5350',
  masteryRelearn: '#C62828',

  chartPrimary: '#12406E',
  chartSecondary: '#C4A35A',
  chartTertiary: '#1E5F9E',
};

/**
 * Noir — un vrai thème sombre, et non la palette verte assombrie.
 *
 * Trois renversements, et chacun se justifie par un usage mesuré dans le code :
 *
 *  - `primary` devient CLAIR et `textOnPrimary` SOMBRE. Les boutons pleins
 *    restent donc lisibles — un libellé sombre sur un fond clair — là où un
 *    `primary` sombre sur un fond noir aurait donné un bouton invisible.
 *  - `primarySurface` devient un vert très sombre, puisque c'est le fond sur
 *    lequel `primary` sert de couleur de texte (le nom du profil, la barre de
 *    plage, le bouton « À renforcer »).
 *  - les fonds « clairs » des états — `successLight`, `warningLight`,
 *    `errorLight`, `infoLight` — deviennent des fonds sombres teintés, lus avec
 *    la couleur d'état correspondante, désormais claire.
 *
 * Le doré s'éclaircit, sinon il s'éteint sur le noir.
 */
const NOIR: Palette = {
  primary: '#6FD3A6',
  primaryLight: '#8FE0BC',
  primaryDark: '#4FB98C',
  primarySurface: '#15251F',

  background: '#0E0E11',
  surface: '#191A1E',
  // Blanc, comme les trois autres : la page est une image de papier blanc dont
  // le seul index transparent est le blanc, et son encre est opaque. Voir la
  // déclaration de `papier` dans `Palette`.
  papier: '#FFFFFF',
  surfaceVariant: '#22242A',

  beige: '#2A2C33',
  beigeLight: '#33363E',
  beigeDark: '#1F2126',

  gold: '#D9BE7E',
  goldLight: '#E7D2A0',
  goldDark: '#B39A5C',

  textPrimary: '#F2F1EE',
  textSecondary: '#B6B5B0',
  textTertiary: '#8B8A86',
  textOnPrimary: '#07201A',
  textOnDark: '#F2F1EE',

  success: '#7BD07F',
  successLight: '#1C2E1E',
  warning: '#FFB74D',
  warningLight: '#33280F',
  error: '#FF8A80',
  errorLight: '#331B1B',
  info: '#6EC8F5',
  infoLight: '#122A36',

  border: '#2E3038',
  borderLight: '#26282E',

  masteryPerfect: '#7BD07F',
  masteryGood: '#9CCC65',
  masteryHesitant: '#FFB74D',
  masteryPoor: '#FF8A80',
  masteryRelearn: '#E57373',

  chartPrimary: '#6FD3A6',
  chartSecondary: '#D9BE7E',
  chartTertiary: '#4FB98C',
};

export const PALETTES: Record<NomPalette, Palette> = {
  vert: VERT,
  rose: ROSE,
  bleu: BLEU,
  noir: NOIR,
};

/**
 * L'ordre d'affichage dans les réglages, et le libellé français de chacun.
 *
 * Écrit ici, à côté des palettes, pour qu'ajouter une palette oblige à lui
 * donner un nom lisible : un `Record<NomPalette, string>` incomplet ne compile
 * pas.
 */
export const LIBELLES_PALETTES: Record<NomPalette, string> = {
  vert: 'Vert',
  rose: 'Rose',
  bleu: 'Bleu',
  noir: 'Noir',
};

/** L'ordre offert dans les réglages : le vert d'abord, c'est le défaut. */
export const ORDRE_PALETTES: NomPalette[] = ['vert', 'rose', 'bleu', 'noir'];

export const PALETTE_PAR_DEFAUT: NomPalette = 'vert';

/**
 * Les palettes sombres. Elles ne changent pas les jetons : elles changent la
 * barre d'état du téléphone, dont le texte doit rester lisible sur le fond.
 */
const PALETTES_SOMBRES: NomPalette[] = ['noir'];

export function estPaletteSombre(nom: NomPalette): boolean {
  return PALETTES_SOMBRES.includes(nom);
}

/**
 * Vrai si la valeur lue dans le stockage désigne une palette connue.
 *
 * Nécessaire parce que ce qui revient du disque n'est pas typé : une version
 * antérieure, une écriture interrompue ou une main étrangère peuvent y laisser
 * n'importe quoi. Sans ce filtre, `PALETTES[valeur]` vaudrait `undefined` et
 * l'application s'ouvrirait sans couleurs.
 */
export function estNomPalette(valeur: unknown): valeur is NomPalette {
  return typeof valeur === 'string' && Object.prototype.hasOwnProperty.call(PALETTES, valeur);
}
