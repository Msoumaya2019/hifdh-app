// La source des images des pages du moushaf.
//
// POURQUOI DES IMAGES, ET NON UNE COMPOSITION
// -------------------------------------------
// Le mode « page » dessinait la page avec la police de page du complexe KFGQPC,
// un mot par point de code. C'était fidèle au caractère près, mais fragile : la
// moindre erreur de mesure déplaçait un mot, une ligne pouvait déborder, et le
// résultat n'était pas *exactement* la page imprimée. Une image de la page
// imprimée, elle, ne peut pas se tromper : c'est la page.
//
// La composition par police reste disponible : rien n'a été supprimé, seul le
// rendu du mode « page » a changé de source. Voir `LecteurPageMoushaf`.
//
// D'OÙ VIENNENT LES IMAGES
// ------------------------
// Quran.com a été essayé en premier, comme demandé. Son API v4 (et la nouvelle
// API de la Quran Foundation) expose le texte, les traductions, l'audio et la
// recherche, mais **aucune image de page** : il n'existe ni champ `image` sur un
// verset, ni ressource « pages ». Les URL d'images du site ne sont pas non plus
// adressables (essayées : 404 ou 403). Quran.com n'est donc pas exploitable
// directement pour les images, et la solution de repli s'applique.
//
// La source retenue est un jeu de 604 images du moushaf de Madine (narration
// Hafs 'an Asim), servi par un CDN. Deux propriétés ont été **vérifiées**, et
// non supposées :
//
//   - les 604 pages existent, sans trou (1..604, aucune manquante) ;
//   - c'est bien l'édition que le projet mesure déjà : la page 177 en image
//     porte 15 lignes, le juz' 9 en marge, la sourate Al-Anfal, et son rapport
//     hauteur/largeur vaut 1,656 — à comparer au `hauteurDuBloc` de 1,664
//     relevé sur l'imprimé dans `quranData`.
//
// CHANGER DE SOURCE PLUS TARD
// ---------------------------
// Tout passe par `getMushafPageImage`. Changer de fournisseur se fait en
// modifiant `SOURCE_PAGES` (son `gabarit`, et `nombreDePages` si le nouveau jeu
// n'en compte pas 604) : rien d'autre dans l'application ne connaît l'URL.

/**
 * La source des images. Un seul endroit à modifier pour en changer.
 *
 * `gabarit` reçoit le numéro de page et rend l'URL. Le CDN retenu (jsDelivr)
 * sert le même octet que la source brute, avec un cache long et un en-tête
 * `image/jpeg` : c'est ce qui rend les pages rapides à charger la première fois,
 * et gratuites ensuite — l'application garde en plus sa propre copie locale
 * (voir `cachePagesMoushaf`).
 */
export const SOURCE_PAGES = {
  nom: 'Moushaf de Madine — 604 pages, Hafs \u2018an Asim',
  gabarit: (page: number) =>
    `https://cdn.jsdelivr.net/gh/Zohanur2026/zohanur-mushaf-pages-hafs@main/${page}.jpg`,
  /** Nombre de pages du moushaf imprimé. Un entier fixe : le moushaf en a 604. */
  nombreDePages: 604,
} as const;

/**
 * Le rapport hauteur/largeur d'une page, quand on ne l'a pas encore mesurée.
 *
 * Les pages de ce moushaf sont presque toutes au même format (relevé : 1,647 à
 * 1,656 selon la page). La page 1 fait exception — c'est un frontispice orné,
 * plus court (1,349) — d'où la table d'exceptions plutôt qu'une constante
 * unique : une page d'ouverture affichée à 1,65 laisserait de larges bandes.
 *
 * Cette valeur ne sert qu'à **réserver la place** avant l'arrivée de l'image.
 * Dès que l'image est chargée, c'est son rapport réel qui est utilisé.
 */
export const RATIO_PAGE_PAR_DEFAUT = 1.65;

/** Pages dont le rapport diffère du format courant. Relevé sur les images. */
const RATIOS_CONNUS: Record<number, number> = {
  1: 1.3489, // frontispice de la Fatiha
  2: 1.3489, // même ouverture ornée
};

/** Le rapport hauteur/largeur à réserver pour une page, avant chargement. */
export function getRatioPage(page: number): number {
  return RATIOS_CONNUS[page] ?? RATIO_PAGE_PAR_DEFAUT;
}

/**
 * L'URL de l'image d'une page du moushaf.
 *
 * Fonction centralisée, comme demandé : c'est le **seul** point de contact de
 * l'application avec la source des images. Rend `null` pour une page hors
 * bornes, plutôt que de fabriquer une URL qui répondrait 404.
 */
export function getMushafPageImage(page: number): string | null {
  if (!Number.isInteger(page)) return null;
  if (page < 1 || page > SOURCE_PAGES.nombreDePages) return null;
  return SOURCE_PAGES.gabarit(page);
}

/** Vrai si le numéro de page désigne une page du moushaf. */
export function pageValide(page: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= SOURCE_PAGES.nombreDePages;
}

/** Ramener un numéro quelconque dans les bornes du moushaf. */
export function pageBornee(page: number): number {
  if (!Number.isFinite(page)) return 1;
  const entiere = Math.round(page);
  if (entiere < 1) return 1;
  if (entiere > SOURCE_PAGES.nombreDePages) return SOURCE_PAGES.nombreDePages;
  return entiere;
}
