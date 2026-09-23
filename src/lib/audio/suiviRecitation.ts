// Le suivi de la récitation : quelle page montrer, et quand.
//
// POURQUOI CETTE DÉCISION EST ICI, ET NON DANS L'ÉCRAN
// ---------------------------------------------------
// « Faut-il tourner la page ? » a trois réponses possibles — oui, non, et « on
// ne sait pas où est ce verset » — et chacune se manifeste différemment à
// l'écran. Écrite dans un `useEffect`, elle se rejouerait à chaque rendu et
// ferait tourner la page sous le doigt de l'utilisateur. Écrite ici, elle est
// une fonction pure : un état entre, une page sort, et on l'éprouve sans
// appareil.
//
// LA PAGE QUI PORTE UN VERSET VIENT DE LA MISE EN PAGE
// ----------------------------------------------------
// `getPageOfAyah` lit la table des pages du moushaf — celle qui a servi à
// découper le texte en 604 pages. Le suivi ne devine donc rien : il demande où
// le verset a été **imprimé**.
//
// POURQUOI IL N'Y A PAS DE DÉFILEMENT À L'INTÉRIEUR D'UNE PAGE
// ------------------------------------------------------------
// La spécification demande un défilement automatique « y compris le changement
// de page ». Dans ce lecteur, la page est affichée **entière**, mise à
// l'échelle pour tenir dans l'écran : ses quinze lignes sont visibles d'un seul
// regard, et il n'y a donc rien à faire défiler. Le seul déplacement possible
// est le changement de page, et c'est celui que ce module décide. Si l'affichage
// passait un jour à un zoom qui fait déborder la page, c'est ici qu'ajouterait
// le calcul de la ligne à amener à l'écran — et non dans le composant.
//
// LE SUIVI NE SE DÉSACTIVE PAS TOUT SEUL
// --------------------------------------
// Feilleter à la main ne coupe pas le suivi : l'utilisateur peut regarder une
// autre page, et la récitation le ramènera au verset récité à l'étape suivante.
// Couper le suivi sur un feuilletage ferait qu'un simple coup d'œil en arrière
// l'obligerait à le réactiver — un geste qu'il n'a pas demandé. Le bouton est
// donc le SEUL à changer ce réglage, comme le demande la spécification.

import { getPageOfAyah } from '@/data/quranData';
import type { RefVerset } from './plan';

/** La page du moushaf qui porte un verset, ou `null` si elle est inconnue. */
export function pageDuVerset(surah: number, ayah: number): number | null {
  return getPageOfAyah(surah, ayah);
}

export interface DemandeSuivi {
  /** Le réglage « Suivi automatique ». S'il est faux, rien ne bouge. */
  suiviAuto: boolean;
  /** La page actuellement affichée. */
  pageAffichee: number;
  /** Le verset en cours de récitation, ou `null` si rien ne joue. */
  actif: RefVerset | null;
}

/**
 * La page à afficher pour suivre la récitation, ou `null` s'il ne faut rien
 * changer.
 *
 * Rend `null` dans trois cas, et les trois veulent dire « ne touche à rien » :
 * le suivi est coupé, rien ne joue, ou le verset est déjà sur la page affichée.
 * Le dernier cas n'est pas une optimisation : rappeler `onAllerA` avec la page
 * courante remettrait le composant dans un état qu'il a déjà, et une
 * navigation superflue sur une page qu'on est en train de feuilleter se voit.
 */
export function pageASuivre(demande: DemandeSuivi): number | null {
  if (!demande.suiviAuto) return null;
  if (demande.actif === null) return null;

  const page = pageDuVerset(demande.actif.surah, demande.actif.ayah);
  if (page === null) return null;
  if (page === demande.pageAffichee) return null;
  return page;
}
