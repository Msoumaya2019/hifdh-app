// Le thème : quel jeu de couleurs est en vigueur, et comment en changer.
//
// Deux lectures coexistent, et c'est délibéré :
//
//  - `useColors()` rend la **palette** en vigueur. Sa référence ne change que
//    lorsque l'utilisateur change de thème : elle peut donc figurer dans une
//    liste de dépendances sans faire recalculer un `useMemo` à chaque rendu.
//  - l'objet `colors` de `./colors` est **modifié sur place**. C'est lui que
//    lisent les styles fabriqués par `useStyles`, et les cent et quelques usages
//    écrits en ligne dans le JSX.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyPaletteNommee } from './colors';
import {
  estNomPalette,
  PALETTES,
  PALETTE_PAR_DEFAUT,
  type NomPalette,
  type Palette,
} from './palettes';

/**
 * La clé de la préférence.
 *
 * Dans `AsyncStorage`, et non dans le stockage sécurisé : ce n'est pas un
 * secret, et `expo-secure-store` refuse les clés qui sortent de
 * `[A-Za-z0-9._-]` — le point y est admis, mais la raison de fond est qu'une
 * palette n'a rien à faire dans un trousseau.
 */
export const CLE_THEME = 'hifdh.theme';

export interface Theme {
  nom: NomPalette;
  palette: Palette;
  changerTheme: (nom: NomPalette) => void;
}

const Contexte = createContext<Theme | null>(null);

export function ThemeProvider({
  children,
  nomInitial = PALETTE_PAR_DEFAUT,
}: {
  children: ReactNode;
  nomInitial?: NomPalette;
}) {
  const [nom, setNom] = useState<NomPalette>(nomInitial);
  const palette = PALETTES[nom];

  // Appliqué PENDANT le rendu, et non dans un effet.
  //
  // C'est le point délicat de tout le dispositif, et il se voit à l'usage : les
  // styles sont fabriqués au rendu, à partir de `palette`, tandis que les
  // `color={colors.primary}` écrits en ligne lisent l'objet du module. Un effet
  // s'exécuterait APRÈS le rendu des enfants : pendant une image, les styles
  // seraient de la nouvelle palette et les icônes de l'ancienne — et comme un
  // effet ne re-rend rien, elles y resteraient jusqu'au prochain changement
  // d'état, c'est-à-dire indéfiniment.
  //
  // L'appel est idempotent : rejouer un rendu recopie les mêmes valeurs.
  applyPaletteNommee(nom);

  const changerTheme = useCallback((suivant: NomPalette) => {
    setNom(suivant);
    // L'écriture ne conditionne pas l'affichage : la palette change tout de
    // suite, et si l'enregistrement échoue, seule la préférence pour la
    // prochaine ouverture est perdue. On ne fait donc pas échouer l'action, et
    // on ne laisse pas non plus la promesse rejetée sans être lue.
    AsyncStorage.setItem(CLE_THEME, suivant).catch(() => {});
  }, []);

  const valeur = useMemo<Theme>(
    () => ({ nom, palette, changerTheme }),
    [nom, palette, changerTheme]
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(Contexte);
  if (theme === null) {
    throw new Error(
      'useTheme a été appelé hors du ThemeProvider. Le fournisseur est monté dans app/_layout.tsx.'
    );
  }
  return theme;
}

/** La palette en vigueur, d'une référence stable tant que le thème ne change pas. */
export function useColors(): Palette {
  return useTheme().palette;
}

/**
 * Lit la palette enregistrée, sans jamais lever.
 *
 * Rendue à part du fournisseur parce que l'écran racine doit connaître la
 * palette **avant** le premier rendu : sinon l'application s'ouvrirait en vert
 * puis basculerait sur le thème choisi, ce qui se voit.
 */
export async function lireThemeEnregistre(): Promise<NomPalette> {
  try {
    const enregistre = await AsyncStorage.getItem(CLE_THEME);
    return estNomPalette(enregistre) ? enregistre : PALETTE_PAR_DEFAUT;
  } catch {
    // Une préférence illisible n'empêche pas l'application de s'ouvrir : elle
    // retombe sur la palette par défaut.
    return PALETTE_PAR_DEFAUT;
  }
}
