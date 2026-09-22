// Ce qu'il reste à renforcer
//
// Un passage est « à renforcer » pour l'une de deux raisons :
//
//   - l'apprenant l'a dit lui-même, en marquant « À retravailler » dans le
//     lecteur — c'est le niveau `needs_review` ;
//   - la révision espacée l'a ramené à échéance.
//
// Les deux existaient déjà, mais séparément et sans se rejoindre :
// `needs_review` ne servait qu'à un compteur dans le profil, et les items de
// révision vivaient dans un onglet « Révisions » que l'apprenant ne reliait pas
// à son travail. Pire, un passage marqué « À retravailler » n'était enregistré
// nulle part : le bouton se contentait d'un message, et le passage était oublié
// aussitôt. Les deux sont ici réunis sous un seul mot, celui de l'apprenant.
//
// Ce module ne touche pas à la base : il décide de ce qui doit s'afficher, à
// partir de ce qu'on lui donne. C'est ce qui le rend éprouvable sans appareil.

import type { KnowledgeLevel, MemorizedPassage, ReviewItem, ReviewRating } from '@/types';

/** Pourquoi un passage figure dans « À renforcer ». */
export type OrigineRenforcement = 'marque' | 'revision_prevue';

export interface PassageARenforcer {
  surah: number;
  startAyah: number;
  endAyah: number;
  /** La raison principale. `marque` l'emporte : c'est un mot de l'apprenant. */
  origine: OrigineRenforcement;
  /** L'item de révision espacée de ce passage, s'il en existe un. */
  reviewId?: string;
  niveauSrs?: number;
  prochaineRevision?: string;
}

/** Clé d'un passage : son étendue, qui est ce qui l'identifie en base. */
export function clePassage(passage: {
  surah: number;
  startAyah: number;
  endAyah: number;
}): string {
  return `${passage.surah}:${passage.startAyah}-${passage.endAyah}`;
}

/**
 * Les passages à renforcer, dans l'ordre du moushaf.
 *
 * Un passage marqué **et** dont la révision est due ne figure qu'une fois : il
 * apparaîtrait sinon deux fois à l'écran, et l'apprenant croirait à deux
 * passages distincts. La ligne garde alors son `reviewId`, pour que renforcer
 * ce passage fasse aussi avancer sa révision espacée.
 *
 * `aujourdHui` est un paramètre, et non une lecture de l'horloge : une décision
 * adossée à la date du jour ne s'éprouve pas de façon déterministe.
 */
export function passagesARenforcer(
  memorized: MemorizedPassage[],
  reviews: ReviewItem[],
  aujourdHui: string
): PassageARenforcer[] {
  const parCle = new Map<string, PassageARenforcer>();

  // D'abord les révisions dues, pour que le marquage explicite puisse ensuite
  // les recouvrir — et non l'inverse, qui laisserait deux lignes.
  for (const review of reviews) {
    if (review.nextReviewDate > aujourdHui) continue;
    const cle = clePassage(review);
    parCle.set(cle, {
      surah: review.surah,
      startAyah: review.startAyah,
      endAyah: review.endAyah,
      origine: 'revision_prevue',
      reviewId: review.id,
      niveauSrs: review.level,
      prochaineRevision: review.nextReviewDate,
    });
  }

  for (const passage of memorized) {
    if (passage.level !== 'needs_review') continue;
    const cle = clePassage(passage);
    const existant = parCle.get(cle);
    parCle.set(cle, {
      surah: passage.surah,
      startAyah: passage.startAyah,
      endAyah: passage.endAyah,
      origine: 'marque',
      reviewId: existant?.reviewId,
      niveauSrs: existant?.niveauSrs,
      prochaineRevision: existant?.prochaineRevision,
    });
  }

  return [...parCle.values()].sort(
    (a, b) => a.surah - b.surah || a.startAyah - b.startAyah
  );
}

/** Ce que produit un appui sur « Renforcé » ou « Pas encore ». */
export interface EffetRenforcement {
  /** Le nouveau niveau de connaissance du passage. */
  niveau: KnowledgeLevel;
  /** La note donnée à la révision espacée, qui fixe la prochaine échéance. */
  note: ReviewRating;
}

/**
 * Traduire le geste de l'apprenant en état.
 *
 * « Renforcé » et « Pas encore » sont les deux seules réponses offertes ici.
 * Elles valent `perfect` et `errors` pour la révision espacée : un passage
 * qu'on dit renforcé repart à un jour, un passage qu'on dit « pas encore »
 * retombe au niveau 0 et revient demain. Le barème à quatre notes du SRS
 * demandait un jugement plus fin que l'apprenant n'en porte à ce moment-là.
 */
export function effetRenforcement(renforce: boolean): EffetRenforcement {
  return renforce
    ? { niveau: 'perfect', note: 'perfect' }
    : { niveau: 'needs_review', note: 'errors' };
}
