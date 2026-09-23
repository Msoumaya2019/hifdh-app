// Design system - Couleurs
//
// `colors` reste un OBJET UNIQUE, lu partout dans l'application : les icônes
// (`color={colors.primary}`), les styles écrits en ligne, les accessoires de
// `TextInput`. Il n'est plus figé par `as const` : il est **stable et mutable**,
// et `applyPalette` recopie dedans les jetons de la palette choisie.
//
// POURQUOI CE DÉTOUR PLUTÔT QUE LIRE LA PALETTE DU CONTEXTE PARTOUT
// -----------------------------------------------------------------
// Mesuré avant d'écrire : les jetons sont lus à plus de cent endroits, dont
// beaucoup en dehors de tout composant — une table de constantes au niveau du
// module, par exemple. Y injecter un contexte aurait demandé de transformer
// chacun de ces endroits, et le moindre oubli aurait rendu une couleur figée
// sur l'ancienne palette, sans erreur ni message.
//
// Les styles, eux, sont fabriqués au rendu (voir `useStyles`) : ils lisent donc
// cet objet au moment où il est juste. Les deux lectures s'accordent parce que
// le fournisseur applique la palette **pendant le rendu** — voir
// `ThemeProvider.tsx` pour la raison.
//
// Ce fichier ne connaît qu'une chose : quel jeu de jetons est en vigueur. Le
// choix de la palette, sa persistance et son contexte vivent dans
// `ThemeProvider.tsx`.

import { PALETTE_PAR_DEFAUT, PALETTES, type NomPalette, type Palette } from './palettes';

export type { NomPalette, Palette };

/** Le nom des jetons, pour qui veut typer une couleur sans typer sa valeur. */
export type Color = keyof Palette;

/**
 * Les jetons en vigueur.
 *
 * Ne jamais le remplacer (`colors = …`) : les modules qui l'importent gardent la
 * référence qu'ils ont reçue au chargement. On le **modifie**.
 */
export const colors: Palette = { ...PALETTES[PALETTE_PAR_DEFAUT] };

/** La palette en vigueur, telle qu'elle a été appliquée. */
let nomCourant: NomPalette = PALETTE_PAR_DEFAUT;

/**
 * Applique une palette à `colors`, sur place.
 *
 * Idempotent : l'appeler deux fois avec la même palette donne le même objet. Ce
 * n'est pas un détail — le fournisseur l'appelle à chaque rendu, et un rendu
 * peut être rejoué.
 */
export function applyPalette(palette: Palette): void {
  Object.assign(colors, palette);
}

/** Applique une palette par son nom. Un nom inconnu ne change rien. */
export function applyPaletteNommee(nom: NomPalette): void {
  applyPalette(PALETTES[nom]);
  nomCourant = nom;
}

/** Le nom de la palette en vigueur. */
export function nomPaletteCourante(): NomPalette {
  return nomCourant;
}
