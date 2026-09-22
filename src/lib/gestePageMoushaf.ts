// Le geste de changement de page dans le mode « page du moushaf ».
//
// POURQUOI CE MODULE EST À PART
// -----------------------------
// Un geste est de la géométrie, et la géométrie se calcule : un seuil de
// déclenchement, un axe dominant, une page bornée. Tout cela se décide sans
// écran, donc s'éprouve sans écran — et c'est exactement ce qu'un geste ne fait
// jamais quand on l'écrit au fond d'un composant, où on le règle à l'œil sur un
// téléphone.
//
// Ce module ne connaît donc ni React, ni le geste lui-même : il reçoit deux
// nombres (le déplacement horizontal et le déplacement vertical) et rend une
// décision. Le composant se contente de lui passer ce que le doigt a fait.
//
// LA RÈGLE DU SENS DE LECTURE
// ---------------------------
// Les pages du moushaf se lisent de droite à gauche : la page 2 est à **droite**
// de la page 1. Un glissement vers la droite — le doigt va vers la droite, le
// contenu suit — doit donc avancer. C'est l'inverse d'un livre occidental, et
// c'est le genre de détail qu'on écrit à l'envers sans s'en apercevoir : d'où le
// test, qui nomme le sens dans les deux langues.

/** Ce qu'un déplacement du doigt décide. */
export type Geste = 'precedente' | 'suivante' | 'aucun';

/** Distance horizontale minimale, en points, pour changer de page. */
export const SEUIL_HORIZONTAL = 60;

/**
 * Part du déplacement total que le vertical ne doit pas dépasser.
 *
 * Le moushaf ne défile pas, mais le conteneur peut en avoir besoin sur un petit
 * écran, et un geste franchement diagonal ne doit pas tourner la page par
 * accident. On exige donc que l'horizontal **domine** : `|dx| > |dy|`.
 *
 * Ce n'est pas un seuil de distance mais un rapport : un doigt qui parcourt
 * 200 px en biais dont 190 px vers le bas n'a pas voulu tourner la page.
 */
export const DOMINANCE_HORIZONTALE = 1;

/**
 * La page voulue après un déplacement, ou `null` si le geste ne décide rien.
 *
 * `page` est la page courante, `total` le nombre de pages. Le résultat est
 * toujours dans les bornes : un geste vers la droite depuis la page 1 rend
 * `null` — il n'y a pas de page 0 — plutôt qu'une page invalide que l'affichage
 * devrait ensuite rattraper.
 */
export function pageApresGeste(
  page: number,
  total: number,
  dx: number,
  dy: number,
  seuil: number = SEUIL_HORIZONTAL
): number | null {
  if (!Number.isFinite(page) || !Number.isFinite(total) || total < 1) return null;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;

  // L'axe dominant décide : un geste vertical est un geste vertical.
  if (Math.abs(dx) <= Math.abs(dy) * DOMINANCE_HORIZONTALE) return null;
  if (Math.abs(dx) < seuil) return null;

  // Vers la droite : on avance, parce que le moushaf se lit de droite à gauche.
  const voulue = dx > 0 ? page + 1 : page - 1;

  if (voulue < 1 || voulue > total) return null;
  return voulue;
}

/**
 * La même décision, dite en un mot.
 *
 * Séparé de `pageApresGeste` parce que le composant, lui, n'a pas besoin de
 * savoir *quelle* page : il annonce « suivante » ou « précédente », et c'est
 * l'appelant qui borne. Les deux fonctions partagent la même règle, et le test
 * vérifie qu'elles ne peuvent pas diverger.
 */
export function gesteDePage(
  dx: number,
  dy: number,
  seuil: number = SEUIL_HORIZONTAL
): Geste {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'aucun';
  if (Math.abs(dx) <= Math.abs(dy) * DOMINANCE_HORIZONTALE) return 'aucun';
  if (Math.abs(dx) < seuil) return 'aucun';
  return dx > 0 ? 'suivante' : 'precedente';
}
