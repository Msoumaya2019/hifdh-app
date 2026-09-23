// Les lignes du moushaf qui portent les versets d'une séance.
//
// POURQUOI CE N'EST PAS DANS LE COMPOSANT
// --------------------------------------
// « Quelles lignes faut-il surligner ? » est une décision, et une décision se
// teste sans appareil. Le composant, lui, ne fait que dessiner le résultat.
//
// CE QU'ON PEUT SURLIGNER, ET CE QU'ON NE PEUT PAS
// -----------------------------------------------
// La page affichée est une **image** de la page imprimée : on ne peut pas y
// colorer des mots. Mais on n'a pas besoin de le pouvoir. La mise en page dit,
// pour chacune des quinze lignes, quels intervalles de mots elle porte
// (`quranData.getLignesDuMoushaf`) : on sait donc exactement quelles lignes
// touchent la séance, et on pose une bande derrière elles.
//
// Le surlignage suit donc la **ligne**, pas le mot. C'est une conséquence de la
// source d'affichage, pas un choix esthétique — et c'est aussi ce qui le rend
// exact : les lignes touchées sont celles que l'imprimeur a données.
//
// UNE LIGNE PARTAGÉE EST TOUCHÉE EN ENTIER
// ----------------------------------------
// Un verset qui commence au milieu d'une ligne la marque entière. Faire
// autrement demanderait de connaître la position horizontale du mot dans
// l'image, donc de mesurer la police de page — précisément ce que le passage
// aux images a rendu inutile. La bande est un repère, pas une découpe : elle
// dit « c'est ici que ça commence et ici que ça finit ».

import { getLignesDuMoushaf, type ElementMoushaf } from '@/data/quranData';

/** Une plage de versets, dans l'ordre du moushaf. */
export interface PlageDeVersets {
  surah: number;
  startAyah: number;
  endAyah: number;
}

/**
 * L'intervalle de jetons d'un verset, tel que la mise en page le décrit.
 *
 * Un verset peut être coupé en plusieurs éléments sur plusieurs lignes : le
 * couple `premier`/`dernier` borne ses mots dans le flot de la sourate. Deux
 * éléments du même verset ne se recouvrent jamais.
 */
function estDansLaPlage(element: ElementMoushaf, plage: PlageDeVersets): boolean {
  if (element.type !== 'verset') return false;
  if (element.surah !== plage.surah) return false;
  return element.ayah >= plage.startAyah && element.ayah <= plage.endAyah;
}

/**
 * Les numéros de ligne (à partir de 1) qui portent une partie de la plage.
 *
 * Rend un ensemble vide quand la page n'est pas décrite, ou quand elle ne porte
 * aucun verset de la plage — jamais `null` : « rien à surligner » et « la page
 * est inconnue » mènent au même dessin, et distinguer les deux ne servirait
 * qu'à ajouter un cas à traiter à l'appelant.
 */
export function lignesDuPassageSurPage(
  page: number,
  plage: PlageDeVersets | null
): number[] {
  if (plage === null) return [];

  const lignes = getLignesDuMoushaf(page);
  if (lignes === null) return [];

  const retenues: number[] = [];
  lignes.forEach((ligne, index) => {
    if (ligne.some((element) => estDansLaPlage(element, plage))) {
      retenues.push(index + 1);
    }
  });
  return retenues;
}

/**
 * Vrai si la plage est entièrement contenue dans cette page.
 *
 * Sert à dire à l'apprenant que la séance continue à la page suivante — sans
 * quoi il croirait la séance finie à la fin de la page affichée, alors que la
 * bande s'arrête simplement à la dernière ligne.
 */
export function plageContenueDansLaPage(page: number, plage: PlageDeVersets | null): boolean {
  if (plage === null) return false;

  const lignes = getLignesDuMoushaf(page);
  if (lignes === null) return false;

  const ayahs = new Set<number>();
  for (const ligne of lignes) {
    for (const element of ligne) {
      if (element.type === 'verset' && element.surah === plage.surah) {
        ayahs.add(element.ayah);
      }
    }
  }

  // Tous les versets de la plage, un par un : un `min`/`max` raterait le cas
  // d'une plage dont les bornes sont là mais dont un verset manque au milieu.
  for (let ayah = plage.startAyah; ayah <= plage.endAyah; ayah += 1) {
    if (!ayahs.has(ayah)) return false;
  }
  return true;
}
