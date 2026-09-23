// `useStyles` : fabriquer les styles du rendu à partir de la palette en vigueur.
//
// LE PROBLÈME QUE CE HOOK RÉSOUT
// ------------------------------
// Les quinze fichiers d'écran appelaient `StyleSheet.create` au niveau du
// module. Ces styles étaient donc fabriqués **une fois**, à l'import, avec la
// palette d'alors : changer de thème les laissait tels quels, et l'écran
// gardait ses anciennes couleurs jusqu'au redémarrage.
//
// LE CHOIX, ET CE QU'IL COÛTE
// ---------------------------
// Deux formes étaient possibles. Passer la palette en accessoire à chaque
// composant aurait touché tous les appels ; transformer `styles` en fonction
// (`styles(colors).card`) aurait touché les mille usages un par un. La forme
// retenue — `creerStyles` au niveau du module, `useStyles` dans le composant —
// ne touche que la déclaration des styles et la première ligne du corps des
// composants.
//
// CE QU'IL FAUT NE PAS OUBLIER
// ----------------------------
// `useStyles` est un hook : il s'appelle **inconditionnellement**, en tête du
// corps du composant, avant tout `return`. Un composant qui référence `styles`
// sans l'appeler ne compile pas — ce qui est la garantie recherchée : l'oubli
// est une erreur de compilation, pas une couleur figée découverte à l'écran.

import { useMemo } from 'react';
import { useColors } from './ThemeProvider';
import type { Palette } from './palettes';

/**
 * Fabrique les styles à partir de la palette en vigueur.
 *
 * `fabrique` doit être une fonction **stable** — déclarée au niveau du module,
 * sous la forme `const creerStyles = (colors: Palette) => StyleSheet.create({…})`.
 * Une fonction recréée à chaque rendu ferait recalculer les styles à chaque
 * rendu : sans erreur, mais sans profit.
 */
export function useStyles<T>(fabrique: (colors: Palette) => T): T {
  const palette = useColors();
  return useMemo(() => fabrique(palette), [fabrique, palette]);
}
